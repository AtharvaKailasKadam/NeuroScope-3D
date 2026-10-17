"""
api/routers/results.py
Results endpoints — status polling, NIfTI download, mesh data, PDF report.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from api.routers.predict import _jobs

router = APIRouter()
UPLOAD_DIR = Path("uploads")

DISCLAIMER = (
    "Suspected tumour regions predicted by the model. "
    "Estimated volumes only. Not a diagnostic tool. "
    "Does not replace a radiologist."
)


@router.get("/{case_id}")
async def get_result(case_id: str):
    """Poll prediction status and retrieve results when done."""
    if case_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"case_id '{case_id}' not found.")

    job = _jobs[case_id]

    if job["status"] == "error":
        # Return error message but NO partial results
        return JSONResponse(
            status_code=422,
            content={
                "case_id": case_id,
                "status": "error",
                "error": job["error"],
                "result": None,
                "disclaimer": DISCLAIMER,
            },
        )

    if job["status"] == "running":
        return JSONResponse({"case_id": case_id, "status": "running"})

    return JSONResponse(
        {
            "case_id": case_id,
            "status": "done",
            "result": job["result"],
            "disclaimer": DISCLAIMER,
        }
    )


@router.get("/{case_id}/segmentation")
async def download_segmentation(case_id: str):
    """Download the predicted segmentation NIfTI."""
    _require_done(case_id)
    pred_path = Path(_jobs[case_id]["result"]["prediction_path"])
    if not pred_path.exists():
        raise HTTPException(status_code=404, detail="Prediction file not found.")
    return FileResponse(str(pred_path), media_type="application/gzip", filename="prediction.nii.gz")


@router.get("/{case_id}/meshes")
async def get_meshes(case_id: str):
    """Get 3D mesh data (vertices/faces) for all tumour regions."""
    _require_done(case_id)
    import nibabel as nib
    from core.meshes import generate_meshes

    pred_path = Path(_jobs[case_id]["result"]["prediction_path"])
    seg_img = nib.load(str(pred_path))
    meshes = generate_meshes(seg_img, regions=["WT", "TC", "ET"])
    # Remove 'brain' mesh from API to keep response size manageable
    return JSONResponse({"meshes": meshes, "disclaimer": DISCLAIMER})


@router.get("/{case_id}/uncertainty")
async def download_uncertainty(case_id: str):
    """Download the voxel-wise uncertainty map NIfTI (.nii.gz)."""
    _require_done(case_id)
    unc_path_str = _jobs[case_id]["result"].get("uncertainty_path")
    if not unc_path_str:
        raise HTTPException(status_code=404, detail="Uncertainty map not available for this case.")
    unc_path = Path(unc_path_str)
    if not unc_path.exists():
        raise HTTPException(status_code=404, detail="Uncertainty map file not found on disk.")
    return FileResponse(str(unc_path), media_type="application/gzip", filename="uncertainty.nii.gz")


@router.delete("/{case_id}")
async def delete_case(case_id: str):
    """Immediate one-click case deletion for patient privacy."""
    import shutil
    case_dir = UPLOAD_DIR / case_id
    if case_dir.exists():
        shutil.rmtree(case_dir, ignore_errors=True)
    if case_id in _jobs:
        del _jobs[case_id]
    return JSONResponse(
        content={
            "case_id": case_id,
            "status": "deleted",
            "message": "All case data and temporary files have been permanently purged.",
            "disclaimer": DISCLAIMER,
        }
    )


@router.get("/{case_id}/report")
async def get_report(case_id: str):
    """Generate and return the PDF report."""
    _require_done(case_id)
    from core.report import generate_report

    case_dir = UPLOAD_DIR / case_id
    report_path = case_dir / "report.pdf"

    if not report_path.exists():
        job = _jobs[case_id]
        generate_report(
            case_id=case_id,
            result=job["result"],
            output_path=report_path,
        )

    return FileResponse(str(report_path), media_type="application/pdf", filename="neuroscope_report.pdf")


def _require_done(case_id: str) -> None:
    if case_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"case_id '{case_id}' not found.")
    if _jobs[case_id]["status"] != "done":
        raise HTTPException(
            status_code=409,
            detail=f"Prediction not yet complete (status: {_jobs[case_id]['status']}).",
        )
