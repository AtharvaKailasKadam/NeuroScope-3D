"""
tests/test_sanity.py
Tests for skull-strip and brain-volume sanity checks.
"""

from __future__ import annotations

import nibabel as nib
import numpy as np
import pytest

from core.sanity import sanity_check


def _make_images(data: np.ndarray, affine=None) -> dict:
    if affine is None:
        affine = np.eye(4)
    img = nib.Nifti1Image(data, affine)
    return {"t1": img, "t1ce": img, "t2": img, "flair": img}


# ---------------------------------------------------------------------------
# Valid skull-stripped brain (sphere ~1200 mL at 1 mm)
# ---------------------------------------------------------------------------

def test_valid_brain_passes():
    """A plausible skull-stripped brain should pass."""
    shape = (200, 200, 200)
    data = np.zeros(shape, dtype=np.float32)
    cx, cy, cz = 100, 100, 100
    r = 60  # ~904 mL sphere
    xs, ys, zs = np.ogrid[:200, :200, :200]
    sphere = (xs - cx)**2 + (ys - cy)**2 + (zs - cz)**2 < r**2
    data[sphere] = 1.0
    images = _make_images(data)
    result = sanity_check(images)
    assert result.passed, f"Should pass. Errors: {result.errors}, Warnings: {result.warnings}"


# ---------------------------------------------------------------------------
# Too-small volume → not a brain
# ---------------------------------------------------------------------------

def test_too_small_volume_fails():
    """A tiny non-zero volume (synthetic cube, 100 mL) → sanity error."""
    shape = (100, 100, 100)
    data = np.zeros(shape, dtype=np.float32)
    data[40:60, 40:60, 40:60] = 1.0  # 8000 vox × 1mm³ = 8 mL  → FAR too small
    images = _make_images(data)
    result = sanity_check(images)
    assert not result.passed, "Expected sanity failure for tiny volume."
    assert any("volume" in e.lower() or "brain" in e.lower() for e in result.errors)


# ---------------------------------------------------------------------------
# Low background fraction → likely not skull-stripped
# ---------------------------------------------------------------------------

def test_not_skull_stripped_warns():
    """Nearly all-nonzero volume → warning about skull-stripping."""
    shape = (100, 100, 100)
    data = np.ones(shape, dtype=np.float32)  # 100% non-zero = no background
    # Make it a valid brain size first (1000 mL at 1mm³)
    affine = np.diag([1.0, 1.0, 1.0, 1.0])
    images = _make_images(data, affine)
    result = sanity_check(images)
    has_skull_warn = any(
        "skull" in w.lower() or "stripped" in w.lower() or "background" in w.lower()
        for w in result.warnings
    )
    assert has_skull_warn, f"Expected skull-strip warning. Got: {result.warnings}"


# ---------------------------------------------------------------------------
# Non-brain shape warning
# ---------------------------------------------------------------------------

def test_unusual_shape_warns():
    """Unusual dimensions trigger a shape warning."""
    shape = (10, 10, 10)  # 10 mm each — too small a dimension
    data = np.ones(shape, dtype=np.float32)
    data[:5] = 0.0  # partial background
    images = _make_images(data)
    result = sanity_check(images)
    # Should warn (shape or volume), doesn't need to be a hard fail
    has_warn_or_err = result.warnings or result.errors
    assert has_warn_or_err, "Expected at least a warning for unusual shape."
