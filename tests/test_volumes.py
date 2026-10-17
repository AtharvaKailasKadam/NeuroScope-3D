"""
tests/test_volumes.py
Judge test: synthetic cube volume calculation.

Spec:
  8,000 voxels × 2 mm³ (1×1×2 mm spacing) = 16,000 mm³ = 16.0 mL
  WT = 16.0 mL, TC = 0 mL, ET = 0 mL

Also tests:
  - Anisotropic spacing (never assume 1 mm)
  - Formula string contains correct numbers
"""

from __future__ import annotations

import nibabel as nib
import numpy as np
import pytest

from core.volumes import compute_volumes


def make_cube_seg(
    cube_size: int = 20,
    label: int = 2,
    spacing: tuple = (1.0, 1.0, 2.0),
    pad: int = 10,
) -> nib.Nifti1Image:
    """Create a segmentation with a cube of a given label."""
    total = cube_size + 2 * pad
    shape = (total, total, total)
    data = np.zeros(shape, dtype=np.uint8)
    data[pad:pad+cube_size, pad:pad+cube_size, pad:pad+cube_size] = label
    affine = np.diag([*spacing, 1.0])
    return nib.Nifti1Image(data, affine)


# ---------------------------------------------------------------------------
# Primary judge test
# ---------------------------------------------------------------------------

class TestCubeVolume:
    """
    8,000 voxels (20×20×20) × 2 mm³ (1×1×2 mm) = 16.0 mL.
    Label 2 = oedema → WT only, TC = 0, ET = 0.
    """

    @pytest.fixture(autouse=True)
    def setup(self):
        self.seg = make_cube_seg(cube_size=20, label=2, spacing=(1.0, 1.0, 2.0))
        self.vol = compute_volumes(self.seg)

    def test_wt_volume_is_16_ml(self):
        assert abs(self.vol.region_volumes_ml["WT"] - 16.0) < 0.01, (
            f"WT volume = {self.vol.region_volumes_ml['WT']:.4f} mL, expected 16.0 mL"
        )

    def test_tc_is_zero(self):
        assert self.vol.region_volumes_ml["TC"] == 0.0, (
            f"TC volume should be 0, got {self.vol.region_volumes_ml['TC']}"
        )

    def test_et_is_zero(self):
        assert self.vol.region_volumes_ml["ET"] == 0.0, (
            f"ET volume should be 0, got {self.vol.region_volumes_ml['ET']}"
        )

    def test_wt_voxel_count(self):
        assert self.vol.region_voxels["WT"] == 8000, (
            f"WT voxels = {self.vol.region_voxels['WT']}, expected 8000"
        )

    def test_voxel_volume(self):
        assert abs(self.vol.voxel_volume_mm3 - 2.0) < 1e-9, (
            f"Voxel volume = {self.vol.voxel_volume_mm3}, expected 2.0 mm³"
        )

    def test_formula_string_contains_correct_numbers(self):
        formula = self.vol.formula_string("WT")
        assert "8,000" in formula or "8000" in formula, f"Missing voxel count in: {formula}"
        assert "16.00" in formula or "16.0" in formula, f"Missing volume in: {formula}"

    def test_formula_shows_spacing(self):
        formula = self.vol.formula_string("WT")
        assert "2.000" in formula or "2.0" in formula, f"Missing spacing in: {formula}"


# ---------------------------------------------------------------------------
# Anisotropic spacing test
# ---------------------------------------------------------------------------

class TestAnisotropicSpacing:
    """Volume must use actual header spacing, not assume 1 mm."""

    def test_1x1x3_spacing(self):
        # 10×10×10 cube, 1×1×3 mm → 1000 vox × 3 mm³ = 3000 mm³ = 3.0 mL
        seg = make_cube_seg(cube_size=10, label=2, spacing=(1.0, 1.0, 3.0), pad=5)
        vol = compute_volumes(seg)
        expected_ml = 1000 * 3.0 / 1000.0
        assert abs(vol.region_volumes_ml["WT"] - expected_ml) < 0.01, (
            f"Anisotropic WT = {vol.region_volumes_ml['WT']:.4f}, "
            f"expected {expected_ml:.4f} mL"
        )

    def test_isotropic_1mm(self):
        # 10×10×10 cube, 1×1×1 mm → 1000 vox × 1 mm³ = 1.0 mL
        seg = make_cube_seg(cube_size=10, label=2, spacing=(1.0, 1.0, 1.0), pad=5)
        vol = compute_volumes(seg)
        assert abs(vol.region_volumes_ml["WT"] - 1.0) < 0.01


# ---------------------------------------------------------------------------
# Label exclusivity test
# ---------------------------------------------------------------------------

class TestLabelExclusivity:
    """Labels 1, 2, 4 are mutually exclusive in the segmentation."""

    def test_no_overlap(self):
        shape = (40, 40, 40)
        data = np.zeros(shape, dtype=np.uint8)
        data[0:10, :, :] = 2   # oedema
        data[10:20, :, :] = 1  # necrotic core
        data[20:30, :, :] = 4  # enhancing

        affine = np.eye(4)
        seg = nib.Nifti1Image(data, affine)
        vol = compute_volumes(seg)

        # WT = labels 1+2+4 = 30×40×40 = 48000 vox = 48 mL
        # TC = labels 1+4   = 20×40×40 = 32000 vox = 32 mL
        # ET = label 4      = 10×40×40 = 16000 vox = 16 mL
        assert abs(vol.region_volumes_ml["WT"] - 48.0) < 0.01
        assert abs(vol.region_volumes_ml["TC"] - 32.0) < 0.01
        assert abs(vol.region_volumes_ml["ET"] - 16.0) < 0.01
