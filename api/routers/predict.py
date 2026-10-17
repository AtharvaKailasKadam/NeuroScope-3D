"""
api/routers/predict.py
Prediction endpoint — runs the full pipeline for a given case_id.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = Path("uploads")
_jobs: dict[str, dict] = {}  # In-memory job status (use Redis in production)


@router.post("/{case_id}")
async def run_prediction(case_id: str, background_tasks: BackgroundTasks):
    """Start the segmentation pipeline for an uploaded case."""
    case_dir = UPLOAD_DIR / case_id
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail=f"case_id '{case_id}' not found.")

    if case_id in _jobs and _jobs[case_id]["status"] in ("running", "done"):
        return JSONResponse({"case_id": case_id, "status": _jobs[case_id]["status"]})

    _jobs[case_id] = {"status": "running", "error": None, "result": None}
    background_tasks.add_task(_run_pipeline_bg, case_id, case_dir)

    return JSONResponse(
        status_code=202,
        content={
            "case_id": case_id,
            "status": "running",
            "poll_url": f"/api/results/{case_id}",
        },
    )


async def _run_pipeline_bg(case_id: str, case_dir: Path) -> None:
    """Run the pipeline in a background task."""
    from core.predict import run_pipeline
    from core.validate import ValidationError

    try:
        # Discover uploaded files
        nii_files = sorted(case_dir.glob("*.nii*"))
        file_map = _map_files_to_sequences(nii_files)

        out_path = case_dir / "prediction.nii.gz"
        mask_path = file_map.pop("mask", None)

        result = await asyncio.to_thread(
            run_pipeline,
            t1=file_map.get("t1"),
            t1ce=file_map.get("t1ce"),
            t2=file_map.get("t2"),
            flair=file_map.get("flair"),
            out=out_path,
            mask=mask_path,
            use_tta=True,
            allow_missing=True,
        )

        _jobs[case_id] = {
            "status": "done",
            "error": None,
            "result": {
                "prediction_path": str(out_path),
                "uncertainty_path": result.get("uncertainty_path"),
                "uncertainty_stats": result.get("uncertainty_stats"),
                "missing_modalities": result.get("missing_modalities", []),
                "et_voxels_cleaned": result.get("et_voxels_cleaned", 0),
                "tta_enabled": result.get("tta_enabled", True),
                "ensemble_enabled": result.get("ensemble_enabled", False),
                "sha256": result["sha256"],
                "commit": result["commit"],
                "elapsed_s": result["elapsed_s"],
                "from_cache": result["from_cache"],
                "volumes": result["volumes"],
            },
        }
    except Exception as e:
        logger.exception("Pipeline error for case %s: %s", case_id, e)
        _jobs[case_id] = {
            "status": "error",
            "error": str(e),
            "result": None,
        }


def _map_files_to_sequences(files) -> dict[str, Path]:
    """Map uploaded files to sequence keys using filename heuristics."""
    from core.validate import guess_sequence

    seq_map: dict[str, Path] = {}
    for f in files:
        if "mask" in f.name.lower() or "seg" in f.name.lower():
            seq_map["mask"] = f
            continue
        seq = guess_sequence(f.name)
        if seq:
            seq_map[seq] = f

    return seq_map
