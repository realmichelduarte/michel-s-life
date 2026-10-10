#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
bridge = (ROOT / "android-bridge.js").read_text(encoding="utf-8")
main = (ROOT / "app/src/main/java/com/michelslab/michelslife/MainActivity.kt").read_text(encoding="utf-8")
manifest = (ROOT / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
adaptive_icon = ROOT / "app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"
adaptive_round_icon = ROOT / "app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml"
launcher_foreground = ROOT / "app/src/main/res/drawable/ic_launcher_foreground.xml"

required_bridge = [
    "window.__MICHELSLIFE_ANDROID_BRIDGE__='0.2.3'",
    "const MOBILE_BREAKPOINT=4096;",
    "@media(min-width:900px) and (max-width:${MOBILE_BREAKPOINT}px)",
    "mlv-android-topbar",
    "mlv-android-drawer-backdrop",
    "mlv-android-prev-section",
    "mlv-android-next-section",
    "function stabilizeAndroidOnboarding()",
    "function layoutAndroidOnboarding(root)",
    "mlv-android-onboard-scroll",
    "body:has(#mlv200Onboarding:not([hidden])) #mlv-android-topbar",
    "z-index:2147483500",
    "[data-mlv200-onboard=\"next\"]",
    "max(42px,env(safe-area-inset-bottom,0px))",
    "michelsLife.onboarding.v30200",
    "function fastRoute(id)",
    "window.__mlvAndroidFastRoute=fastRoute",
    "android-render-main",
    "function installFastNavCapture()",
    "installFastNavCapture();",
    "(document.body||document.head).appendChild(style)",
    "#v30171Sidebar{",
    "document.body.appendChild(side)",
    "setImportantOnce(side,'z-index','2147482995')",
    "body.mlv-android-nav-open #v30171Sidebar",
    "function navigateSwipe(direction)",
    "window.__mlvAndroidHandleBack=function()",
    "article.v132-mission",
    ".v132-check",
    ".v132-mission-actions{grid-column:2",
    ".topbar{display:none",
    "#mlv200Onboarding{position:fixed!important",
    "#mlv200Onboarding .mlv200-focus input[type=\"checkbox\"]",
    "width:22px!important",
    "#v30175ActionDock{position:sticky",
    "#v30106QuickFab",
    "#v30162FocusDock",
    "#v176StatusPanel{position:relative",
    "#v176StatusPanel .v176-card:first-child",
    "setInterval(maintenance,1000)",
    "mlv-android-drawer-hint",
    "data-mlv-platform",
]
missing = [needle for needle in required_bridge if needle not in bridge]
if missing:
    raise SystemExit("Android mobile UX contract missing: " + ", ".join(missing))

native_required = [
    "setLayerType(View.LAYER_TYPE_HARDWARE",
    "setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_BOUND",
    "offscreenPreRaster = true",
]
missing_native = [needle for needle in native_required if needle not in main]
if missing_native:
    raise SystemExit("Android native performance contract missing: " + ", ".join(missing_native))

if "__mlvAndroidHandleBack" not in main:
    raise SystemExit("MainActivity does not delegate Android back handling to the web UI")

if 'android:icon="@mipmap/ic_launcher"' not in manifest or 'android:roundIcon="@mipmap/ic_launcher_round"' not in manifest:
    raise SystemExit("Android manifest is not using the canonical Michel's Life launcher resources")
for path in (adaptive_icon, adaptive_round_icon, launcher_foreground):
    if not path.exists() or path.stat().st_size == 0:
        raise SystemExit(f"Canonical Michel's Life Android launcher resource is missing: {path}")
for path in (adaptive_icon, adaptive_round_icon):
    xml = path.read_text(encoding="utf-8")
    if '@drawable/ic_launcher_foreground' not in xml or '@color/ml_icon_background' not in xml:
        raise SystemExit(f"Adaptive launcher icon is not wired to the canonical foreground/background: {path}")

print("OK: Android UX contract covers phone + wide-emulator app mode, active-surface navigation, stable onboarding/checklists, in-drawer quick actions, hardware rendering, canonical adaptive launcher identity, fixed drawer layering, swipe navigation, mission alignment and back handling")
