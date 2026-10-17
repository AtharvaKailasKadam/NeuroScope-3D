"""
tests/test_reproducibility.py
Reproducibility judge test:
  Run the postprocessing pipeline on the same synthetic input twice.
  Assert Dice ≥ 0.99 (target: bit-identical).
"""

from __future__ import annotations

import numpy as np
import nibabel as nib
import torch
import pytest

from core.postprocess import postprocess
from core.preprocess import PreprocessMeta


def _make_meta(shape=(64, 64, 64), spacing=(1.0, 1.0, 1.0)) -> PreprocessMeta:
    affine = np.diag([*spacing, 1.0])
    img = nib.Nifti1Image(np.zeros(shape, dtype=np.float32), affine)
    return PreprocessMeta(img)


def _make_fake_probs(shape=(64, 64, 64), seed=42) -> torch.Tensor:
    """Generate reproducible fake model output probabilities."""
    rng = np.random.default_rng(seed)
    probs = rng.random((3, *shape)).astype(np.float32)
    return torch.from_numpy(probs)


def _dice(a: np.ndarray, b: np.ndarray) -> float:
    inter = int(np.sum((a > 0) & (b > 0)))
    denom = int(np.sum(a > 0)) + int(np.sum(b > 0))
    if denom == 0:
        return 1.0
    return 2 * inter / denom


class TestReproducibility:

    def test_postprocess_bit_identical(self):
        """Same fake probs → bit-identical label maps."""
        probs = _make_fake_probs()
        meta = _make_meta()

        out1 = postprocess(probs.clone(), meta)
        out2 = postprocess(probs.clone(), meta)

        arr1 = np.asarray(out1.dataobj, dtype=np.uint8)
        arr2 = np.asarray(out2.dataobj, dtype=np.uint8)

        assert np.array_equal(arr1, arr2), (
            "Postprocessing is not bit-identical — check for random operations."
        )

    def test_postprocess_dice_geq_099(self):
        """Same input → Dice ≥ 0.99 across runs (allowing for any nondeterminism)."""
        probs = _make_fake_probs(seed=7)
        meta = _make_meta()

        results = [
            np.asarray(postprocess(probs.clone(), meta).dataobj, dtype=np.uint8)
            for _ in range(3)
        ]

        for i in range(len(results) - 1):
            d = _dice(results[i], results[i + 1])
            assert d >= 0.99, (
                f"Run {i} vs {i+1}: Dice = {d:.6f} (expected ≥ 0.99). "
                "Non-determinism detected in postprocessing."
            )

    def test_volume_deterministic(self):
        """Same segmentation → identical volume calculations."""
        data = np.zeros((40, 40, 40), dtype=np.uint8)
        data[10:20, 10:20, 10:20] = 2
        affine = np.diag([1.5, 1.5, 2.0, 1.0])
        seg = nib.Nifti1Image(data, affine)

        from core.volumes import compute_volumes
        v1 = compute_volumes(seg)
        v2 = compute_volumes(seg)

        assert v1.region_volumes_ml == v2.region_volumes_ml, (
            "Volume computation is not deterministic."
        )
