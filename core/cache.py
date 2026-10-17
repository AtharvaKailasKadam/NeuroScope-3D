"""
core/cache.py
SHA-256-based result cache.

Results are stored on disk keyed by:
    SHA256(t1_bytes + t1ce_bytes + t2_bytes + flair_bytes) + "_" + model_version

This guarantees:
  - Reproducibility (same input → same result, always)
  - Fast repeat demos (sub-second after first run)
"""

from __future__ import annotations

import hashlib
import json
import logging
import pickle
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_DEFAULT_CACHE_DIR = Path(__file__).parent.parent / ".cache" / "results"
_TTL_HOURS = 24  # Auto-expire entries after 24 h


def compute_case_hash(
    file_paths: dict[str, Path],
    config_tag: str = "",
) -> str:
    """
    Compute a deterministic SHA-256 hash over the raw bytes of all input files,
    accounting for missing modalities and pipeline configuration settings.

    Parameters
    ----------
    file_paths : dict {"t1", "t1ce", "t2", "flair"} → Path
    config_tag : str, optional
        Extra configuration string (e.g. TTA / post-processing settings).

    Returns
    -------
    Hex SHA-256 string (64 characters).
    """
    h = hashlib.sha256()
    for key in ("t1ce", "t1", "t2", "flair"):  # canonical order
        path = file_paths.get(key)
        if path and Path(path).exists():
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
        else:
            h.update(f"missing:{key}".encode())
    if config_tag:
        h.update(config_tag.encode())
    return h.hexdigest()


class ResultCache:
    """Disk-backed result cache keyed by (input_sha256, model_version, config)."""

    def __init__(
        self,
        cache_dir: Optional[Path] = None,
        model_version: str = "brats_mri_seg_v1",
        config_suffix: str = "",
    ) -> None:
        self.cache_dir = Path(cache_dir or _DEFAULT_CACHE_DIR)
        self.model_version = f"{model_version}_{config_suffix}" if config_suffix else model_version
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _key_path(self, input_sha: str) -> Path:
        key = f"{input_sha}_{self.model_version}"
        return self.cache_dir / key

    def get(self, input_sha: str) -> Optional[Any]:
        """Return cached result or None if missing / expired."""
        p = self._key_path(input_sha)
        meta_path = p / "meta.json"
        data_path = p / "result.pkl"

        if not (p.exists() and meta_path.exists() and data_path.exists()):
            return None

        try:
            meta = json.loads(meta_path.read_text())
            created = datetime.fromisoformat(meta["created_at"])
            if datetime.utcnow() - created > timedelta(hours=_TTL_HOURS):
                logger.info("Cache entry expired, removing: %s", p)
                shutil.rmtree(p, ignore_errors=True)
                return None

            with open(data_path, "rb") as f:
                result = pickle.load(f)
            logger.info("Cache HIT for sha=%s", input_sha[:16])
            return result
        except Exception as e:
            logger.warning("Cache read error (%s), ignoring: %s", p, e)
            return None

    def put(self, input_sha: str, result: Any) -> None:
        """Store a result in the cache."""
        p = self._key_path(input_sha)
        p.mkdir(parents=True, exist_ok=True)
        meta_path = p / "meta.json"
        data_path = p / "result.pkl"

        meta = {
            "created_at": datetime.utcnow().isoformat(),
            "model_version": self.model_version,
            "input_sha256": input_sha,
        }
        meta_path.write_text(json.dumps(meta, indent=2))
        with open(data_path, "wb") as f:
            pickle.dump(result, f, protocol=pickle.HIGHEST_PROTOCOL)
        logger.info("Cache PUT for sha=%s", input_sha[:16])

    def invalidate(self, input_sha: str) -> None:
        """Remove a specific cache entry."""
        p = self._key_path(input_sha)
        shutil.rmtree(p, ignore_errors=True)

    def purge_expired(self) -> int:
        """Remove all expired entries. Returns number of purged entries."""
        purged = 0
        for entry in self.cache_dir.iterdir():
            meta_path = entry / "meta.json"
            if not meta_path.exists():
                continue
            try:
                meta = json.loads(meta_path.read_text())
                created = datetime.fromisoformat(meta["created_at"])
                if datetime.utcnow() - created > timedelta(hours=_TTL_HOURS):
                    shutil.rmtree(entry, ignore_errors=True)
                    purged += 1
            except Exception:
                pass
        return purged
