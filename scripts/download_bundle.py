"""
scripts/download_bundle.py
Download the MONAI brats_mri_segmentation bundle weights.
Run once before starting the server or CLI.
"""

from __future__ import annotations

import sys
from pathlib import Path


BUNDLE_NAME = "brats_mri_segmentation"
BUNDLE_DIR = Path(__file__).parent.parent / "models"


def main():
    print(f"Downloading MONAI bundle: {BUNDLE_NAME} …")
    try:
        from monai.bundle import download
        download(
            name=BUNDLE_NAME,
            source="monaihosting",
            bundle_dir=str(BUNDLE_DIR),
        )
        print(f"✓ Bundle downloaded to {BUNDLE_DIR / BUNDLE_NAME}")
    except Exception as e:
        print(f"✗ Download failed: {e}", file=sys.stderr)
        print(
            "Alternatively, download manually from:\n"
            "  https://github.com/Project-MONAI/model-zoo/releases\n"
            f"and place it in: {BUNDLE_DIR / BUNDLE_NAME}",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
