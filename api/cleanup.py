"""
api/cleanup.py
Background task: auto-delete uploads and results older than 24 hours.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")
TTL = timedelta(hours=24)
CHECK_INTERVAL_SECONDS = 3600  # run every hour


async def _cleanup_loop() -> None:
    while True:
        try:
            _purge_old_uploads()
        except Exception as e:
            logger.warning("Cleanup error: %s", e)
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


def _purge_old_uploads() -> None:
    if not UPLOAD_DIR.exists():
        return
    cutoff = datetime.utcnow() - TTL
    for case_dir in UPLOAD_DIR.iterdir():
        if not case_dir.is_dir():
            continue
        mtime = datetime.utcfromtimestamp(case_dir.stat().st_mtime)
        if mtime < cutoff:
            shutil.rmtree(case_dir, ignore_errors=True)
            logger.info("Auto-deleted expired upload: %s", case_dir.name)


def start_cleanup_task() -> asyncio.Task:
    loop = asyncio.get_event_loop()
    return loop.create_task(_cleanup_loop())
