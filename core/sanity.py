"""
core/sanity.py
Input sanity checks — runs after validation, before preprocessing.
Checks:
  1. Skull-stripping: background fraction, intensity distribution
  2. Brain-volume plausibility (800–2000 mL non-zero)
  3. Image shape plausibility

Returns SanityResult with warnings; callers decide whether to refuse.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

import nibabel as nib
import numpy as np


# ---------------------------------------------------------------------------
# Expected ranges (literature / empirical)
# ---------------------------------------------------------------------------
_BRAIN_VOL_MIN_ML = 800.0    # Below this → probably not a brain
_BRAIN_VOL_MAX_ML = 2000.0   # Above this → probably not stripped / artefact
_BG_FRACTION_MIN = 0.30      # If background < 30% → likely not skull-stripped
_SKULL_SIGNAL_RATIO = 0.05   # If >5% of voxels > 95th-pct → skull likely present


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class SanityResult:
    passed: bool = True
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)

    def add_error(self, msg: str) -> None:
        self.errors.append(msg)
        self.passed = False


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def sanity_check(images: dict[str, nib.Nifti1Image]) -> SanityResult:
    """
    Run sanity checks on the loaded images (post-validation).

    Parameters
    ----------
    images : dict of {"t1", "t1ce", "t2", "flair"} → nib.Nifti1Image

    Returns
    -------
    SanityResult
    """
    result = SanityResult()

    # Use T1 as the reference structural volume for brain checks
    ref_img = images.get("t1") or next(iter(images.values()))
    data = ref_img.get_fdata(dtype=np.float32)
    affine = ref_img.affine

    voxel_vol_mm3 = float(np.abs(np.linalg.det(affine[:3, :3])))
    total_voxels = int(data.size)

    # ------------------------------------------------------------------
    # 1. Background fraction
    # ------------------------------------------------------------------
    nonzero_voxels = int(np.count_nonzero(data))
    bg_fraction = 1.0 - nonzero_voxels / total_voxels

    if bg_fraction < _BG_FRACTION_MIN:
        result.add_warning(
            f"Background fraction is {bg_fraction:.1%} (expected ≥ {_BG_FRACTION_MIN:.0%}). "
            "The scan may NOT be skull-stripped. Results may be degraded."
        )

    # ------------------------------------------------------------------
    # 2. Skull / scalp signal heuristic
    #    Skull-stripped brains have near-zero intensities at their periphery.
    #    We approximate: if many voxels in the outer shell are bright, skull is present.
    # ------------------------------------------------------------------
    shell_mask = _outer_shell_mask(data, margin=5)
    if shell_mask.any():
        p95 = float(np.percentile(data[data > 0], 95)) if nonzero_voxels else 1.0
        shell_vals = data[shell_mask]
        bright_in_shell = float(np.mean(shell_vals > 0.05 * p95))
        if bright_in_shell > _SKULL_SIGNAL_RATIO:
            result.add_warning(
                f"~{bright_in_shell:.0%} of the outer-shell voxels have non-zero signal "
                "(skull/scalp may be present). Skull-stripping is required for best results."
            )

    # ------------------------------------------------------------------
    # 3. Brain-volume plausibility
    # ------------------------------------------------------------------
    nonzero_vol_ml = nonzero_voxels * voxel_vol_mm3 / 1000.0
    if nonzero_vol_ml < _BRAIN_VOL_MIN_ML:
        result.add_error(
            f"Non-zero volume is {nonzero_vol_ml:.1f} mL "
            f"(expected {_BRAIN_VOL_MIN_ML}–{_BRAIN_VOL_MAX_ML} mL). "
            "This does not look like a brain MRI."
        )
    elif nonzero_vol_ml > _BRAIN_VOL_MAX_ML:
        result.add_warning(
            f"Non-zero volume is {nonzero_vol_ml:.1f} mL "
            f"(expected ≤ {_BRAIN_VOL_MAX_ML} mL). "
            "The scan may not be skull-stripped or may not be a brain MRI."
        )

    # ------------------------------------------------------------------
    # 4. Shape plausibility (very loose bounds)
    # ------------------------------------------------------------------
    shape = data.shape
    for dim in shape:
        if dim < 50 or dim > 600:
            result.add_warning(
                f"Volume shape {shape} has an unusual dimension ({dim}). "
                "Check that the correct sequence files were provided."
            )
            break

    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _outer_shell_mask(data: np.ndarray, margin: int = 5) -> np.ndarray:
    """Return a boolean mask of the outer `margin`-voxel shell."""
    mask = np.zeros(data.shape, dtype=bool)
    if any(s <= 2 * margin for s in data.shape):
        return mask
    # Set border region to True, interior to False
    mask[:margin, :, :] = True
    mask[-margin:, :, :] = True
    mask[:, :margin, :] = True
    mask[:, -margin:, :] = True
    mask[:, :, :margin] = True
    mask[:, :, -margin:] = True
    return mask
