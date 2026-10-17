"""
core/postprocess.py
Post-processing:
  1. Convert TC/WT/ET probability channels → binary masks (threshold 0.5)
  2. Enforce nesting: ET ⊂ TC ⊂ WT
  3. Convert to BraTS label map:   ET → 4,  TC\ET → 1,  WT\TC → 2,  BG → 0
  4. Resample label map back to the original voxel grid (nearest-neighbour)
  5. Return a uint8 NIfTI image with the original affine

Labels:
  0 = Background
  1 = Necrotic Core / Non-enhancing Tumour (TC minus ET)
  2 = Peritumoral Oedema (WT minus TC)
  4 = Enhancing Tumour (ET)
"""

from typing import Any, Dict, Optional, Tuple

import nibabel as nib
import numpy as np
import torch
from scipy.ndimage import zoom

from core.preprocess import PreprocessMeta


# ---------------------------------------------------------------------------
# Channel index convention from the bundle output
# ---------------------------------------------------------------------------
CH_TC = 0   # Tumour Core
CH_WT = 1   # Whole Tumour
CH_ET = 2   # Enhancing Tumour

THRESHOLD = 0.5  # sigmoid threshold
DEFAULT_MIN_ET_SIZE = 200  # voxels; standard BraTS post-processing threshold


# ---------------------------------------------------------------------------
# Morphological Post-Processing
# ---------------------------------------------------------------------------

def cleanup_small_components(
    et_mask: np.ndarray,
    min_size_voxels: int = DEFAULT_MIN_ET_SIZE,
) -> Tuple[np.ndarray, int]:
    """
    Remove tiny disconnected Enhancing Tumour (ET) blobs below min_size_voxels
    and reclassify them as necrotic core (label 1).

    Parameters
    ----------
    et_mask : np.ndarray (bool)
        Binary mask of Enhancing Tumour.
    min_size_voxels : int
        Threshold below which isolated ET connected components are removed.
        Default is 200 voxels (~0.2 mL for 1 mm isotropic data).

    Returns
    -------
    cleaned_et : np.ndarray (bool)
    n_reclassified : int
        Number of voxels converted from ET to necrotic core.
    """
    if min_size_voxels <= 0 or not et_mask.any():
        return et_mask, 0

    from scipy.ndimage import label
    # 26-connectivity for 3D
    labeled, num_features = label(et_mask, structure=np.ones((3, 3, 3), dtype=bool))
    if num_features == 0:
        return et_mask, 0

    counts = np.bincount(labeled.flat)
    cleaned_et = et_mask.copy()
    n_reclassified = 0

    for comp_idx in range(1, num_features + 1):
        if counts[comp_idx] < min_size_voxels:
            comp_mask = (labeled == comp_idx)
            cleaned_et[comp_mask] = False
            n_reclassified += int(counts[comp_idx])

    return cleaned_et, n_reclassified


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def postprocess(
    probs: torch.Tensor,
    meta: PreprocessMeta,
    min_et_size: int = DEFAULT_MIN_ET_SIZE,
    uncertainty: Optional[torch.Tensor] = None,
    return_aux: bool = False,
) -> Any:
    """
    Post-process raw model output into a BraTS-coded NIfTI label map.

    Parameters
    ----------
    probs : torch.Tensor  shape (3, D', H', W')
        Sigmoid probabilities for (TC, WT, ET) at the *preprocessed* resolution.
    meta  : PreprocessMeta
        Original image geometry recorded during preprocessing.
    min_et_size : int
        Minimum ET component size in voxels before relabelling to necrotic core.
    uncertainty : torch.Tensor, optional
        Voxel-wise uncertainty map at the preprocessed resolution (D', H', W').
    return_aux : bool
        If True, returns (seg_img, uncertainty_img, details_dict).
        If False (default), returns seg_img for backwards compatibility.

    Returns
    -------
    nib.Nifti1Image (if return_aux is False) or tuple (if return_aux is True).
    """
    probs_np = probs.numpy().astype(np.float32)

    # --- 1. Binarise ---
    tc = probs_np[CH_TC] >= THRESHOLD
    wt = probs_np[CH_WT] >= THRESHOLD
    et = probs_np[CH_ET] >= THRESHOLD

    # --- 2. Enforce nesting baseline: ET ⊂ TC ---
    et = et & tc

    # --- 3. Small-component cleanup on ET (BraTS standard) ---
    et, n_cleaned = cleanup_small_components(et, min_size_voxels=min_et_size)

    # --- 4. Enforce nesting: WT must enclose TC ---
    # Note: redundant `tc = tc | et` removed since et is already a subset of tc.
    wt = wt | tc

    # --- 5. Build label map ---
    # Any ET voxels cleaned above remain inside tc, so they naturally become label 1 (necrotic core)
    label_map = np.zeros_like(tc, dtype=np.uint8)
    label_map[wt & ~tc] = 2   # Oedema
    label_map[tc & ~et] = 1   # Necrotic core
    label_map[et]        = 4   # Enhancing tumour

    # --- 6. Resample back to original grid (nearest-neighbour, preserves labels) ---
    preprocessed_shape = np.array(label_map.shape, dtype=float)
    original_shape     = np.array(meta.orig_shape[:3], dtype=float)
    zoom_factors = original_shape / preprocessed_shape

    label_orig = zoom(
        label_map.astype(np.float32),
        zoom_factors,
        order=0,          # Nearest-neighbour — critical for label maps
        prefilter=False,
    ).astype(np.uint8)

    # Wrap in NIfTI with original affine & zoom headers
    out_img = nib.Nifti1Image(label_orig, meta.orig_affine)
    out_img.header.set_data_dtype(np.uint8)
    orig_zooms = meta.orig_header.get_zooms()[:3]
    out_img.header.set_zooms(orig_zooms)

    # --- 7. Resample uncertainty map if provided (trilinear) ---
    uncertainty_img: Optional[nib.Nifti1Image] = None
    if uncertainty is not None:
        unc_np = uncertainty.numpy().astype(np.float32)
        unc_orig = zoom(
            unc_np,
            zoom_factors,
            order=1,      # Trilinear for continuous uncertainty field
            prefilter=False,
        ).astype(np.float32)
        uncertainty_img = nib.Nifti1Image(unc_orig, meta.orig_affine)
        uncertainty_img.header.set_data_dtype(np.float32)
        uncertainty_img.header.set_zooms(orig_zooms)

    if not return_aux:
        return out_img

    details = {
        "et_voxels_cleaned": n_cleaned,
        "min_et_size_voxels": min_et_size,
    }
    return out_img, uncertainty_img, details
