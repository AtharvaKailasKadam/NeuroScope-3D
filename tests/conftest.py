"""
tests/conftest.py
Shared pytest fixtures — synthetic NIfTI generators.
"""

from __future__ import annotations

import io
import gzip
import tempfile
from pathlib import Path
from typing import Generator, Optional, Tuple

import nibabel as nib
import numpy as np
import pytest


# ---------------------------------------------------------------------------
# Helper: create a synthetic skull-stripped brain NIfTI
# ---------------------------------------------------------------------------

def make_brain_nifti(
    shape: Tuple[int, int, int] = (64, 64, 64),
    affine: Optional[np.ndarray] = None,
    label: Optional[np.ndarray] = None,
    value: float = 1.0,
    spacing: Tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> nib.Nifti1Image:
    """Create a minimal synthetic brain NIfTI for testing."""
    if affine is None:
        affine = np.diag([*spacing, 1.0])
    if label is None:
        data = np.zeros(shape, dtype=np.float32)
        # Fill a sphere in the centre to simulate a skull-stripped brain
        cx, cy, cz = [s // 2 for s in shape]
        r = min(shape) // 3
        xs, ys, zs = np.ogrid[:shape[0], :shape[1], :shape[2]]
        sphere = (xs - cx) ** 2 + (ys - cy) ** 2 + (zs - cz) ** 2 < r ** 2
        data[sphere] = value
    else:
        data = label.astype(np.float32)
    return nib.Nifti1Image(data, affine)


def save_nifti(img: nib.Nifti1Image, path: Path) -> None:
    nib.save(img, str(path))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_dir() -> Generator[Path, None, None]:
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


@pytest.fixture
def valid_case(tmp_dir: Path) -> dict[str, Path]:
    """Four valid skull-stripped brain NIfTIs."""
    paths = {}
    for seq in ("t1", "t1ce", "t2", "flair"):
        img = make_brain_nifti(shape=(64, 64, 64))
        p = tmp_dir / f"case_{seq}.nii.gz"
        save_nifti(img, p)
        paths[seq] = p
    return paths


@pytest.fixture
def cube_case(tmp_dir: Path) -> Tuple[dict[str, Path], nib.Nifti1Image]:
    """
    Synthetic cube case for the volume judge test:
    20×20×20 cube labelled 2, spacing 1×1×2 mm.
    Expected: WT = 8000 × 2 mm³ = 16,000 mm³ = 16.0 mL
    """
    affine = np.diag([1.0, 1.0, 2.0, 1.0])
    shape = (60, 60, 60)
    brain_data = np.zeros(shape, dtype=np.float32)
    # Cube in the centre
    cx, cy, cz = 30, 30, 30
    brain_data[cx-10:cx+10, cy-10:cy+10, cz-10:cz+10] = 1.0

    paths = {}
    for seq in ("t1", "t1ce", "t2", "flair"):
        img = nib.Nifti1Image(brain_data.copy(), affine)
        p = tmp_dir / f"cube_{seq}.nii.gz"
        save_nifti(img, p)
        paths[seq] = p

    # Segmentation: cube labelled 2 (oedema), WT = 8000 vox × 2 mm³ = 16.0 mL
    seg_data = np.zeros(shape, dtype=np.uint8)
    seg_data[cx-10:cx+10, cy-10:cy+10, cz-10:cz+10] = 2
    seg_img = nib.Nifti1Image(seg_data, affine)

    return paths, seg_img
