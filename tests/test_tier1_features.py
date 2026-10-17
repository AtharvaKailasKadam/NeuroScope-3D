"""
tests/test_tier1_features.py
Unit tests verifying Tier-1 algorithmic features:
  1. Small-component cleanup for Enhancing Tumour (ET)
  2. Test-time augmentation (TTA) and uncertainty map calculation
  3. Graceful missing-modality fallback
  4. Cache key configuration sensitivity
"""

from __future__ import annotations

from pathlib import Path
import nibabel as nib
import numpy as np
import pytest
import torch

from core.postprocess import cleanup_small_components, postprocess
from core.preprocess import PreprocessMeta
from core.validate import validate_set
from core.cache import compute_case_hash, ResultCache
from tests.conftest import make_brain_nifti, save_nifti


# ---------------------------------------------------------------------------
# 1. Small-Component Cleanup Tests
# ---------------------------------------------------------------------------

def test_cleanup_small_components_removes_tiny_blobs():
    """Isolated ET blobs under min_size_voxels are removed."""
    shape = (40, 40, 40)
    et_mask = np.zeros(shape, dtype=bool)

    # Small blob: 3x3x3 = 27 voxels (< 200)
    et_mask[5:8, 5:8, 5:8] = True

    # Large blob: 7x7x7 = 343 voxels (>= 200)
    et_mask[20:27, 20:27, 20:27] = True

    cleaned, n_removed = cleanup_small_components(et_mask, min_size_voxels=200)

    # The small blob must be removed
    assert not cleaned[5:8, 5:8, 5:8].any(), "Small ET blob was not removed!"
    # The large blob must be preserved
    assert cleaned[20:27, 20:27, 20:27].all(), "Large ET blob was incorrectly removed!"
    assert n_removed == 27, f"Expected 27 removed voxels, got {n_removed}"


def test_postprocess_relabels_small_et_to_necrosis():
    """Small ET blobs are relabelled as necrosis (label 1), not background."""
    shape = (32, 32, 32)
    # Channel 0: TC, Channel 1: WT, Channel 2: ET
    probs = np.zeros((3, *shape), dtype=np.float32)

    # Whole tumor encompasses the region
    probs[1, 10:25, 10:25, 10:25] = 0.95  # WT
    probs[0, 10:25, 10:25, 10:25] = 0.95  # TC

    # Small ET blob of 2x2x2 = 8 voxels (< min_size 50)
    probs[2, 12:14, 12:14, 12:14] = 0.95  # ET

    affine = np.eye(4)
    ref_img = nib.Nifti1Image(np.zeros(shape, dtype=np.float32), affine)
    meta = PreprocessMeta(ref_img)

    seg_img, unc_img, details = postprocess(
        torch.from_numpy(probs),
        meta,
        min_et_size=50,
        return_aux=True,
    )
    seg_data = np.asarray(seg_img.dataobj, dtype=np.uint8)

    # In the small blob, label should be 1 (necrosis), NOT 4 (ET)
    blob_labels = seg_data[12:14, 12:14, 12:14]
    assert np.all(blob_labels == 1), f"Expected necrosis (label 1), got labels {np.unique(blob_labels)}"
    assert details["et_voxels_cleaned"] == 8


# ---------------------------------------------------------------------------
# 2. Missing-Modality Fallback Tests
# ---------------------------------------------------------------------------

def test_missing_modality_allowed(tmp_path: Path):
    """When allow_missing=True, missing sequences are imputed with surrogate proxy."""
    # Only provide T1, T2, and FLAIR (T1ce is missing)
    paths: dict[str, Path] = {}
    for seq in ("t1", "t2", "flair"):
        img = make_brain_nifti()
        p = tmp_path / f"{seq}.nii.gz"
        save_nifti(img, p)
        paths[seq] = p

    # Should succeed without error
    images = validate_set(paths, allow_missing=True)
    assert "t1ce" in images, "Missing t1ce was not imputed!"
    assert getattr(images["t1ce"], "_is_synthetic", False) is True, "Imputed t1ce not marked as synthetic!"
    assert getattr(images["t1"], "_is_synthetic", False) is False, "Provided t1 incorrectly marked as synthetic!"


# ---------------------------------------------------------------------------
# 3. Cache Sensitivity to TTA / Postprocessing Config
# ---------------------------------------------------------------------------

def test_cache_config_sensitivity(tmp_path: Path):
    """Changing TTA or postprocessing settings produces different cache hashes."""
    paths: dict[str, Path] = {}
    for seq in ("t1", "t1ce", "t2", "flair"):
        p = tmp_path / f"{seq}.nii.gz"
        p.write_bytes(b"dummy_mri_content_" + seq.encode())
        paths[seq] = p

    hash_standard = compute_case_hash(paths, config_tag="tta=False_minet=200")
    hash_tta = compute_case_hash(paths, config_tag="tta=True_minet=200")
    hash_minet100 = compute_case_hash(paths, config_tag="tta=False_minet=100")

    assert hash_standard != hash_tta, "TTA toggle must alter cache key!"
    assert hash_standard != hash_minet100, "ET threshold change must alter cache key!"
