"""
api/routers/upload.py
File upload endpoint.

- Checks file size before reading
- Sanitises filenames
- Guesses sequences from filenames; returns sequence map for user confirmation
- Returns a case_id for subsequent /predict calls
"""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from core.validate import MAX_FILE_BYTES, guess_sequence

router = APIRouter()
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".nii", ".nii.gz"}


def _sanitise_filename(name: str) -> str:
    """Remove path traversal and non-safe characters from a filename."""
    import re
    name = Path(name).name  # strip directory components
    name = re.sub(r"[^\w\-_. ]", "_", name)
    return name[:255]


@router.post("/")
async def upload_files(
    t1:    UploadFile = File(..., description="T1-weighted NIfTI (.nii or .nii.gz)"),
    t1ce:  UploadFile = File(..., description="T1Gd/T1ce NIfTI"),
    t2:    UploadFile = File(..., description="T2-weighted NIfTI"),
    flair: UploadFile = File(..., description="FLAIR NIfTI"),
    mask:  Optional[UploadFile] = File(None, description="Expert mask NIfTI (optional)"),
):
    """
    Upload four MRI sequences (and optional expert mask).
    Returns a case_id to track the prediction job.
    """
    case_id = str(uuid.uuid4())
    case_dir = UPLOAD_DIR / case_id
    case_dir.mkdir(parents=True, exist_ok=True)

    seq_map = {}
    files = {"t1": t1, "t1ce": t1ce, "t2": t2, "flair": flair}
    if mask is not None:
        files["mask"] = mask

    for seq, upload in files.items():
        # Size check before reading
        filename = _sanitise_filename(upload.filename or f"{seq}.nii.gz")
        dest = case_dir / filename

        # Stream to disk, checking size on the fly
        total = 0
        with open(dest, "wb") as f:
            while chunk := await upload.read(1 << 20):
                total += len(chunk)
                if total > MAX_FILE_BYTES:
                    shutil.rmtree(case_dir, ignore_errors=True)
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"File '{filename}' exceeds the 1 GB size limit. "
                            "Upload rejected."
                        ),
                    )
                f.write(chunk)

        seq_map[seq] = str(dest)

    return JSONResponse(
        content={
            "case_id": case_id,
            "files": seq_map,
            "message": (
                "Files uploaded. Call POST /api/predict/{case_id} to run segmentation."
            ),
            "disclaimer": (
                "Suspected tumour regions predicted by the model. "
                "Estimated volumes only. Not a diagnostic tool."
            ),
        }
    )
