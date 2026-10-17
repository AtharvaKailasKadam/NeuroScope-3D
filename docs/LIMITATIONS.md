# LIMITATIONS.md

> ⚠️ This document must be read before using NeuroScope-3D in any context.

---

## 1. Not a Clinical Tool

NeuroScope-3D is a **research prototype**. It:

- Is **NOT** validated for clinical use
- Does **NOT** replace a qualified radiologist or neuroradiologist
- Must **NOT** be used to make patient care decisions
- Must **NOT** be described as a "diagnostic system"

All model outputs are *suspected tumour regions predicted by the model* with *estimated volumes*.

---

## 2. Model Training Overlap

The MONAI `brats_mri_segmentation` model was trained on **BraTS 2018**. The evaluation in this project uses **BraTS 2021**, which includes many cases from earlier BraTS editions (2015–2019). Consequently:

- Some held-out evaluation cases may be present in the model's training data
- Published Dice scores may be inflated compared to a truly independent test set
- This is disclosed in every generated report and in the model card

---

## 3. Domain Limitations

The model performs best on:
- Skull-stripped glioma MRI in standard BraTS acquisition protocol
- MRI scanners and field strengths similar to TCGA/TCIA datasets

Performance may degrade significantly for:
- Non-skull-stripped scans
- Non-glioma pathologies (meningioma, metastases, etc.)
- Non-standard acquisition protocols
- Paediatric patients
- Post-treatment scans

---

## 4. Enhancing Tumour (ET) Uncertainty

Small Enhancing Tumour regions are particularly uncertain:
- ET Dice is typically lower than WT/TC
- Small ET volumes (< 1 mL) are unreliable
- False positives in necrotic regions are possible

---

## 5. Privacy

- Uploaded data is automatically deleted within 24 hours
- Immediate one-click case deletion is available via DELETE /api/results/{case_id}
- Filenames are sanitised; no metadata is retained
- No data is transmitted to external APIs or CDNs

---

## 6. Reproducibility & Determinism

- Fixed seeds (42) are set globally for all random operations
- Inference is deterministic within numerical tolerance on CPU and GPU
- Sliding-window fp16 GPU execution may exhibit minor floating-point non-associative drift; bit-identical reproducibility is guaranteed when retrieving from the SHA-256 result cache
- Results are cached by SHA-256 of input files, model version, and pipeline configuration (TTA, ensemble, and ET threshold parameters)

---

## 7. Required Disclaimer Wording

The following phrases are **required** in all reports and UI:
- *"suspected tumour region predicted by the model"*
- *"estimated volume"*

The following phrases are **prohibited** in all outputs:
- "tumour detected"
- "diagnostic system" / "diagnostic tool" (without "NOT")
- "replaces the radiologist"
- "clinical diagnosis"
