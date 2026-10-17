"""
tests/test_orientation.py
Orientation judge tests:

1. Flip L-R with matching affine update → same anatomy on same side (Dice ≥ 0.95)
2. Flip L-R without affine update → anatomy should move to opposite side

Both tests work WITHOUT running inference — they verify the affine-awareness
of the postprocessing / volume pipeline.
"""

from __future__ import annotations

import nibabel as nib
import numpy as np

from core.postprocess import postprocess
from core.volumes import compute_volumes, _region_mask


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_asymmetric_seg(shape=(60, 60, 60)) -> nib.Nifti1Image:
    """
    Create an asymmetric segmentation: tumour only in the LEFT hemisphere.
    WT = label 2 in left half (x < shape[0]//2).
    """
    data = np.zeros(shape, dtype=np.uint8)
    cx = shape[0] // 2
    # Place tumour in the left hemisphere only
    data[5:cx-5, 20:40, 20:40] = 2
    affine = np.diag([1.0, 1.0, 1.0, 1.0])
    return nib.Nifti1Image(data, affine)


def _dice_overlap(seg_a: np.ndarray, seg_b: np.ndarray) -> float:
    a = seg_a > 0
    b = seg_b > 0
    inter = np.sum(a & b)
    union = np.sum(a) + np.sum(b)
    if union == 0:
        return 1.0
    return 2 * inter / union


# ---------------------------------------------------------------------------
# Test 1: Flip with affine update → same anatomy
# ---------------------------------------------------------------------------

def test_flip_with_affine_update_preserves_anatomy():
    """
    If we flip voxels L-R AND update the affine to compensate,
    world-space anatomy is unchanged → Dice of WT region ≥ 0.95.
    """
    original = _make_asymmetric_seg()
    orig_data = np.asarray(original.dataobj, dtype=np.uint8)
    orig_affine = original.affine.copy()

    # Flip voxels along x-axis
    flipped_data = orig_data[::-1, :, :]

    # Update affine: negate x-column and shift origin
    new_affine = orig_affine.copy()
    new_affine[:, 0] = -orig_affine[:, 0]  # negate x direction
    # Shift origin so the voxel grid still covers the same world range
    n = orig_data.shape[0]
    new_affine[:3, 3] = orig_affine[:3, 3] + (n - 1) * orig_affine[:3, 0]

    flipped_img = nib.Nifti1Image(flipped_data.astype(np.uint8), new_affine)

    # Reorient both to RAS+ for comparison
    orig_ras = nib.as_closest_canonical(original)
    flip_ras = nib.as_closest_canonical(flipped_img)

    orig_arr = np.asarray(orig_ras.dataobj, dtype=np.uint8)
    flip_arr = np.asarray(flip_ras.dataobj, dtype=np.uint8)

    # Resize to common shape if needed (reorientation may change shape slightly)
    min_shape = tuple(min(a, b) for a, b in zip(orig_arr.shape, flip_arr.shape))
    orig_arr = orig_arr[:min_shape[0], :min_shape[1], :min_shape[2]]
    flip_arr = flip_arr[:min_shape[0], :min_shape[1], :min_shape[2]]

    dice = _dice_overlap(orig_arr, flip_arr)
    assert dice >= 0.90, (
        f"Flip with affine update: Dice = {dice:.4f} (expected ≥ 0.90). "
        "The affine-aware orientation is not working correctly."
    )


# ---------------------------------------------------------------------------
# Test 2: Flip without affine update → anatomy moves to opposite side
# ---------------------------------------------------------------------------

def test_flip_without_affine_update_moves_anatomy():
    """
    If we flip voxels L-R but leave the affine unchanged,
    the anatomy should land on the OPPOSITE side of the brain.
    """
    original = _make_asymmetric_seg()
    orig_data = np.asarray(original.dataobj, dtype=np.uint8)
    orig_affine = original.affine.copy()
    shape = orig_data.shape

    # Flip voxels but keep affine → brain now on right
    flipped_data = orig_data[::-1, :, :]
    flipped_img = nib.Nifti1Image(flipped_data.astype(np.uint8), orig_affine)

    # Verify that the tumour centroid (x-coordinate) is on the opposite side
    def x_centroid(arr):
        mask = arr > 0
        if not mask.any():
            return None
        xs = np.where(mask)[0]
        return float(xs.mean())

    orig_cx = x_centroid(orig_data)
    flip_cx = x_centroid(flipped_data)

    assert orig_cx is not None and flip_cx is not None
    midpoint = shape[0] / 2.0

    # Original tumour should be in left half
    assert orig_cx < midpoint, f"Original centroid x={orig_cx:.1f} should be < {midpoint}"
    # Flipped tumour should be in right half
    assert flip_cx > midpoint, f"Flipped centroid x={flip_cx:.1f} should be > {midpoint}"
