"""
core/volumes.py
Volumetric analysis — computes voxel counts and physical volumes for each
BraTS region from the original affine header spacing.

Volume formula:
    Volume (mm³) = N_voxels × |det(affine[:3,:3])|
    Volume (mL)  = Volume (mm³) / 1000

NEVER assume 1 mm spacing — always use the header.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import nibabel as nib
import numpy as np


# ---------------------------------------------------------------------------
# BraTS label definitions
# ---------------------------------------------------------------------------
LABEL_NAMES: Dict[int, str] = {
    0: "Background",
    1: "Necrotic Core / Non-Enhancing Tumour",
    2: "Peritumoral Oedema",
    4: "Enhancing Tumour",
}

# Composite regions used in evaluation
REGION_MASKS = {
    "WT": lambda lbl: lbl > 0,          # Whole Tumour: labels 1+2+4
    "TC": lambda lbl: (lbl == 1) | (lbl == 4),  # Tumour Core: labels 1+4
    "ET": lambda lbl: lbl == 4,         # Enhancing Tumour: label 4
}


# ---------------------------------------------------------------------------
# Volume result dataclass
# ---------------------------------------------------------------------------

@dataclass
class VolumeResult:
    """Volumetric statistics for a segmentation."""
    voxel_volume_mm3: float          # |det(affine[:3,:3])|
    spacing_mm: tuple                # (dx, dy, dz)

    # Per-label voxel counts and volumes
    label_voxels: Dict[int, int]
    label_volumes_ml: Dict[int, float]

    # Composite region volumes
    region_voxels: Dict[str, int]
    region_volumes_ml: Dict[str, float]

    def formula_string(self, region: str) -> str:
        """Return a human-readable formula string for a composite region."""
        n = self.region_voxels.get(region, 0)
        dx, dy, dz = self.spacing_mm
        vol_mm3 = n * self.voxel_volume_mm3
        vol_ml = vol_mm3 / 1000.0
        return (
            f"{n:,} voxels × {dx:.3f}×{dy:.3f}×{dz:.3f} mm³ "
            f"= {vol_mm3:,.1f} mm³ = {vol_ml:.2f} mL"
        )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def compute_volumes(seg_img: nib.Nifti1Image) -> VolumeResult:
    """
    Compute voxel counts and physical volumes for each BraTS region.

    Parameters
    ----------
    seg_img : nib.Nifti1Image
        Segmentation image with labels {0, 1, 2, 4} in the original space.

    Returns
    -------
    VolumeResult
    """
    affine = seg_img.affine
    data = np.asarray(seg_img.dataobj, dtype=np.uint8)

    # Physical voxel volume from affine (NOT from header zooms, to be safe)
    vox_vol_mm3 = float(np.abs(np.linalg.det(affine[:3, :3])))

    # Spacing for display
    from nibabel.affines import voxel_sizes
    spacing = tuple(float(v) for v in voxel_sizes(affine))

    # Per-label counts
    label_voxels: Dict[int, int] = {
        lbl: int(np.sum(data == lbl))
        for lbl in LABEL_NAMES
    }
    label_volumes_ml: Dict[int, float] = {
        lbl: label_voxels[lbl] * vox_vol_mm3 / 1000.0
        for lbl in LABEL_NAMES
    }

    # Composite region counts
    region_voxels: Dict[str, int] = {
        region: int(np.sum(mask_fn(data)))
        for region, mask_fn in REGION_MASKS.items()
    }
    region_volumes_ml: Dict[str, float] = {
        region: region_voxels[region] * vox_vol_mm3 / 1000.0
        for region in REGION_MASKS
    }

    return VolumeResult(
        voxel_volume_mm3=vox_vol_mm3,
        spacing_mm=spacing,
        label_voxels=label_voxels,
        label_volumes_ml=label_volumes_ml,
        region_voxels=region_voxels,
        region_volumes_ml=region_volumes_ml,
    )
