# NeuroScope-3D 🧠

> **AI-assisted brain tumour region segmentation and volumetric analysis.**
>
> ⚠️ **MEDICAL DISCLAIMER**: This software is intended for research and educational purposes only. All outputs are **suspected tumour regions predicted by the model** with **estimated volumes**. This is NOT a diagnostic tool, does NOT replace a radiologist, and must NOT be used for clinical decision-making. Always consult a qualified medical professional.

[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com/)
[![MONAI](https://img.shields.io/badge/MONAI-1.3+-orange.svg)](https://monai.io/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](Dockerfile)

---

## Overview

NeuroScope-3D is a full-stack research pipeline for brain tumour segmentation using the [MONAI `brats_mri_segmentation` bundle](https://github.com/Project-MONAI/model-zoo) (SegResNet, Apache-2.0). It accepts four MRI sequences (T1, T1Gd, T2, FLAIR), runs validated preprocessing, performs GPU inference, and delivers:

- Segmentation labels (Whole Tumour / Tumour Core / Enhancing Tumour → BraTS codes 1/2/4)
- Volumetric measurements with explicit formulas
- Interactive 3D + linked-slice web viewer
- Structured PDF report with provenance

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                      Web Browser                        │
│   NiiVue (2D slices) + Three.js (3D mesh) + React UI  │
└───────────────────────┬────────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────▼────────────────────────────────┐
│               FastAPI Backend  (api/)                   │
│  /upload → /predict → /results/:id → /report/:id       │
└───────────────────────┬────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────┐
│               Core Pipeline  (core/)                    │
│  validate → sanity_check → preprocess → infer          │
│  → postprocess → volumes → meshes                      │
└───────────────────────┬────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────┐
│         MONAI brats_mri_segmentation bundle             │
│                SegResNet  (fp16, GPU)                   │
└────────────────────────────────────────────────────────┘

CLI:  python -m core.predict --t1 ... --t1ce ... --t2 ... --flair ... --out pred.nii.gz
```

---

## Quick Start

### Docker (recommended — one command)

```bash
git clone https://github.com/YOUR_ORG/NeuroScope-3D.git
cd NeuroScope-3D
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

### Local development

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/download_bundle.py
uvicorn api.main:app --reload --port 8000
# In another terminal:
cd web && npm install && npm run dev
```

### CLI (judges' scorer path)

```bash
python -m core.predict \
  --t1   path/to/case_t1.nii.gz \
  --t1ce path/to/case_t1ce.nii.gz \
  --t2   path/to/case_t2.nii.gz \
  --flair path/to/case_flair.nii.gz \
  --out  pred.nii.gz
```

---

## Project Structure

```
NeuroScope-3D/
├── core/                    # Pure-Python pipeline (shared by CLI + API)
│   ├── predict.py           # CLI entry point
│   ├── validate.py          # Input validation (8 failure modes)
│   ├── sanity.py            # Skull-strip / brain-volume checks
│   ├── preprocess.py        # RAS, 1 mm resample, channel-wise normalise
│   ├── infer.py             # Bundle inference, fp16, sliding window
│   ├── postprocess.py       # TC/WT/ET → 1/2/4, back-map to original grid
│   ├── volumes.py           # Voxel count × det(affine) formula
│   ├── meshes.py            # Marching cubes + affine transform
│   ├── report.py            # PDF generation (ReportLab)
│   └── cache.py             # SHA-256 result cache
├── api/
│   ├── main.py              # FastAPI app, lifespan model pre-load
│   ├── routers/
│   ├── schemas.py
│   └── cleanup.py           # 24-hour auto-delete background job
├── web/                     # React + Vite frontend
│   ├── src/components/
│   │   ├── Disclaimer.tsx
│   │   ├── UploadWizard.tsx
│   │   ├── SliceViewer.tsx  # NiiVue 2D
│   │   ├── MeshViewer.tsx   # Three.js 3D
│   │   └── VolumePanel.tsx
│   └── public/lib/          # Local JS libs — no CDN
├── tests/                   # Self-verifying test suite
│   ├── test_validation.py
│   ├── test_volumes.py
│   ├── test_orientation.py
│   ├── test_anisotropic.py
│   ├── test_reproducibility.py
│   ├── test_sanity.py
│   ├── test_wording.py      # Banned-phrase linter
│   └── test_e2e.py          # Playwright: linked views + disclaimer
├── eval/
│   ├── run_eval.py
│   ├── case_ids.txt         # Published held-out case list
│   └── results.csv
├── docs/
│   ├── model_card.md
│   ├── LIMITATIONS.md
│   └── api.md
├── scripts/
│   ├── download_bundle.py
│   └── synthetic_test_data.py
├── Dockerfile
├── docker-compose.yml
├── Makefile
└── requirements.txt
```

---

## Pipeline Details

### Channel Order

**Input order to the bundle**: `[T1Gd, T1, T2, FLAIR]`
This differs from BraTS file naming order — mixing this up is the most common bug.

### Label Conversion

```
Bundle outputs (overlapping): TC, WT, ET channels
ET          → label 4
TC \ ET     → label 1
WT \ TC     → label 2
Background  → label 0
Nesting enforced: ET ⊂ TC ⊂ WT
```

### Volume Formula

```
Volume (mL) = N_voxels × |det(affine[:3,:3])| / 1000
```

Spacing is read from the **original NIfTI header** — never assumed to be 1 mm.

---

## Evaluation

| Region | Dice | Sensitivity | n Cases |
|--------|------|-------------|---------|
| WT     | TBD  | TBD         | 10      |
| TC     | TBD  | TBD         | 10      |
| ET     | TBD  | TBD         | 10      |

**Case IDs**: [`eval/case_ids.txt`](eval/case_ids.txt)

**Overlap disclosure**: The MONAI bundle was trained on BraTS 2018. BraTS 2021 includes many cases from earlier years; evaluation cases may overlap with bundle training data. Disclosed here and in every generated report.

**Empty GT handling**: Both empty → Dice = 1.0; sensitivity = N/A.

---

## Privacy & Security

- Uploads auto-deleted within **24 hours** (background task)
- File size checked **before** reading (reject > 1 GB)
- Decompressed size capped (gzip-bomb defence)
- All JS libraries hosted locally — **no external CDNs or API calls**
- Filenames sanitised before file-system operations
- Retention notice shown in UI on every screen

---

## Running Tests

```bash
make test       # Full suite (pytest + Playwright)
make test-unit  # pytest only
make lint       # Wording linter + flake8
```

---

## Data Citations

```bibtex
@misc{brats2021,
  author = {Baid, U. and others},
  title  = {The RSNA-ASNR-MICCAI BraTS 2021 Benchmark},
  year   = {2021},
  doi    = {10.7937/jc8x-9874}
}

@article{msd2019,
  title  = {A large annotated medical image dataset for the development and
            evaluation of segmentation algorithms},
  author = {Simpson, A. L. and others},
  year   = {2019},
  url    = {https://arxiv.org/abs/1902.09063}
}
```

---

## Model

- **Model**: MONAI `brats_mri_segmentation` (SegResNet)
- **Licence**: Apache-2.0
- **Source**: [MONAI Model Zoo](https://github.com/Project-MONAI/model-zoo)
- **Training data**: BraTS 2018 (disclosed above)
- Full details: [`docs/model_card.md`](docs/model_card.md)

---

## License

Apache-2.0 — see [LICENSE](LICENSE).