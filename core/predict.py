"""
core/predict.py
CLI entry point — judges' scorer uses this path.

Usage:
    python -m core.predict \\
        --t1   /path/to/case_t1.nii.gz \\
        --t1ce /path/to/case_t1ce.nii.gz \\
        --t2   /path/to/case_t2.nii.gz \\
        --flair /path/to/case_flair.nii.gz \\
        --out  pred.nii.gz \\
        [--mask /path/to/expert_mask.nii.gz]

Exit codes:
    0  Success
    1  Validation / sanity error
    2  Unexpected error
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Optional

import nibabel as nib
import numpy as np

# Configure logging before any imports that may log
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("neuroscope.predict")


def _get_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
    except Exception:
        return "unknown"


def run_pipeline(
    t1: Optional[Path] = None,
    t1ce: Optional[Path] = None,
    t2: Optional[Path] = None,
    flair: Optional[Path] = None,
    out: Path = Path("pred.nii.gz"),
    mask: Optional[Path] = None,
    use_cache: bool = True,
    use_tta: bool = False,
    use_ensemble: bool = False,
    min_et_size: int = 200,
    allow_missing: bool = False,
    uncertainty_out: Optional[Path] = None,
) -> dict:
    """
    Run the full NeuroScope-3D pipeline with Tier-1 modeling enhancements.

    Parameters
    ----------
    t1, t1ce, t2, flair : Paths to input NIfTI files
    out                 : Output path for predicted segmentation
    mask                : Optional expert mask for comparison
    use_cache           : Whether to use the SHA-256 result cache
    use_tta             : Enable 4-pass test-time augmentation (flips)
    use_ensemble        : Enable multi-model / multi-scale ensemble averaging
    min_et_size         : Minimum ET component size in voxels before necrosis relabelling
    allow_missing       : Enable graceful modality-dropout fallback if sequences are missing
    uncertainty_out     : Custom path to save voxel-wise uncertainty map NIfTI

    Returns
    -------
    dict with volumes, uncertainty stats, missing modality info, sha256, commit, elapsed_s
    """
    from core.cache import ResultCache, compute_case_hash
    from core.infer import run_inference
    from core.meshes import generate_meshes
    from core.postprocess import postprocess
    from core.preprocess import preprocess
    from core.sanity import sanity_check
    from core.validate import ValidationError, validate_set
    from core.volumes import compute_volumes

    t_start = time.perf_counter()
    commit = _get_commit()

    raw_paths = {"t1": t1, "t1ce": t1ce, "t2": t2, "flair": flair}
    paths = {k: Path(v) for k, v in raw_paths.items() if v is not None}
    out = Path(out)

    # -----------------------------------------------------------------------
    # Step 1: Validate
    # -----------------------------------------------------------------------
    logger.info("Step 1/6 — Validating inputs …")
    try:
        images = validate_set(paths, allow_missing=allow_missing)
    except ValidationError as e:
        logger.error("Validation failed: %s", e)
        sys.exit(1)

    synthetic_modalities = [
        seq for seq, img in images.items() if getattr(img, "_is_synthetic", False)
    ]
    if synthetic_modalities:
        logger.warning(
            "⚠️ MISSING MODALITY MODE: %s missing; synthetic proxy used. Confidence reduced.",
            ", ".join(synthetic_modalities),
        )

    # -----------------------------------------------------------------------
    # Step 2: Sanity check
    # -----------------------------------------------------------------------
    logger.info("Step 2/6 — Sanity check …")
    sanity = sanity_check(images)
    for w in sanity.warnings:
        logger.warning("Sanity WARNING: %s", w)
    for e in sanity.errors:
        logger.error("Sanity ERROR: %s", e)
    if not sanity.passed:
        logger.error("Sanity check failed — aborting.")
        sys.exit(1)

    # -----------------------------------------------------------------------
    # Cache lookup
    # -----------------------------------------------------------------------
    config_tag = f"tta={use_tta}_ens={use_ensemble}_et={min_et_size}_miss={','.join(synthetic_modalities)}"
    input_sha = compute_case_hash(paths, config_tag=config_tag)
    logger.info("Input SHA-256: %s", input_sha)

    cache = ResultCache(config_suffix=config_tag)
    cached = cache.get(input_sha) if use_cache else None
    if cached is not None:
        logger.info("Cache hit — writing cached segmentation.")
        nib.save(cached["seg_img"], str(out))
        logger.info("Saved → %s  (from cache)", out)
        return {**cached, "elapsed_s": time.perf_counter() - t_start, "from_cache": True}

    # -----------------------------------------------------------------------
    # Step 3: Preprocess
    # -----------------------------------------------------------------------
    logger.info("Step 3/6 — Preprocessing (RAS, 1 mm, normalise) …")
    tensor, meta = preprocess(images)

    # -----------------------------------------------------------------------
    # Step 4: Inference (with TTA & Ensemble & Uncertainty)
    # -----------------------------------------------------------------------
    logger.info(
        "Step 4/6 — Running SegResNet inference (TTA=%s, Ensemble=%s) …",
        use_tta,
        use_ensemble,
    )
    probs, unc_map, inf_stats = run_inference(
        tensor,
        use_tta=use_tta,
        use_ensemble=use_ensemble,
        return_uncertainty=True,
    )

    # -----------------------------------------------------------------------
    # Step 5: Postprocess (ET cleanup & back-mapping)
    # -----------------------------------------------------------------------
    logger.info(
        "Step 5/6 — Post-processing (labels 1/2/4, ET cleanup min_size=%d) …",
        min_et_size,
    )
    seg_img, unc_img, post_details = postprocess(
        probs,
        meta,
        min_et_size=min_et_size,
        uncertainty=unc_map,
        return_aux=True,
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    nib.save(seg_img, str(out))
    logger.info("Saved → %s", out)

    # Save uncertainty map
    unc_save_path = uncertainty_out or (out.parent / f"{out.stem.split('.')[0]}_uncertainty.nii.gz")
    if unc_img is not None:
        nib.save(unc_img, str(unc_save_path))
        logger.info("Saved uncertainty map → %s", unc_save_path)

    # -----------------------------------------------------------------------
    # Step 6: Volumes
    # -----------------------------------------------------------------------
    logger.info("Step 6/6 — Computing volumes …")
    vol = compute_volumes(seg_img)
    for region in ("WT", "TC", "ET"):
        logger.info("  %s: %s", region, vol.formula_string(region))

    elapsed = time.perf_counter() - t_start

    result = {
        "seg_img": seg_img,
        "uncertainty_img": unc_img,
        "uncertainty_path": str(unc_save_path) if unc_img is not None else None,
        "uncertainty_stats": inf_stats,
        "et_voxels_cleaned": post_details.get("et_voxels_cleaned", 0),
        "missing_modalities": synthetic_modalities,
        "tta_enabled": use_tta,
        "ensemble_enabled": use_ensemble,
        "volumes": {
            region: {
                "voxels": vol.region_voxels[region],
                "ml": vol.region_volumes_ml[region],
                "formula": vol.formula_string(region),
            }
            for region in ("WT", "TC", "ET")
        },
        "sha256": input_sha,
        "commit": commit,
        "elapsed_s": elapsed,
        "from_cache": False,
    }

    # Optional: compare against expert mask
    if mask is not None:
        from core.eval import compare_with_mask
        result["mask_comparison"] = compare_with_mask(seg_img, Path(mask))

    # Store in cache
    cache.put(input_sha, result)

    logger.info("Pipeline complete in %.1f s", elapsed)
    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="NeuroScope-3D: brain tumour segmentation pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m core.predict \\
      --t1 sub_t1.nii.gz --t1ce sub_t1ce.nii.gz \\
      --t2 sub_t2.nii.gz --flair sub_flair.nii.gz \\
      --out pred.nii.gz --tta --ensemble

DISCLAIMER: For research use only. Not a diagnostic tool.
""",
    )
    p.add_argument("--t1",    required=False, default=None, type=Path, help="T1-weighted NIfTI")
    p.add_argument("--t1ce", "--t1gd", required=False, default=None, type=Path,
                   dest="t1ce", help="T1Gd (contrast-enhanced) NIfTI")
    p.add_argument("--t2",    required=False, default=None, type=Path, help="T2-weighted NIfTI")
    p.add_argument("--flair", required=False, default=None, type=Path, help="FLAIR NIfTI")
    p.add_argument("--out",   required=True, type=Path, help="Output segmentation NIfTI")
    p.add_argument("--mask",  default=None, type=Path,
                   help="Optional expert mask NIfTI for comparison")
    p.add_argument("--tta",   action="store_true",
                   help="Enable 4-pass Test-Time Augmentation (flips)")
    p.add_argument("--ensemble", action="store_true",
                   help="Enable multi-model / multi-scale ensemble averaging")
    p.add_argument("--min-et-size", default=200, type=int,
                   help="Minimum ET component size in voxels before necrosis relabelling (default: 200)")
    p.add_argument("--allow-missing", action="store_true",
                   help="Allow missing modalities with graceful surrogate fallback")
    p.add_argument("--uncertainty-out", default=None, type=Path,
                   help="Custom path to save voxel-wise uncertainty map NIfTI")
    p.add_argument("--no-cache", action="store_true",
                   help="Disable SHA-256 result cache")
    p.add_argument("--json-out", default=None, type=Path,
                   help="Save results summary to a JSON file")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    try:
        result = run_pipeline(
            t1=args.t1,
            t1ce=args.t1ce,
            t2=args.t2,
            flair=args.flair,
            out=args.out,
            mask=args.mask,
            use_cache=not args.no_cache,
            use_tta=args.tta,
            use_ensemble=args.ensemble,
            min_et_size=args.min_et_size,
            allow_missing=args.allow_missing,
            uncertainty_out=args.uncertainty_out,
        )

        # Print summary
        print("\n" + "=" * 60)
        print("NeuroScope-3D — Segmentation Complete")
        print("=" * 60)
        print(f"  Output:   {args.out}")
        print(f"  SHA-256:  {result['sha256']}")
        print(f"  Commit:   {result['commit']}")
        print(f"  Time:     {result['elapsed_s']:.1f} s")
        print()
        for region, info in result["volumes"].items():
            print(f"  {region}: {info['formula']}")
        print()
        print(
            "⚠️  DISCLAIMER: Suspected tumour regions predicted by the model. "
            "Estimated volumes only. Not a diagnostic tool."
        )
        print("=" * 60)

        if args.json_out:
            # Make serialisable (remove nib.Nifti1Image)
            summary = {k: v for k, v in result.items() if k != "seg_img"}
            args.json_out.write_text(json.dumps(summary, indent=2))

        sys.exit(0)

    except SystemExit:
        raise
    except Exception as e:
        logger.exception("Unexpected error: %s", e)
        sys.exit(2)


if __name__ == "__main__":
    main()
