"""
core/preprocess.py
Preprocessing pipeline — matches the MONAI brats_mri_segmentation bundle config:
  1. Reorient all volumes to RAS+ via the affine
  2. Resample to 1 mm isotropic
  3. Stack channels in order: [T1Gd, T1, T2, FLAIR]
  4. Non-zero channel-wise intensity normalisation (mean/std)

Returns a dict with the preprocessed tensor and metadata needed for back-mapping.
"""

from __future__ import annotations

from typing import Dict, Tuple

import nibabel as nib
import numpy as np
import torch
from monai.transforms import (
    Compose,
    EnsureChannelFirstd,
    EnsureTyped,
    NormalizeIntensityd,
    Orientationd,
    Spacingd,
    ToTensord,
)


# ---------------------------------------------------------------------------
# Bundle channel order — THIS IS CRITICAL.
# BraTS file naming: t1, t1ce, t2, flair
# Bundle input order: T1Gd (=t1ce), T1, T2, FLAIR
# Mixing this up is the most common pipeline bug.
# ---------------------------------------------------------------------------
CHANNEL_ORDER = ("t1ce", "t1", "t2", "flair")
CHANNEL_NAMES = ("T1Gd", "T1", "T2", "FLAIR")

TARGET_SPACING = (1.0, 1.0, 1.0)   # mm, isotropic
TARGET_ORIENTATION = "RAS"


# ---------------------------------------------------------------------------
# Preprocessing metadata (for back-mapping)
# ---------------------------------------------------------------------------

class PreprocessMeta:
    """Holds original image geometry needed to back-map predictions."""

    def __init__(self, ref_img: nib.Nifti1Image) -> None:
        self.orig_shape: Tuple[int, ...] = ref_img.shape
        self.orig_affine: np.ndarray = ref_img.affine.copy()
        self.orig_header: nib.Nifti1Header = ref_img.header.copy()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def preprocess(
    images: Dict[str, nib.Nifti1Image],
) -> Tuple[torch.Tensor, PreprocessMeta]:
    """
    Preprocess a validated set of four MRI sequences.

    Parameters
    ----------
    images : dict {"t1", "t1ce", "t2", "flair"} → nib.Nifti1Image
        All images must have matching shapes and affines (post-validation).

    Returns
    -------
    tensor : torch.Tensor  shape (4, D, H, W)  — float32, on CPU
    meta   : PreprocessMeta — original geometry for back-mapping
    """
    meta = PreprocessMeta(images["t1"])

    # Build a monai-style data dict keyed by channel name
    data_dict = {
        ch: images[seq].get_fdata(dtype=np.float32)
        for ch, seq in zip(CHANNEL_NAMES, CHANNEL_ORDER)
    }
    # Keep affines too (monai transforms need them)
    meta_dict = {
        f"{ch}_meta_dict": {
            "affine": images[seq].affine,
            "original_affine": images[seq].affine,
            "space": "RAS",
        }
        for ch, seq in zip(CHANNEL_NAMES, CHANNEL_ORDER)
    }

    # Use nibabel to reorient + resample (avoids MONAI's internal meta machinery
    # for simplicity; results are identical)
    resampled = {}
    for ch, seq in zip(CHANNEL_NAMES, CHANNEL_ORDER):
        img = images[seq]
        # Reorient to RAS
        ras_img = nib.as_closest_canonical(img)
        # Resample to 1 mm
        ras_1mm = _resample_to_spacing(ras_img, TARGET_SPACING)
        resampled[ch] = ras_1mm.get_fdata(dtype=np.float32)

    # Stack: (4, D, H, W)
    stacked = np.stack([resampled[ch] for ch in CHANNEL_NAMES], axis=0)

    # Non-zero channel-wise normalisation (z-score over non-zero voxels)
    normalised = _nonzero_normalize(stacked)

    # Add batch dim: (1, 4, D, H, W) → squeeze back to (4, D, H, W)
    tensor = torch.from_numpy(normalised).float()

    return tensor, meta


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resample_to_spacing(
    img: nib.Nifti1Image,
    target_spacing: Tuple[float, float, float],
) -> nib.Nifti1Image:
    """Resample a NIfTI image to the target voxel spacing using trilinear interpolation."""
    from scipy.ndimage import zoom

    header = img.header
    current_spacing = np.array(header.get_zooms()[:3], dtype=float)
    target_spacing_arr = np.array(target_spacing, dtype=float)

    zoom_factors = current_spacing / target_spacing_arr
    data = img.get_fdata(dtype=np.float32)

    # Trilinear zoom
    resampled = zoom(data, zoom_factors, order=1, prefilter=False)

    # Build new affine: scale the voxel-to-world mapping
    new_affine = img.affine.copy()
    for i in range(3):
        new_affine[:3, i] = img.affine[:3, i] / zoom_factors[i]

    return nib.Nifti1Image(resampled, new_affine)


def _nonzero_normalize(arr: np.ndarray) -> np.ndarray:
    """
    Per-channel z-score normalisation using only non-zero voxels.
    Channels with no non-zero voxels are left unchanged.
    """
    out = arr.copy()
    for c in range(arr.shape[0]):
        channel = arr[c]
        mask = channel != 0
        if mask.any():
            mu = float(channel[mask].mean())
            sigma = float(channel[mask].std())
            if sigma > 0:
                out[c] = np.where(mask, (channel - mu) / sigma, 0.0)
    return out
