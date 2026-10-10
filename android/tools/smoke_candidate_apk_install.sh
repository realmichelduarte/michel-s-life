#!/usr/bin/env bash
# Install THE Android APK artifact built from the current candidate source,
# launch its true WebView Activity, and drive first-run touch actions.
set -euo pipefail
PKG="com.michelslab.michelslife"
APK="artifacts/candidate/MichelsLife-Android-TEST-v${ANDROID_VERSION}.apk"
OUT="artifacts/candidate-install"
mkdir -p "$OUT"
test -s "$APK"
adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
test -z "$(adb shell pm list packages "$PKG" | tr -d '\r')"
if ! adb install -r "$APK" >"$OUT/install-result.txt" 2>&1; then
  cat "$OUT/install-result.txt"
  adb logcat -d -t 3000 >"$OUT/install-failure-logcat.txt" || true
  echo "::error::Actual current-candidate APK refused fresh Android installation"
  exit 1
fi
cat "$OUT/install-result.txt"
adb shell dumpsys package "$PKG" >"$OUT/package-info.txt"
grep -F "versionName=${ANDROID_VERSION}" "$OUT/package-info.txt"
adb shell am start -W -n "$PKG/.MainActivity" | tee "$OUT/launch-result.txt"
sleep 10
adb shell pidof "$PKG" | tee "$OUT/process-id.txt"
# Do not override emulator WM size/density: physical native WebView surface may
# go blank after a forced display configuration change on API 36.
# Wait until ACTUAL rendered app pixels exist instead of passing a black window.
RENDERED=0
for attempt in 1 2 3 4 5 6 7 8; do
  adb exec-out screencap -p >"$OUT/step0.png"
  if python3 -c 'import pathlib,sys; p=pathlib.Path(sys.argv[1]);d=p.read_bytes();sys.exit(0 if d.startswith(bytes.fromhex("89504e470d0a1a0a")) and len(d)>30000 else 1)' "$OUT/step0.png"; then
    echo "Native Android pixels present at screenshot attempt $attempt"
    RENDERED=1
    break
  fi
  sleep 10
done
if [ "$RENDERED" -ne 1 ]; then
  echo "::error::Activity started, but native Android WebView never rendered meaningful pixels"
  adb logcat -d -t 4000 >"$OUT/native-blank-screen-logcat.txt" || true
  adb shell dumpsys activity activities >"$OUT/activity-diagnostics.txt" || true
  adb shell dumpsys window windows >"$OUT/window-diagnostics.txt" || true
  exit 1
fi
# A non-black *early* frame is NOT proof that WebView completed rendering:
# v0.2.3 produced a cropped giant logo/white slab on the first nonblack image.
# Keep separate later screenshots for pixel review instead of inventing RENDER PASS.
cp "$OUT/step0.png" "$OUT/step0-first-visible.png"
sleep 30
adb exec-out screencap -p >"$OUT/step0-after-30s.png"
sleep 25
adb exec-out screencap -p >"$OUT/step0-after-55s.png"
for frame in "$OUT/step0-after-30s.png" "$OUT/step0-after-55s.png"; do
  python3 -c 'import pathlib,sys;d=pathlib.Path(sys.argv[1]).read_bytes();sys.exit(0 if d.startswith(bytes.fromhex("89504e470d0a1a0a")) and len(d)>30000 else 1)' "$frame"
done
# Accessibility on Android WebView exposes actual screen buttons in XML.
# Record tree first; treat missing accessibility support separately, never
# fabricate an end-to-end tap PASS from source code or emulator startup alone.
adb shell uiautomator dump --compressed /sdcard/michel-candidate-ui.xml >"$OUT/accessibility-dump-output.txt" 2>&1 || true
adb shell cat /sdcard/michel-candidate-ui.xml >"$OUT/step0-hierarchy.xml" 2>/dev/null || true
python3 - <<'PY'
from pathlib import Path
p=Path("artifacts/candidate-install")
s=(p/"step0.png").read_bytes()
if not s.startswith(bytes.fromhex("89504e470d0a1a0a")) or len(s)<10000:
    raise SystemExit("Failed to capture real Android candidate app screenshot")
print("INSTALL + LAUNCH PASS; multiple native screenshots captured. Visual approval pending pixel review.")
if (p/"step0-hierarchy.xml").exists():
    xml=(p/"step0-hierarchy.xml").read_text(errors="replace")
    print("Accessibility tree available:",len(xml),"bytes, Continue visible:", "Continue" in xml)
else:
    print("Accessibility tree unavailable; onboarding native gesture test NOT VERIFIED")
PY
