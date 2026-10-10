package com.michelslab.michelslife

import android.content.Context
import android.os.Build
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit

data class CloudFileInfo(
    val id: String,
    val name: String,
    val modifiedTime: Instant?,
    val contentHash: String,
    val sourceDeviceId: String,
    val sourceUpdatedAt: Instant?,
    val size: Long,
    val appProperties: JSONObject
)

data class CloudMeta(
    var deviceId: String,
    var account: String = "",
    var lastSyncedHash: String = "",
    var lastSyncedAt: Instant? = null,
    var lastCloudModifiedAt: Instant? = null,
    var lastLocalDirtyAt: Instant? = null
)

class CloudMetaStore(context: Context) {
    private val prefs = context.getSharedPreferences("michels_life_cloud_meta", Context.MODE_PRIVATE)

    fun load(): CloudMeta {
        val device = prefs.getString("deviceId", null) ?: UUID.randomUUID().toString().replace("-", "").also {
            prefs.edit().putString("deviceId", it).apply()
        }
        return CloudMeta(
            deviceId = device,
            account = prefs.getString("account", "") ?: "",
            lastSyncedHash = prefs.getString("lastSyncedHash", "") ?: "",
            lastSyncedAt = parseInstant(prefs.getString("lastSyncedAt", null)),
            lastCloudModifiedAt = parseInstant(prefs.getString("lastCloudModifiedAt", null)),
            lastLocalDirtyAt = parseInstant(prefs.getString("lastLocalDirtyAt", null))
        )
    }

    fun save(meta: CloudMeta) {
        prefs.edit()
            .putString("deviceId", meta.deviceId)
            .putString("account", meta.account)
            .putString("lastSyncedHash", meta.lastSyncedHash)
            .putString("lastSyncedAt", meta.lastSyncedAt?.toString())
            .putString("lastCloudModifiedAt", meta.lastCloudModifiedAt?.toString())
            .putString("lastLocalDirtyAt", meta.lastLocalDirtyAt?.toString())
            .apply()
    }

    fun markDirty(at: Instant) {
        val meta = load()
        meta.lastLocalDirtyAt = at
        save(meta)
    }

    fun acceptRestore(hash: String, remoteModifiedAt: Instant?) {
        val meta = load()
        meta.lastSyncedHash = hash
        meta.lastSyncedAt = Instant.now()
        meta.lastCloudModifiedAt = remoteModifiedAt
        meta.lastLocalDirtyAt = null
        save(meta)
    }

    fun resetForDisconnect() {
        val device = load().deviceId
        prefs.edit().clear().putString("deviceId", device).apply()
    }

    private fun parseInstant(raw: String?): Instant? = try {
        if (raw.isNullOrBlank()) null else Instant.parse(raw)
    } catch (_: Exception) { null }
}

class DriveCloudEngine(
    private val context: Context,
    private val metaStore: CloudMetaStore
) {
    companion object {
        const val DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata"
        const val CLOUD_FILE_NAME = "michels_life_cloud_state.json"
        const val CLOUD_BACKUP_PREFIX = "michels_life_backup_"
        const val DEVICE_FILE_PREFIX = "michels_life_device_"
        const val CLOUD_BACKUP_LIMIT = 10
        const val ANDROID_VERSION = "0.2.3"
    }

    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build()

    fun fetchUserEmail(accessToken: String): String {
        val request = Request.Builder()
            .url("https://www.googleapis.com/oauth2/v3/userinfo")
            .header("Authorization", "Bearer " + accessToken)
            .get()
            .build()
        val body = execute(request)
        return JSONObject(body).optString("email", "")
    }

    fun status(account: String): JSONObject {
        val meta = metaStore.load()
        return JSONObject()
            .put("hasCredentials", true)
            .put("connected", account.isNotBlank())
            .put("cloudReady", account.isNotBlank())
            .put("account", account)
            .put("credentialProject", "Michel's Life Android")
            .put("storageFolder", "Google Drive appDataFolder")
            .put("cloudLastSync", meta.lastSyncedAt?.toString() ?: "")
            .put("deviceId", meta.deviceId)
            .put("deviceName", deviceName())
    }

    fun sync(accessToken: String, account: String, backupJson: String, localChangedAtRaw: String?, modeRaw: String): JSONObject {
        validateBackup(backupJson)
        val localChangedAt = parseInstant(localChangedAtRaw)
        if (localChangedAt != null) metaStore.markDirty(localChangedAt)

        var meta = metaStore.load()
        if (meta.account.isNotBlank() && account.isNotBlank() && !meta.account.equals(account, true)) {
            meta = CloudMeta(deviceId = UUID.randomUUID().toString().replace("-", ""), account = account)
        }
        if (account.isNotBlank()) meta.account = account
        metaStore.save(meta)

        val localHash = hashText(backupJson)
        val remote = findCloudFile(accessToken)
        val mode = modeRaw.trim().lowercase()

        if (mode == "upload") {
            if (remote != null && !remote.contentHash.equals(localHash, true)) {
                createHistoryBackup(accessToken, remote, "before_manual_upload")
            }
            val uploaded = uploadCloudFile(accessToken, remote?.id, backupJson, localHash, meta.deviceId, Instant.now())
            commitUploaded(meta, localHash, uploaded)
            touchDevice(accessToken, metaStore.load(), "uploaded")
            return result("uploaded", localHash, uploaded, null, false, "This device was uploaded to Google Drive.")
        }

        if (mode == "download") {
            if (remote == null) throw IllegalStateException("No Michel's Life cloud save exists in this Google account yet.")
            val downloaded = downloadCloudFile(accessToken, remote)
            touchDevice(accessToken, meta, "download_requested")
            return result("downloaded", downloaded.second, remote, downloaded.first, true, "Cloud data is ready to restore on Android.")
        }

        if (remote == null) {
            val created = uploadCloudFile(accessToken, null, backupJson, localHash, meta.deviceId, Instant.now())
            commitUploaded(meta, localHash, created)
            touchDevice(accessToken, metaStore.load(), "created")
            return result("created", localHash, created, null, false, "First cloud save created from Android.")
        }

        var remoteHash = remote.contentHash
        var remoteContent: String? = null
        if (remoteHash.isBlank()) {
            val downloaded = downloadCloudFile(accessToken, remote)
            remoteContent = downloaded.first
            remoteHash = downloaded.second
        }

        if (meta.lastSyncedHash.isBlank()) {
            if (meta.lastLocalDirtyAt != null) {
                return conflict(localHash, remoteHash, remote, meta.lastLocalDirtyAt,
                    "This Android device has unsynced edits and an existing cloud save was found. Choose Keep this device or Use cloud.")
            }
            if (remoteContent == null) remoteContent = downloadCloudFile(accessToken, remote).first
            return result("downloaded", remoteHash, remote, remoteContent, true,
                "Existing cloud save found. Android will restore it before uploading anything.")
        }

        val localChanged = !localHash.equals(meta.lastSyncedHash, true)
        val remoteChanged = !remoteHash.equals(meta.lastSyncedHash, true)

        if (!localChanged && !remoteChanged) {
            meta.lastSyncedAt = Instant.now()
            metaStore.save(meta)
            touchDevice(accessToken, meta, "noop")
            return result("noop", localHash, remote, null, false, "Android and Google Drive are already identical.")
        }

        if (localChanged && !remoteChanged) {
            createHistoryBackup(accessToken, remote, "before_auto_upload")
            val uploaded = uploadCloudFile(accessToken, remote.id, backupJson, localHash, meta.deviceId, Instant.now())
            commitUploaded(meta, localHash, uploaded)
            touchDevice(accessToken, metaStore.load(), "uploaded")
            return result("uploaded", localHash, uploaded, null, false, "Android changes uploaded to Google Drive.")
        }

        if (!localChanged && remoteChanged) {
            if (remoteContent == null) remoteContent = downloadCloudFile(accessToken, remote).first
            return result("downloaded", remoteHash, remote, remoteContent, true, "Newer cloud changes found and ready to restore.")
        }

        val localWhen = meta.lastLocalDirtyAt
        val remoteWhen = remote.sourceUpdatedAt ?: remote.modifiedTime
        if (localWhen != null && remoteWhen != null) {
            if (localWhen.isAfter(remoteWhen.plusSeconds(3))) {
                createHistoryBackup(accessToken, remote, "before_newer_local_upload")
                val uploaded = uploadCloudFile(accessToken, remote.id, backupJson, localHash, meta.deviceId, Instant.now())
                commitUploaded(meta, localHash, uploaded)
                touchDevice(accessToken, metaStore.load(), "uploaded")
                return result("uploaded", localHash, uploaded, null, false, "Both copies changed; Android was newer and was uploaded.")
            }
            if (remoteWhen.isAfter(localWhen.plusSeconds(3))) {
                if (remoteContent == null) remoteContent = downloadCloudFile(accessToken, remote).first
                return result("downloaded", remoteHash, remote, remoteContent, true, "Both copies changed; Google Drive was newer and is ready to restore.")
            }
        }

        return conflict(localHash, remoteHash, remote, localWhen,
            "Both Android and Google Drive changed. Choose Keep this device or Use cloud.")
    }

    fun overview(accessToken: String): JSONObject {
        val meta = metaStore.load()
        val backups = listFiles(accessToken, "name contains '" + CLOUD_BACKUP_PREFIX + "'", 100)
            .sortedByDescending { it.modifiedTime ?: Instant.EPOCH }
            .take(CLOUD_BACKUP_LIMIT)
        val backupJson = JSONArray()
        for (file in backups) {
            backupJson.put(JSONObject()
                .put("fileId", file.id)
                .put("name", file.name)
                .put("createdAt", file.modifiedTime?.toString() ?: "")
                .put("size", file.size)
                .put("hash", file.contentHash)
                .put("reason", file.appProperties.optString("michelsLifeReason", ""))
                .put("sourceDeviceId", file.appProperties.optString("michelsLifeSourceDevice", ""))
                .put("appVersion", file.appProperties.optString("michelsLifeVersion", "")))
        }

        val devices = listFiles(accessToken, "name contains '" + DEVICE_FILE_PREFIX + "'", 100)
        val deviceJson = JSONArray()
        for (file in devices) {
            try {
                deviceJson.put(JSONObject(downloadText(accessToken, file.id)))
            } catch (_: Exception) { }
        }

        return JSONObject()
            .put("backups", backupJson)
            .put("devices", deviceJson)
            .put("currentDeviceId", meta.deviceId)
            .put("currentDeviceName", deviceName())
    }

    fun restoreCloudBackup(accessToken: String, fileId: String): JSONObject {
        val info = getFileById(accessToken, fileId) ?: throw IllegalArgumentException("Cloud backup not found.")
        val content = downloadText(accessToken, info.id)
        validateBackup(content)
        val hash = hashText(content)
        return JSONObject()
            .put("backupJson", content)
            .put("localHash", hash)
            .put("remoteHash", hash)
            .put("remoteModifiedAt", info.modifiedTime?.toString() ?: JSONObject.NULL)
            .put("requiresRestore", true)
            .put("conflict", false)
            .put("action", "downloaded")
    }

    private fun conflict(localHash: String, remoteHash: String, remote: CloudFileInfo, localWhen: Instant?, message: String): JSONObject {
        return JSONObject()
            .put("action", "conflict")
            .put("conflict", true)
            .put("requiresRestore", false)
            .put("localHash", localHash)
            .put("remoteHash", remoteHash)
            .put("remoteModifiedAt", remote.modifiedTime?.toString() ?: JSONObject.NULL)
            .put("localChangedAt", localWhen?.toString() ?: JSONObject.NULL)
            .put("message", message)
    }

    private fun result(action: String, hash: String, remote: CloudFileInfo, content: String?, requiresRestore: Boolean, message: String): JSONObject {
        return JSONObject()
            .put("action", action)
            .put("conflict", false)
            .put("requiresRestore", requiresRestore)
            .put("backupJson", content ?: JSONObject.NULL)
            .put("localHash", hash)
            .put("remoteHash", hash)
            .put("remoteModifiedAt", remote.modifiedTime?.toString() ?: JSONObject.NULL)
            .put("message", message)
    }

    private fun commitUploaded(meta: CloudMeta, hash: String, remote: CloudFileInfo) {
        meta.lastSyncedHash = hash
        meta.lastSyncedAt = Instant.now()
        meta.lastCloudModifiedAt = remote.modifiedTime
        meta.lastLocalDirtyAt = null
        metaStore.save(meta)
    }

    private fun findCloudFile(accessToken: String): CloudFileInfo? {
        return listFiles(accessToken, "name='" + CLOUD_FILE_NAME + "'", 10)
            .sortedByDescending { it.modifiedTime ?: Instant.EPOCH }
            .firstOrNull()
    }

    private fun getFileById(accessToken: String, fileId: String): CloudFileInfo? {
        val url = ("https://www.googleapis.com/drive/v3/files/" + fileId).toHttpUrl().newBuilder()
            .addQueryParameter("fields", "id,name,modifiedTime,size,md5Checksum,appProperties")
            .build()
        val req = Request.Builder().url(url).header("Authorization", "Bearer " + accessToken).get().build()
        return parseFile(JSONObject(execute(req)))
    }

    private fun listFiles(accessToken: String, query: String, pageSize: Int): List<CloudFileInfo> {
        val url = "https://www.googleapis.com/drive/v3/files".toHttpUrl().newBuilder()
            .addQueryParameter("spaces", "appDataFolder")
            .addQueryParameter("q", query + " and 'appDataFolder' in parents and trashed=false")
            .addQueryParameter("pageSize", pageSize.coerceIn(1, 1000).toString())
            .addQueryParameter("orderBy", "modifiedTime desc")
            .addQueryParameter("fields", "files(id,name,modifiedTime,size,md5Checksum,appProperties)")
            .build()
        val req = Request.Builder().url(url).header("Authorization", "Bearer " + accessToken).get().build()
        val arr = JSONObject(execute(req)).optJSONArray("files") ?: JSONArray()
        val out = ArrayList<CloudFileInfo>()
        for (i in 0 until arr.length()) parseFile(arr.optJSONObject(i))?.let(out::add)
        return out
    }

    private fun parseFile(obj: JSONObject?): CloudFileInfo? {
        if (obj == null) return null
        val id = obj.optString("id", "")
        if (id.isBlank()) return null
        val props = obj.optJSONObject("appProperties") ?: JSONObject()
        return CloudFileInfo(
            id = id,
            name = obj.optString("name", CLOUD_FILE_NAME),
            modifiedTime = parseInstant(obj.optString("modifiedTime", "")),
            contentHash = props.optString("michelsLifeHash", ""),
            sourceDeviceId = props.optString("michelsLifeDevice", ""),
            sourceUpdatedAt = parseInstant(props.optString("michelsLifeUpdatedAt", "")),
            size = obj.optLong("size", 0L),
            appProperties = props
        )
    }

    private fun downloadCloudFile(accessToken: String, remote: CloudFileInfo): Pair<String, String> {
        val content = downloadText(accessToken, remote.id)
        validateBackup(content)
        return content to hashText(content)
    }

    private fun downloadText(accessToken: String, fileId: String): String {
        val url = ("https://www.googleapis.com/drive/v3/files/" + fileId).toHttpUrl().newBuilder()
            .addQueryParameter("alt", "media")
            .build()
        val req = Request.Builder().url(url).header("Authorization", "Bearer " + accessToken).get().build()
        return execute(req)
    }

    private fun uploadCloudFile(
        accessToken: String,
        fileId: String?,
        backupJson: String,
        contentHash: String,
        deviceId: String,
        sourceUpdatedAt: Instant
    ): CloudFileInfo {
        val props = JSONObject()
            .put("michelsLifeHash", contentHash)
            .put("michelsLifeDevice", deviceId)
            .put("michelsLifeUpdatedAt", sourceUpdatedAt.toString())
            .put("michelsLifeVersion", "android-" + ANDROID_VERSION)
        return uploadJson(accessToken, fileId, CLOUD_FILE_NAME, backupJson, props)
    }

    private fun uploadJson(accessToken: String, fileId: String?, fileName: String, json: String, props: JSONObject): CloudFileInfo {
        val metadata = JSONObject()
            .put("name", fileName)
            .put("mimeType", "application/json")
            .put("appProperties", props)
        if (fileId.isNullOrBlank()) metadata.put("parents", JSONArray().put("appDataFolder"))

        val boundary = "mlv_android_" + UUID.randomUUID().toString().replace("-", "")
        val bodyText = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
            metadata.toString() +
            "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
            json +
            "\r\n--" + boundary + "--\r\n"

        val base = if (fileId.isNullOrBlank())
            "https://www.googleapis.com/upload/drive/v3/files"
        else
            "https://www.googleapis.com/upload/drive/v3/files/" + fileId
        val url = base.toHttpUrl().newBuilder()
            .addQueryParameter("uploadType", "multipart")
            .addQueryParameter("fields", "id,name,modifiedTime,size,md5Checksum,appProperties")
            .build()
        val media = ("multipart/related; boundary=" + boundary).toMediaType()
        val requestBody = bodyText.toRequestBody(media)
        val builder = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer " + accessToken)
        val req = if (fileId.isNullOrBlank()) builder.post(requestBody).build() else builder.patch(requestBody).build()
        return parseFile(JSONObject(execute(req))) ?: throw IOException("Google Drive did not return uploaded file metadata.")
    }

    private fun createHistoryBackup(accessToken: String, remote: CloudFileInfo, reason: String) {
        try {
            val now = Instant.now()
            if (reason.contains("auto", true) || reason.contains("newer_local", true)) {
                val latest = listFiles(accessToken, "name contains '" + CLOUD_BACKUP_PREFIX + "'", 5)
                    .maxByOrNull { it.modifiedTime ?: Instant.EPOCH }
                if (latest?.modifiedTime != null && Duration.between(latest.modifiedTime, now) < Duration.ofMinutes(5)) return
            }
            val current = downloadCloudFile(accessToken, remote)
            val name = CLOUD_BACKUP_PREFIX + now.toString().replace(":", "").replace("-", "").replace(".", "_") + ".json"
            val props = JSONObject()
                .put("michelsLifeType", "history")
                .put("michelsLifeHash", current.second)
                .put("michelsLifeCreatedAt", now.toString())
                .put("michelsLifeReason", reason)
                .put("michelsLifeSourceDevice", remote.sourceDeviceId)
                .put("michelsLifeVersion", "android-" + ANDROID_VERSION)
            uploadJson(accessToken, null, name, current.first, props)
            pruneBackups(accessToken)
        } catch (_: Exception) { }
    }

    private fun pruneBackups(accessToken: String) {
        val files = listFiles(accessToken, "name contains '" + CLOUD_BACKUP_PREFIX + "'", 100)
            .sortedByDescending { it.modifiedTime ?: Instant.EPOCH }
        for (old in files.drop(CLOUD_BACKUP_LIMIT)) {
            try {
                val req = Request.Builder()
                    .url("https://www.googleapis.com/drive/v3/files/" + old.id)
                    .header("Authorization", "Bearer " + accessToken)
                    .delete()
                    .build()
                execute(req, allowEmpty = true)
            } catch (_: Exception) { }
        }
    }

    private fun touchDevice(accessToken: String, meta: CloudMeta, action: String) {
        try {
            val fileName = DEVICE_FILE_PREFIX + meta.deviceId + ".json"
            val existing = listFiles(accessToken, "name='" + fileName + "'", 10).firstOrNull()
            val now = Instant.now()
            val json = JSONObject()
                .put("DeviceId", meta.deviceId)
                .put("DeviceName", deviceName())
                .put("LastSeenAt", now.toString())
                .put("LastSyncAt", (meta.lastSyncedAt ?: now).toString())
                .put("LastAction", action)
                .put("AppVersion", "android-" + ANDROID_VERSION)
            val props = JSONObject()
                .put("michelsLifeType", "device")
                .put("michelsLifeDeviceId", meta.deviceId)
                .put("michelsLifeDeviceName", deviceName())
                .put("michelsLifeLastSeen", now.toString())
                .put("michelsLifeVersion", "android-" + ANDROID_VERSION)
            uploadJson(accessToken, existing?.id, fileName, json.toString(), props)
        } catch (_: Exception) { }
    }

    private fun validateBackup(raw: String) {
        if (raw.isBlank()) throw IllegalArgumentException("Michel's Life cloud payload is empty.")
        val root = JSONObject(raw)
        val hasState = root.optJSONObject("state") != null
        val hasStorage = root.optJSONObject("localStorage") != null
        if (!hasState && !hasStorage) throw IllegalArgumentException("Cloud JSON does not contain a restorable Michel's Life state.")
    }

    private fun execute(request: Request, allowEmpty: Boolean = false): String {
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("Google API " + response.code + ": " + text.take(600))
            if (!allowEmpty && text.isBlank()) throw IOException("Google API returned an empty response.")
            return text
        }
    }

    private fun hashText(text: String): String {
        return MessageDigest.getInstance("SHA-256")
            .digest(text.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    private fun parseInstant(raw: String?): Instant? = try {
        if (raw.isNullOrBlank()) null else Instant.parse(raw)
    } catch (_: Exception) { null }

    private fun deviceName(): String {
        val maker = Build.MANUFACTURER.orEmpty().trim()
        val model = Build.MODEL.orEmpty().trim()
        return (maker + " " + model).trim().ifBlank { "Android" }
    }
}
