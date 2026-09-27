#!/usr/bin/env python3
from pathlib import Path
import base64,gzip

ROOT=Path(__file__).resolve().parents[1]/'src'/'MichelsLife'
APP_VERSION='3.0.207'
LEGACY_APP_VERSIONS=('3.0.202','3.0.203','3.0.204','3.0.205','3.0.206')
GOOGLE_CLIENT_ID='256320502181-fvfuhkbijecscl1p3g41f8n28cr2541i.apps.googleusercontent.com'
LEGACY_GOOGLE_CLIENT_IDS=(
    '794181282949-v3ufh901g9rlec673qd0kho1karaqacj.apps.googleusercontent.com',
)

for name in ('Program.cs','GoogleCalendarService.cs'):
    packed=ROOT/(name+'.gz.b64')
    if not packed.exists():
        raise SystemExit(f'missing {packed}')
    data=gzip.decompress(base64.b64decode(packed.read_text().strip()))
    text=data.decode('utf-8')
    for old_version in LEGACY_APP_VERSIONS:
        text=text.replace(old_version,APP_VERSION)
    if name=='GoogleCalendarService.cs':
        for old_client_id in LEGACY_GOOGLE_CLIENT_IDS:
            text=text.replace(old_client_id,GOOGLE_CLIENT_ID)
        if GOOGLE_CLIENT_ID not in text:
            raise SystemExit('GoogleCalendarService.cs does not contain the approved Google Desktop OAuth client id')
    stale=[v for v in LEGACY_APP_VERSIONS if v in text]
    if stale:
        raise SystemExit(f'{name} still contains stale app version markers: {stale}')
    if name=='Program.cs' and f'CurrentAppVersion = new("{APP_VERSION}")' not in text:
        raise SystemExit(f'Program.cs missing CurrentAppVersion {APP_VERSION}')

    if name=='Program.cs':
        nav_old=f'            _webView.CoreWebView2.Navigate("https://michelslife.local/index.html?build={APP_VERSION}");'
        nav_new=f'''            var installerLanguagePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MichelsLife",
                "install-language.txt"
            );
            var installerLanguage = "";
            try
            {{
                if (File.Exists(installerLanguagePath))
                    installerLanguage = File.ReadAllText(installerLanguagePath).Trim().ToLowerInvariant();
            }}
            catch {{ }}
            if (installerLanguage != "en" && installerLanguage != "es")
                installerLanguage = "";
            var installerLanguageQuery = installerLanguage.Length > 0
                ? "&installerLang=" + installerLanguage
                : "";
            _webView.CoreWebView2.Navigate("https://michelslife.local/index.html?build={APP_VERSION}" + installerLanguageQuery);'''
        if 'installerLanguageQuery' not in text:
            if nav_old not in text:
                raise SystemExit('Program.cs navigation anchor missing for installer language bridge')
            text=text.replace(nav_old,nav_new)
    data=text.encode('utf-8')
    (ROOT/name).write_bytes(data)
    print('materialized',name)
