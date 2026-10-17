"""
core/meshes.py
Surface mesh generation for the 3D viewer.

For each label region:
  1. Run marching cubes on the binary mask
  2. Transform vertices from voxel indices → world mm using the affine
  3. Flip face winding if the affine determinant is negative
     (left-handed coordinate system would invert normals)

Returns serialisable dicts (vertices, faces, normals) per region.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import nibabel as nib
import numpy as np
from skimage.measure import marching_cubes


# ---------------------------------------------------------------------------
# Region definitions
# ---------------------------------------------------------------------------

MESH_REGIONS: Dict[str, Tuple[str, np.ndarray]] = {
    # name → (display_name, label_values_included)
    "WT":    ("Whole Tumour",            np.array([1, 2, 4])),
    "TC":    ("Tumour Core",             np.array([1, 4])),
    "ET":    ("Enhancing Tumour",        np.array([4])),
    "brain": ("Brain (non-zero)",        None),   # handled specially
}

# Colour palette — colour-blind safe
REGION_COLOURS: Dict[str, str] = {
    "WT":    "#FF6B6B",   # coral red
    "TC":    "#FFD93D",   # yellow
    "ET":    "#6BCB77",   # green
    "brain": "#4D96FF",   # blue
}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

@dataclass_mesh := None  # forward declaration


def generate_meshes(
    seg_img: nib.Nifti1Image,
    regions: Optional[List[str]] = None,
    level: float = 0.5,
    step_size: int = 2,
    smooth_iterations: int = 0,
) -> Dict[str, dict]:
    """
    Generate 3D meshes for the requested regions.

    Parameters
    ----------
    seg_img        : nib.Nifti1Image  — segmentation in original space
    regions        : list of region keys (defaults to all)
    level          : marching cubes iso-level (0.5 for binary masks)
    step_size      : voxel step for marching cubes (trade accuracy for speed)
    smooth_iterations : Laplacian smoothing passes (0 = off)

    Returns
    -------
    dict  region_key → {"vertices": [...], "faces": [...], "normals": [...],
                         "colour": "#RRGGBB", "label": "Human name"}
    """
    if regions is None:
        regions = list(MESH_REGIONS.keys())

    data = np.asarray(seg_img.dataobj, dtype=np.uint8)
    affine = seg_img.affine
    det = float(np.linalg.det(affine[:3, :3]))
    flip_winding = det < 0  # Left-handed affine → flip face winding

    meshes: Dict[str, dict] = {}

    for region_key in regions:
        if region_key not in MESH_REGIONS:
            continue

        display_name, label_values = MESH_REGIONS[region_key]

        # Build binary mask
        if label_values is None:
            # Brain: all non-zero
            mask = data > 0
        else:
            mask = np.isin(data, label_values)

        if not mask.any():
            meshes[region_key] = {
                "vertices": [],
                "faces": [],
                "normals": [],
                "colour": REGION_COLOURS.get(region_key, "#888888"),
                "label": display_name,
                "empty": True,
            }
            continue

        # Pad by 1 voxel to ensure closed mesh at boundaries
        padded = np.pad(mask.astype(np.float32), 1, mode="constant", constant_values=0)

        try:
            verts, faces, normals, _ = marching_cubes(
                padded,
                level=level,
                step_size=step_size,
                allow_degenerate=False,
            )
        except Exception:
            meshes[region_key] = {
                "vertices": [], "faces": [], "normals": [],
                "colour": REGION_COLOURS.get(region_key, "#888888"),
                "label": display_name, "empty": True,
            }
            continue

        # Undo padding offset
        verts -= 1.0

        # Smooth (optional)
        if smooth_iterations > 0:
            verts = _laplacian_smooth(verts, faces, iterations=smooth_iterations)

        # Transform vertices from voxel → world mm
        verts_h = np.hstack([verts, np.ones((len(verts), 1))])  # homogeneous
        world_verts = (affine @ verts_h.T).T[:, :3]

        # Flip winding order if left-handed affine
        if flip_winding:
            faces = faces[:, ::-1]

        meshes[region_key] = {
            "vertices": world_verts.tolist(),
            "faces": faces.tolist(),
            "normals": normals.tolist(),
            "colour": REGION_COLOURS.get(region_key, "#888888"),
            "label": display_name,
            "empty": False,
        }

    return meshes


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _laplacian_smooth(
    verts: np.ndarray,
    faces: np.ndarray,
    iterations: int = 3,
    relaxation: float = 0.5,
) -> np.ndarray:
    """Simple Laplacian smoothing for mesh vertices."""
    verts = verts.copy()
    n = len(verts)
    adjacency: List[set] = [set() for _ in range(n)]
    for f in faces:
        for i in range(3):
            for j in range(3):
                if i != j:
                    adjacency[f[i]].add(f[j])

    for _ in range(iterations):
        new_verts = verts.copy()
        for vi in range(n):
            neighbours = list(adjacency[vi])
            if neighbours:
                centroid = verts[neighbours].mean(axis=0)
                new_verts[vi] = verts[vi] + relaxation * (centroid - verts[vi])
        verts = new_verts

    return verts
