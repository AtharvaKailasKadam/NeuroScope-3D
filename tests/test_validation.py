"""
tests/test_validation.py
All 8 failure-mode tests from the judge's failure pack.
Each test asserts: ValidationError is raised with a clear message,
and no partial result is produced.
"""

from __future__ import annotations

import gzip
import struct
import tempfile
from pathlib import Path

import nibabel as nib
import numpy as np
import pytest

from core.validate import ValidationError, validate_set, validate_single_file
from tests.conftest import make_brain_nifti, save_nifti


# Alias for brevity
VE = ValidationError


# ---------------------------------------------------------------------------
# 1. Corrupt gzip
# ---------------------------------------------------------------------------

def test_corrupt_gzip(tmp_path: Path):
    """Corrupt gzip → ValidationError with clear message."""
    bad = tmp_path / "bad_t1.nii.gz"
    bad.write_bytes(b"\x1f\x8b" + b"\x00" * 50)  # valid magic, corrupt body
    with pytest.raises(VE, match="corrupt gzip|gzip|decompress"):
        validate_single_file(bad)


# ---------------------------------------------------------------------------
# 2. Non-NIfTI content under a .nii.gz name
# ---------------------------------------------------------------------------

def test_non_nifti_content(tmp_path: Path):
    """Random bytes compressed as .nii.gz → ValidationError."""
    import io
    bad = tmp_path / "fake_t1.nii.gz"
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
        gz.write(b"This is not NIfTI data " * 100)
    bad.write_bytes(buf.getvalue())
    with pytest.raises(VE, match="valid NIfTI|NIfTI|not valid"):
        validate_single_file(bad)


# ---------------------------------------------------------------------------
# 3. 2D volume
# ---------------------------------------------------------------------------

def test_2d_volume(tmp_path: Path):
    """2D NIfTI → ValidationError."""
    data = np.ones((64, 64), dtype=np.float32)
    img = nib.Nifti1Image(data, np.eye(4))
    p = tmp_path / "2d.nii.gz"
    nib.save(img, str(p))
    with pytest.raises(VE, match="2D|ndim"):
        validate_single_file(p)


# ---------------------------------------------------------------------------
# 4. 4D volume
# ---------------------------------------------------------------------------

def test_4d_volume(tmp_path: Path):
    """4D NIfTI → ValidationError."""
    data = np.ones((64, 64, 64, 5), dtype=np.float32)
    img = nib.Nifti1Image(data, np.eye(4))
    p = tmp_path / "4d.nii.gz"
    nib.save(img, str(p))
    with pytest.raises(VE, match="4D|ndim"):
        validate_single_file(p)


# ---------------------------------------------------------------------------
# 5. NaN / Inf values
# ---------------------------------------------------------------------------

def test_nan_values(tmp_path: Path):
    """NaN voxels → ValidationError."""
    data = np.ones((64, 64, 64), dtype=np.float32)
    data[10, 10, 10] = np.nan
    img = nib.Nifti1Image(data, np.eye(4))
    p = tmp_path / "nan.nii.gz"
    nib.save(img, str(p))
    with pytest.raises(VE, match="NaN|Inf"):
        validate_single_file(p)


# ---------------------------------------------------------------------------
# 6. Constant volume
# ---------------------------------------------------------------------------

def test_constant_volume(tmp_path: Path):
    """All-zero volume → ValidationError."""
    data = np.zeros((64, 64, 64), dtype=np.float32)
    img = nib.Nifti1Image(data, np.eye(4))
    p = tmp_path / "const.nii.gz"
    nib.save(img, str(p))
    with pytest.raises(VE, match="constant"):
        validate_single_file(p)


# ---------------------------------------------------------------------------
# 7. Mismatched shapes
# ---------------------------------------------------------------------------

def test_mismatched_shapes(tmp_path: Path):
    """Mismatched shapes → ValidationError with clear per-sequence message."""
    paths: dict[str, Path] = {}
    shapes = {"t1": (64, 64, 64), "t1ce": (64, 64, 64),
              "t2": (64, 64, 64), "flair": (64, 64, 65)}  # flair is different

    for seq, shape in shapes.items():
        img = make_brain_nifti(shape=shape)
        p = tmp_path / f"{seq}.nii.gz"
        save_nifti(img, p)
        paths[seq] = p

    with pytest.raises(VE, match="[Ss]hape mismatch|shape"):
        validate_set(paths)


# ---------------------------------------------------------------------------
# 8. Missing sequences (only three provided)
# ---------------------------------------------------------------------------

def test_missing_sequence(tmp_path: Path):
    """Only three sequences → ValidationError mentioning missing sequence."""
    paths: dict[str, Path] = {}
    for seq in ("t1", "t1ce", "t2"):  # FLAIR missing
        img = make_brain_nifti()
        p = tmp_path / f"{seq}.nii.gz"
        save_nifti(img, p)
        paths[seq] = p

    with pytest.raises(VE, match="[Mm]issing|flair|FLAIR"):
        validate_set(paths)


# ---------------------------------------------------------------------------
# Bonus: File over 1 GB (size check before reading)
# ---------------------------------------------------------------------------

def test_file_too_large(tmp_path: Path, monkeypatch):
    """File over 1 GB → ValidationError before reading."""
    from core import validate as v_module

    # Create a small valid file, but monkey-patch os.path.getsize
    img = make_brain_nifti()
    p = tmp_path / "big.nii.gz"
    save_nifti(img, p)

    monkeypatch.setattr("core.validate.os.path.getsize", lambda _: 2 * 1024 ** 3)
    with pytest.raises(VE, match="1 GB|size limit"):
        validate_single_file(p)
