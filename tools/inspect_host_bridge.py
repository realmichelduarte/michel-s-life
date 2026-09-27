#!/usr/bin/env python3
from pathlib import Path

p=Path(__file__).resolve().parents[1]/'src'/'MichelsLife'/'Program.cs'
text=p.read_text(encoding='utf-8',errors='replace')
needles=[
    'static void Main',
    'Application.Run',
    'new WebView2',
    'CoreWebView2',
    'Navigate',
    'Source =',
    'AppBundle.zip',
    'ExtractToDirectory',
    'ComputeEmbeddedBundleFingerprint',
    'localStorage',
    'Environment.GetCommandLineArgs',
]
lines=text.splitlines()
for needle in needles:
    hits=[i for i,line in enumerate(lines) if needle in line]
    print(f'=== {needle} hits={len(hits)} ===')
    for i in hits[:8]:
        lo=max(0,i-8); hi=min(len(lines),i+20)
        print(f'--- lines {lo+1}-{hi} ---')
        for n in range(lo,hi):
            print(f'{n+1:04d}: {lines[n]}')
