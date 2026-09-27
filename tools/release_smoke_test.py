#!/usr/bin/env python3
from pathlib import Path
import json, subprocess, sys

ROOT=Path(__file__).resolve().parents[1]
def read(path): return path.read_text(encoding='utf-8',errors='replace')

subprocess.run([sys.executable,str(ROOT/'tools/materialize_host_source.py')],check=True)

PROGRAM=ROOT/'src/MichelsLife/Program.cs'
GOOGLE=ROOT/'src/MichelsLife/GoogleCalendarService.cs'
SECRETS=ROOT/'src/MichelsLife/BuildSecrets.cs'
FRONTEND=ROOT/'src/MichelsLife/frontend/index.html'
LOGO=ROOT/'branding/michels_life_logo.svg'
AVATAR=ROOT/'branding/michel_duarte_avatar.jpg'
PROFILE=ROOT/'branding/developer-profile.json'
LICENSE=ROOT/'LICENSE.txt'
I18N=ROOT/'src/MichelsLife/AppPatches/i18n-v308.html'
INSTALLER=ROOT/'installer/MichelsLife.iss'
WORKFLOWS=[
    ROOT/'.github/workflows/build-test-windows.yml',
    ROOT/'.github/workflows/release-windows.yml',
    ROOT/'.github/workflows/build-store-msix.yml',
]
for p in (PROGRAM,GOOGLE,SECRETS,FRONTEND,LOGO,AVATAR,PROFILE,LICENSE,I18N,INSTALLER,*WORKFLOWS):
    assert p.exists(),f'missing {p}'

program=read(PROGRAM)
assert 'CurrentAppVersion = new("3.0.207")' in program
for stale in ('3.0.202','3.0.203','3.0.204','3.0.205','3.0.206'):
    assert stale not in program, f'stale host version remains: {stale}'
for marker in ('ComputeEmbeddedBundleFingerprint','SHA256.Create()','string.Equals(marker, bundleFingerprint','File.WriteAllText(markerPath, bundleFingerprint)'):
    assert marker in program, f'missing runtime cache protection: {marker}'
for marker in ('installerLanguageQuery','install-language.txt','installerLang='):
    assert marker in program, f'missing installer language bridge: {marker}'
assert '__BUILD_SECRET_GOOGLE__' in read(SECRETS)
assert 'NormalizeGoogleClientSecret' in read(SECRETS)
assert 'JsonDocument.Parse' in read(SECRETS)

profile=json.loads(read(PROFILE))
for key,value in {
    'studio':'Michel’s Lab',
    'developer':'Michel Duarte',
    'email':'realmichelduarte@gmail.com',
    'copyright':'© 2026 Michel Duarte / Michel’s Lab. All rights reserved.',
}.items():
    assert profile.get(key)==value, f'bad developer profile: {key}'

frontend=read(FRONTEND)
for marker in (
    "const VERSION='3.0.207'",
    "assets/michels_life_logo.svg",
    "assets/michel_duarte_avatar.jpg",
    "['typography','Aa','Typography'",
    "midnights:{name:'Midnights'",
    "ocean_blvd:{name:'Did You Know That There’s a Tunnel Under Ocean Blvd'",
    "--mlv-ui-font:Inter",
    "function focusPane()",
    "Focus & Timers settings",
    "michelsLife.typography.v303",
):
    assert marker in frontend, f'missing canonical frontend source: {marker}'
for forbidden in ('data:image/png;base64,','data:image/jpeg;base64,',"artist:'Taylor Swift'","artist:'Lana Del Rey'","data-mlv-font-artist="):
    assert forbidden not in frontend, f'non-canonical frontend content remains: {forbidden}'
for stale in ('3.0.202','3.0.203','3.0.204','3.0.205','3.0.206'):
    assert stale not in frontend, f'stale frontend version remains: {stale}'

i18n=read(I18N)
for marker in ('mlv-i18n-v308','michelsLife.language.v308','data-mlv-lang="en"','data-mlv-lang="es"','installerLang'):
    assert marker in i18n, f'missing bilingual UI marker: {marker}'

installer=read(INSTALLER)
for marker in ('ShowLanguageDialog=yes','compiler:Languages\\Spanish.isl','SaveInitialAppLanguage','install-language.txt'):
    assert marker in installer, f'missing bilingual installer marker: {marker}'

workflow_text='\n'.join(read(p) for p in WORKFLOWS)
for forbidden in ('build_frontend_v30202.py','AppPatches/v3.0.202.html','branding/michels_life_mark.svg'):
    assert forbidden not in workflow_text, f'legacy frontend build dependency remains: {forbidden}'
for required in ('src/MichelsLife/frontend/index.html','branding/michels_life_logo.svg','assets/michels_life_logo.svg','AppPatches/i18n-v308.html','mlv-i18n-v308'):
    assert required in workflow_text, f'canonical build dependency missing: {required}'

security='\n'.join(read(p) for p in (PROGRAM,GOOGLE,SECRETS,FRONTEND,PROFILE,LICENSE))
for forbidden in ('GOCSPX-','github_pat_','ghp_','client_secret_794181'):
    assert forbidden.lower() not in security.lower(), f'committed secret-like value: {forbidden}'

print('OK: v3.0.207 host + canonical frontend + branding + clean build pipeline')
