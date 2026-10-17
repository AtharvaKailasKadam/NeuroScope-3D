"""
api/main.py
FastAPI application — model is pre-loaded at startup (not per request).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routers import predict, results, upload
from api.cleanup import start_cleanup_task

logger = logging.getLogger(__name__)

DISCLAIMER = (
    "⚠️ MEDICAL DISCLAIMER: All outputs are suspected tumour regions predicted by "
    "the model with estimated volumes. This is NOT a diagnostic tool and does NOT "
    "replace a radiologist. For research and educational purposes only."
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load the model on startup to meet the 2-minute time budget."""
    logger.info("Loading SegResNet model at startup …")
    from core.infer import load_model
    load_model()
    logger.info("Model ready. Starting cleanup task …")
    cleanup_task = start_cleanup_task()
    yield
    cleanup_task.cancel()
    logger.info("Shutdown complete.")


app = FastAPI(
    title="NeuroScope-3D API",
    description=(
        "Brain tumour segmentation and volumetric analysis — for research use only.\n\n"
        + DISCLAIMER
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS — restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(upload.router,  prefix="/api/upload",  tags=["Upload"])
app.include_router(predict.router, prefix="/api/predict", tags=["Predict"])
app.include_router(results.router, prefix="/api/results", tags=["Results"])


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "disclaimer": DISCLAIMER,
        "model": "brats_mri_segmentation (SegResNet)",
        "licence": "Apache-2.0",
    }
