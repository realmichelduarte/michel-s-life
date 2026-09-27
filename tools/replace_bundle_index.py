#!/usr/bin/env python3
"""Replace the web source inside an existing Michel's Life AppBundle.zip.

The large visual pack is intentionally bootstrapped from the previous official
release so source-control changes do not recompress or duplicate 200+ artwork
files on every code change.
"""
from __future__ import annotations
import argparse
import tempfile
import zipfile
from pathlib import Path

DROP = {
    "index.html.pre_v164_themes_cleanup",
    "data/reference_backup_2026-06-23_14-14.json",
    "data/backup_mission_base_2026_06_23.json",
}

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", required=True)
    ap.add_argument("--index", required=True)
    args = ap.parse_args()
    bundle = Path(args.bundle)
    index = Path(args.index)
    if not bundle.exists() or not index.exists():
        raise SystemExit("bundle/index missing")

    # Keep the temporary archive beside the target bundle. On Windows,
    # os.replace()/Path.replace() cannot atomically move a file between drives
    # (GitHub runners commonly use C: for temp files and D: for the workspace).
    bundle.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=".zip",
        prefix=f".{bundle.stem}-",
        dir=bundle.parent,
    ) as tmp:
        temp = Path(tmp.name)

    try:
        with zipfile.ZipFile(bundle, "r") as src:
            source_names = src.namelist()
            source_jpg = sum(n.lower().endswith(".jpg") for n in source_names)
            if source_jpg not in (204, 205):
                raise SystemExit(f"source AppBundle invalid: jpg={source_jpg}")
            with zipfile.ZipFile(temp, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as dst:
                for info in src.infolist():
                    name = info.filename.replace("\\", "/")
                    if name == "index.html" or name in DROP:
                        continue
                    dst.writestr(info, src.read(info.filename))
                dst.writestr("index.html", index.read_bytes())

        with zipfile.ZipFile(temp) as check:
            names = check.namelist()
            jpg = sum(n.lower().endswith(".jpg") for n in names)
            if "index.html" not in names or jpg != source_jpg or check.testzip() is not None:
                raise SystemExit(f"rebuilt AppBundle invalid: index={'index.html' in names}, jpg={jpg}, expected_jpg={source_jpg}")

        temp.replace(bundle)
    finally:
        if temp.exists():
            temp.unlink()

    print(f"AppBundle ready: {bundle} · {source_jpg} JPEG assets")

if __name__ == "__main__":
    main()
