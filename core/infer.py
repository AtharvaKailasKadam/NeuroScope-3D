"""
core/infer.py
Bundle inference — SegResNet, fp16, sliding window, deterministic.

The model is loaded ONCE at module level (or via load_model()) and reused
across requests to meet the <2-minute time budget.
"""

from __future__ import annotations

import logging
import os
import random
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
from monai.bundle import ConfigParser
from monai.inferers import SlidingWindowInferer

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Reproducibility seeds — fixed globally
# ---------------------------------------------------------------------------
_SEED = 42

def _set_deterministic(seed: int = _SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    os.environ["PYTHONHASHSEED"] = str(seed)


_set_deterministic()


# ---------------------------------------------------------------------------
# Model singleton
# ---------------------------------------------------------------------------

_model: Optional[torch.nn.Module] = None
_device: Optional[torch.device] = None

BUNDLE_ROOT = Path(
    os.environ.get(
        "BUNDLE_ROOT",
        Path(__file__).parent.parent / "models" / "brats_mri_segmentation",
    )
)


def load_model(bundle_root: Optional[Path] = None) -> torch.nn.Module:
    """
    Load the MONAI brats_mri_segmentation bundle model.
    Cached in module-level singleton after first call.

    Parameters
    ----------
    bundle_root : Path, optional
        Override the default bundle root (useful for testing).

    Returns
    -------
    torch.nn.Module on the appropriate device (CUDA if available, else CPU).
    """
    global _model, _device

    if _model is not None:
        return _model

    root = bundle_root or BUNDLE_ROOT
    logger.info("Loading MONAI bundle from %s …", root)

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Using device: %s", _device)

    # Parse bundle config
    config_path = root / "configs" / "inference.json"
    if not config_path.exists():
        raise FileNotFoundError(
            f"Bundle inference config not found at {config_path}. "
            "Run `python scripts/download_bundle.py` first."
        )

    parser = ConfigParser()
    parser.read_config(str(config_path))
    parser["bundle_root"] = str(root)

    _model = parser.get_parsed_content("network_def", instantiate=True)
    ckpt_path = root / "models" / "model.pt"
    if not ckpt_path.exists():
        raise FileNotFoundError(
            f"Model checkpoint not found at {ckpt_path}. "
            "Run `python scripts/download_bundle.py` first."
        )

    _model.load_state_dict(torch.load(str(ckpt_path), map_location=_device))
    _model.to(_device)
    _model.eval()

    # Warm-up pass (prevents first-request latency spike)
    logger.info("Warming up model with a dummy pass …")
    with torch.no_grad(), torch.cuda.amp.autocast(enabled=_device.type == "cuda"):
        dummy = torch.zeros(1, 4, 64, 64, 64, device=_device)
        _ = _model(dummy)

    logger.info("Model ready.")
    return _model


# ---------------------------------------------------------------------------
# Test-Time Augmentation (TTA) Flip Configurations
# ---------------------------------------------------------------------------
# For input tensor (1, 4, D, H, W): spatial dims are 2, 3, 4
# For prob tensor (3, D, H, W): spatial dims are 1, 2, 3
TTA_CONFIGS: List[Dict[str, Any]] = [
    {"name": "identity", "inp_dims": (), "prob_dims": ()},
    {"name": "flip_w",    "inp_dims": (4,), "prob_dims": (3,)},  # Sagittal / Width
    {"name": "flip_h",    "inp_dims": (3,), "prob_dims": (2,)},  # Coronal / Height
    {"name": "flip_d",    "inp_dims": (2,), "prob_dims": (1,)},  # Axial / Depth
]


def _forward_sliding_window(
    inp: torch.Tensor,
    model: torch.nn.Module,
    device: torch.device,
    roi_size: Tuple[int, int, int] = (128, 128, 128),
) -> torch.Tensor:
    """Run a single sliding-window pass and return sigmoid probabilities (3, D, H, W)."""
    inferer = SlidingWindowInferer(
        roi_size=roi_size,
        sw_batch_size=2,
        overlap=0.5,
        mode="gaussian",
        progress=False,
    )
    use_amp = device.type == "cuda"
    with torch.no_grad(), torch.cuda.amp.autocast(enabled=use_amp):
        output = inferer(inp, model)
    return torch.sigmoid(output[0])


_secondary_model: Optional[torch.nn.Module] = None


def load_secondary_model(bundle_root: Optional[Path] = None) -> Optional[torch.nn.Module]:
    """
    Load a secondary model for ensembling (e.g. SwinUNETR or secondary checkpoint).
    If a secondary checkpoint exists in models/model_secondary.pt, loads it.
    Returns None if secondary weights are not present.
    """
    global _secondary_model, _device
    if _secondary_model is not None:
        return _secondary_model

    root = bundle_root or BUNDLE_ROOT
    ckpt_path = root / "models" / "model_secondary.pt"
    if not ckpt_path.exists():
        return None

    try:
        config_path = root / "configs" / "inference.json"
        parser = ConfigParser()
        parser.read_config(str(config_path))
        parser["bundle_root"] = str(root)
        sec_model = parser.get_parsed_content("network_def", instantiate=True)
        sec_model.load_state_dict(torch.load(str(ckpt_path), map_location=_device))
        sec_model.to(_device)
        sec_model.eval()
        _secondary_model = sec_model
        logger.info("Secondary ensemble model loaded successfully.")
        return _secondary_model
    except Exception as e:
        logger.warning("Could not load secondary model: %s", e)
        return None


def run_inference(
    tensor: torch.Tensor,
    use_tta: bool = False,
    use_ensemble: bool = False,
    return_uncertainty: bool = False,
) -> Any:
    """
    Run sliding-window inference on a preprocessed tensor with optional TTA and ensembling.

    Parameters
    ----------
    tensor : torch.Tensor  shape (4, D, H, W)  float32
    use_tta : bool
        If True, runs 4-pass test-time augmentation (Identity + 3 spatial flips).
    use_ensemble : bool
        If True, combines predictions with secondary model checkpoint or multi-scale pass.
    return_uncertainty : bool
        If True, returns (probs, uncertainty_map, meta_stats).
        If False (default), returns probs for backwards compatibility.

    Returns
    -------
    probs : torch.Tensor  shape (3, D, H, W)
    (optional) uncertainty_map : torch.Tensor shape (D, H, W) in range [0, 1]
    (optional) meta_stats : dict with TTA and ensemble ablation metrics
    """
    _set_deterministic()
    model = load_model()
    device = _device

    # Add batch dimension: (1, 4, D, H, W)
    inp = tensor.unsqueeze(0).to(device)

    # 1. Primary Model Pass(es)
    prob_passes: List[torch.Tensor] = []

    if use_tta:
        logger.info("Running 4-pass Test-Time Augmentation (TTA) with spatial flips …")
        for cfg in TTA_CONFIGS:
            if cfg["inp_dims"]:
                flipped_inp = torch.flip(inp, dims=cfg["inp_dims"])
            else:
                flipped_inp = inp

            raw_prob = _forward_sliding_window(flipped_inp, model, device)

            # Un-flip probabilities back to canonical orientation
            if cfg["prob_dims"]:
                aligned_prob = torch.flip(raw_prob, dims=cfg["prob_dims"])
            else:
                aligned_prob = raw_prob

            prob_passes.append(aligned_prob.cpu())
    else:
        single_prob = _forward_sliding_window(inp, model, device)
        prob_passes.append(single_prob.cpu())

    # Mean probability from primary model passes
    primary_mean = torch.stack(prob_passes, dim=0).mean(dim=0)

    # Voxel-wise variance across TTA passes
    if len(prob_passes) > 1:
        tta_variance = torch.stack(prob_passes, dim=0).var(dim=0, unbiased=False)  # (3, D, H, W)
    else:
        # Single-pass proxy: margin uncertainty 4 * p * (1 - p)
        tta_variance = 4.0 * primary_mean * (1.0 - primary_mean) * 0.05

    final_probs = primary_mean
    ensemble_variance = torch.zeros_like(primary_mean)
    is_ensemble_active = False

    # 2. Ensemble with Secondary Model (if requested)
    if use_ensemble:
        sec_model = load_secondary_model()
        if sec_model is not None:
            logger.info("Running secondary ensemble model pass …")
            sec_prob = _forward_sliding_window(inp, sec_model, device).cpu()
            ensemble_variance = 0.5 * ((primary_mean - sec_prob) ** 2)
            final_probs = 0.5 * (primary_mean + sec_prob)
            is_ensemble_active = True
        else:
            # Multi-scale patch fallback ensemble (128^3 + 96^3 blended inference)
            logger.info("Running multi-scale patch ensemble (128³ + 96³ blend) …")
            ms_prob = _forward_sliding_window(inp, model, device, roi_size=(96, 96, 96)).cpu()
            ensemble_variance = 0.5 * ((primary_mean - ms_prob) ** 2)
            final_probs = 0.6 * primary_mean + 0.4 * ms_prob
            is_ensemble_active = True

    # 3. Compute Composite Uncertainty Map
    # Mean variance across tumor classes (TC, WT, ET) scaled to [0, 1]
    total_var = tta_variance + ensemble_variance
    # Bernoulli max variance is 0.25; multiply by 4 to normalize to [0, 1]
    mean_uncertainty = (total_var.mean(dim=0) * 4.0).clamp(0.0, 1.0)

    if not return_uncertainty:
        return final_probs

    meta_stats = {
        "tta_enabled": use_tta,
        "tta_passes": len(prob_passes),
        "ensemble_enabled": is_ensemble_active,
        "mean_uncertainty_score": float(mean_uncertainty.mean().item()),
        "max_uncertainty_score": float(mean_uncertainty.max().item()),
    }
    return final_probs, mean_uncertainty, meta_stats
