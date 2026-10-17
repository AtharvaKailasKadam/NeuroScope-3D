# Model Card — NeuroScope-3D

> **For research and educational purposes only. Not a clinical decision support tool.**

---

## Model Details

| Field              | Value |
|--------------------|-------|
| **Model name**     | `brats_mri_segmentation` |
| **Architecture**   | SegResNet (3D residual U-Net variant) |
| **Framework**      | MONAI (Project-MONAI/model-zoo) |
| **Licence**        | Apache-2.0 |
| **Version used**   | v0.5.9 (pinned in `scripts/download_bundle.py`) |
| **Source**         | https://github.com/Project-MONAI/model-zoo |
| **Task**           | Multi-class 3D brain tumour segmentation |
| **Output classes** | TC (Tumour Core), WT (Whole Tumour), ET (Enhancing Tumour) |
| **Label mapping**  | ET → 4, TC\ET → 1, WT\TC → 2, BG → 0 |

---

## Training Data

- **Primary**: BraTS 2018 dataset (glioma multi-institutional MRI)
- **Input modalities**: T1Gd, T1, T2, FLAIR (in this order)
- **Target annotation**: Multi-label BraTS segmentation

> ⚠️ **Overlap disclosure**: BraTS 2021 (used for evaluation in this project) contains many cases from earlier BraTS editions (2015–2019). Our evaluation cases may overlap with the model's training data. This is disclosed explicitly in all evaluation reports.

---

## Intended Use

- **Primary use**: Research, algorithm development, benchmarking
- **Not intended for**: Clinical diagnosis, treatment planning, patient care

---

## Preprocessing

1. Reorient to RAS+ using the NIfTI affine
2. Resample to 1 mm isotropic (trilinear for inputs)
3. Stack channels in order: [T1Gd, T1, T2, FLAIR]
4. Non-zero voxel-wise z-score normalisation per channel

---

## Inference & Modeling Enhancements

- **Sliding window**: 128×128×128 patches, 50% overlap, Gaussian weighting
- **Mixed precision**: fp16 on GPU with automatic CPU fallback
- **Test-Time Augmentation (TTA)**: 4-pass spatial symmetry flips (identity, sagittal, coronal, axial) with inverse transformation and probability averaging
- **Uncertainty mapping**: Voxel-wise variance across TTA passes exported as a normalized continuous uncertainty field [0, 1]
- **Post-inference**: Sigmoid activation, small-component morphological filtering (ET blobs < 200 voxels relabelled to necrosis), nesting enforcement (ET ⊂ TC ⊂ WT)
- **Missing-modality handling**: Graceful fallback using structural proxy imputation when sequences are omitted

---

## Performance

*Evaluated on 10 held-out BraTS 2021 cases (see `eval/case_ids.txt`):*

| Region | Dice   | Sensitivity |
|--------|--------|-------------|
| WT     | (TBD)  | (TBD)       |
| TC     | (TBD)  | (TBD)       |
| ET     | (TBD)  | (TBD)       |

---

## Known Limitations

- **Small ET**: Enhancing Tumour is small and often noisy; sensitivity may be lower for small ET.
- **Low-grade glioma**: Model was trained primarily on high-grade glioma; low-grade performance is uncertain.
- **Domain shift**: Performance may degrade on non-BraTS acquisition protocols or scanners.
- **Other pathologies**: Model is specific to glioma; it may produce spurious output on other pathologies.
- **Not skull-stripped**: The model requires skull-stripped input; non-stripped scans will degrade results.
- **Training data overlap**: Disclosed above — evaluation Dice may be inflated.

---

## Ethical Considerations

- All outputs carry the disclaimer: *"suspected tumour regions predicted by the model"*
- Volumes are described as *"estimated"*
- The terms "tumour detected", "diagnostic system", and "replaces the radiologist" are prohibited in all outputs
- Uploaded data is auto-deleted within 24 hours
- No data is sent to external APIs or CDNs

---

## Citation

```bibtex
@misc{brats_mri_segmentation,
  title  = {MONAI brats\_mri\_segmentation bundle},
  author = {MONAI Consortium},
  year   = {2023},
  url    = {https://github.com/Project-MONAI/model-zoo}
}

@misc{brats2021,
  author = {Baid, U. and others},
  title  = {The RSNA-ASNR-MICCAI BraTS 2021 Benchmark},
  year   = {2021},
  doi    = {10.7937/jc8x-9874}
}
```
