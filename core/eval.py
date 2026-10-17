"""
core/eval.py
Evaluation utilities.

- Dice coefficient and sensitivity per region (WT, TC, ET)
- Expert-mask comparison for the viewer (TP/FP/FN overlay)
- Empty-GT handling (both empty → Dice 1.0, sensitivity N/A)
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Tuple

import nibabel as nib
import numpy as np


# ---------------------------------------------------------------------------
# Region masks (same definitions as volumes.py)
# ---------------------------------------------------------------------------

def _region_mask(labels: np.ndarray, region: str) -> np.ndarray:
    if region == "WT":
        return labels > 0
    if region == "TC":
        return (labels == 1) | (labels == 4)
    if region == "ET":
        return labels == 4
    raise ValueError(f"Unknown region: {region}")


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

@dataclass
class RegionMetrics:
    region: str
    dice: Optional[float]         # None if both empty (reported as 1.0 by convention)
    sensitivity: Optional[float]  # None if GT empty
    tp: int
    fp: int
    fn: int

    def dice_display(self) -> str:
        if self.dice is None:
            return "1.000 (both empty)"
        return f"{self.dice:.4f}"

    def sensitivity_display(self) -> str:
        if self.sensitivity is None:
            return "N/A (GT empty)"
        return f"{self.sensitivity:.4f}"


def compute_metrics(
    pred: np.ndarray,
    gt: np.ndarray,
    region: str,
) -> RegionMetrics:
    """
    Compute Dice + sensitivity for one region.

    Parameters
    ----------
    pred, gt : uint8 arrays with BraTS labels {0,1,2,4}
    region   : "WT" | "TC" | "ET"
    """
    p = _region_mask(pred, region)
    g = _region_mask(gt, region)

    tp = int(np.sum(p & g))
    fp = int(np.sum(p & ~g))
    fn = int(np.sum(~p & g))

    if not g.any() and not p.any():
        # Both empty → Dice = 1, sensitivity = N/A
        return RegionMetrics(region=region, dice=1.0, sensitivity=None, tp=0, fp=0, fn=0)

    if not g.any():
        # GT empty, prediction non-empty → Dice = 0, sensitivity = N/A
        return RegionMetrics(region=region, dice=0.0, sensitivity=None, tp=0, fp=fp, fn=0)

    dice = (2.0 * tp) / (2.0 * tp + fp + fn) if (2 * tp + fp + fn) > 0 else 0.0
    sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0.0

    return RegionMetrics(region=region, dice=dice, sensitivity=sensitivity, tp=tp, fp=fp, fn=fn)


def evaluate_case(
    pred_path: Path,
    gt_path: Path,
) -> Dict[str, RegionMetrics]:
    """Compute per-region metrics for a single case."""
    pred_img = nib.load(str(pred_path))
    gt_img   = nib.load(str(gt_path))

    pred = np.asarray(pred_img.dataobj, dtype=np.uint8)
    gt   = np.asarray(gt_img.dataobj,   dtype=np.uint8)

    if pred.shape != gt.shape:
        raise ValueError(
            f"Shape mismatch: pred {pred.shape} vs GT {gt.shape}. "
            "Ensure both are in the same space."
        )

    return {
        region: compute_metrics(pred, gt, region)
        for region in ("WT", "TC", "ET")
    }


# ---------------------------------------------------------------------------
# Expert mask comparison (for viewer overlay: TP / FP / FN)
# ---------------------------------------------------------------------------

AGREEMENT_LABELS = {
    "TP": 1,   # True positive  — green
    "FP": 2,   # False positive — red
    "FN": 3,   # False negative — blue
    "TN": 0,   # True negative  — transparent
}

AGREEMENT_COLOURS = {
    "TP": "#6BCB77",   # green
    "FP": "#FF6B6B",   # red
    "FN": "#4D96FF",   # blue
}


def compare_with_mask(
    pred_img: nib.Nifti1Image,
    mask_path: Path,
    region: str = "WT",
) -> dict:
    """
    Build TP/FP/FN comparison overlay for a given region.

    Returns
    -------
    dict with:
        agreement_img : nib.Nifti1Image  — labels {0=TN, 1=TP, 2=FP, 3=FN}
        metrics       : RegionMetrics
        colours       : dict
    """
    gt_img = nib.load(str(mask_path))
    pred_arr = np.asarray(pred_img.dataobj, dtype=np.uint8)
    gt_arr   = np.asarray(gt_img.dataobj,   dtype=np.uint8)

    if pred_arr.shape != gt_arr.shape:
        raise ValueError(
            f"Prediction shape {pred_arr.shape} does not match "
            f"expert mask shape {gt_arr.shape}."
        )

    p = _region_mask(pred_arr, region)
    g = _region_mask(gt_arr, region)

    overlay = np.zeros(pred_arr.shape, dtype=np.uint8)
    overlay[p & g]   = AGREEMENT_LABELS["TP"]
    overlay[p & ~g]  = AGREEMENT_LABELS["FP"]
    overlay[~p & g]  = AGREEMENT_LABELS["FN"]

    agreement_img = nib.Nifti1Image(overlay, pred_img.affine)
    metrics = compute_metrics(pred_arr, gt_arr, region)

    return {
        "agreement_img": agreement_img,
        "metrics": metrics,
        "colours": AGREEMENT_COLOURS,
        "region": region,
    }
