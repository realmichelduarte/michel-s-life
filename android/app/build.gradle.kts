plugins {
    id("com.android.application")
}

val uploadKeystorePath = System.getenv("ANDROID_UPLOAD_KEYSTORE_PATH")
val uploadStorePassword = System.getenv("ANDROID_UPLOAD_STORE_PASSWORD")
val uploadKeyAlias = System.getenv("ANDROID_UPLOAD_KEY_ALIAS")
val uploadKeyPassword = System.getenv("ANDROID_UPLOAD_KEY_PASSWORD")

// Direct-distribution APKs must use a persistent owner-controlled key, NEVER the
// runner-generated Android debug certificate. Play upload signing is separate.
val directKeystorePath = System.getenv("ANDROID_DIRECT_KEYSTORE_PATH")
val directStorePassword = System.getenv("ANDROID_DIRECT_STORE_PASSWORD")
val directKeyAlias = System.getenv("ANDROID_DIRECT_KEY_ALIAS")
val directKeyPassword = System.getenv("ANDROID_DIRECT_KEY_PASSWORD")

android {
    namespace = "com.michelslab.michelslife"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.michelslab.michelslife"
        minSdk = 26
        targetSdk = 36
        versionCode = 5
        versionName = "0.2.3"
    }

    signingConfigs {
        if (!uploadKeystorePath.isNullOrBlank() &&
            !uploadStorePassword.isNullOrBlank() &&
            !uploadKeyAlias.isNullOrBlank() &&
            !uploadKeyPassword.isNullOrBlank()) {
            create("playUpload") {
                storeFile = file(uploadKeystorePath)
                storePassword = uploadStorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword
            }
        }
        if (!directKeystorePath.isNullOrBlank() &&
            !directStorePassword.isNullOrBlank() &&
            !directKeyAlias.isNullOrBlank() &&
            !directKeyPassword.isNullOrBlank()) {
            create("directDistribution") {
                storeFile = file(directKeystorePath)
                storePassword = directStorePassword
                keyAlias = directKeyAlias
                keyPassword = directKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("playUpload")?.let { signingConfig = it }
        }
        create("directRelease") {
            initWith(getByName("release"))
            matchingFallbacks += listOf("release")
            isDebuggable = false
            // Do NOT inherit the Play upload key; a direct APK has its own
            // independently pinned signing identity. Missing key = unsigned
            // build (CI must reject it), never a debug-signed fallback.
            signingConfig = signingConfigs.findByName("directDistribution")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.16.0")
    implementation("com.google.android.gms:play-services-auth:22.0.0")
    implementation("com.squareup.okhttp3:okhttp:5.4.0")
}
