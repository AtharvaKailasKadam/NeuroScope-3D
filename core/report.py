"""
core/report.py
PDF report generation using ReportLab.

Required content per specification:
  - Volumes with formula (N voxels × dx×dy×dz mm³ = X mL)
  - Per-region metrics (if expert mask provided)
  - Provenance: model name/version/licence, preprocessing, input SHA-256, commit, timestamp
  - Limitations section
  - Disclaimer banner (required wording)

Prohibited wording (enforced by test_wording.py):
  - "tumour detected" → use "suspected tumour region predicted by the model"
  - "diagnostic" (without NOT)
  - "replaces the radiologist"
"""

from __future__ import annotations

import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

_styles = getSampleStyleSheet()
_TITLE = ParagraphStyle(
    "Title2", parent=_styles["Title"], fontSize=18, spaceAfter=6, textColor=colors.HexColor("#1a237e")
)
_H2 = ParagraphStyle(
    "H2", parent=_styles["Heading2"], fontSize=13, spaceBefore=12, spaceAfter=4, textColor=colors.HexColor("#283593")
)
_BODY = ParagraphStyle(
    "Body2", parent=_styles["Normal"], fontSize=9, leading=14
)
_DISCLAIMER_STYLE = ParagraphStyle(
    "Disclaimer", parent=_styles["Normal"], fontSize=8, leading=11,
    textColor=colors.HexColor("#b71c1c"),
    borderColor=colors.HexColor("#b71c1c"),
    borderWidth=1,
    borderPadding=6,
    backColor=colors.HexColor("#fff3f3"),
)
_MONO = ParagraphStyle(
    "Mono", parent=_styles["Normal"], fontSize=8, fontName="Courier", leading=11
)

DISCLAIMER_TEXT = (
    "<b>⚠️ MEDICAL DISCLAIMER</b>: This report contains <b>suspected tumour regions "
    "predicted by the model</b> with <b>estimated volumes</b>. It is intended for "
    "research and educational purposes only. This is <b>NOT</b> a diagnostic tool, "
    "does <b>NOT</b> replace a radiologist, and must <b>NOT</b> be used for clinical "
    "decision-making. Always consult a qualified medical professional."
)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_report(
    case_id: str,
    result: Dict[str, Any],
    output_path: Path,
    mask_comparison: Optional[Dict] = None,
) -> Path:
    """
    Generate a PDF report for a completed segmentation.

    Parameters
    ----------
    case_id     : Unique case identifier
    result      : Result dict from run_pipeline()
    output_path : Where to save the PDF
    mask_comparison : Optional expert mask comparison metrics

    Returns
    -------
    Path to the generated PDF.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    story = []

    # ── Disclaimer banner (first, always visible) ──────────────────────────
    story.append(Paragraph(DISCLAIMER_TEXT, _DISCLAIMER_STYLE))
    story.append(Spacer(1, 0.4 * cm))

    # ── Title ──────────────────────────────────────────────────────────────
    story.append(Paragraph("NeuroScope-3D Segmentation Report", _TITLE))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a237e")))
    story.append(Spacer(1, 0.3 * cm))

    # ── Provenance ─────────────────────────────────────────────────────────
    story.append(Paragraph("Provenance & Modeling Pipeline", _H2))
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    prov_data = [
        ["Field", "Value"],
        ["Case ID",            case_id],
        ["Timestamp",          ts],
        ["Primary model",      "MONAI brats_mri_segmentation (SegResNet)"],
        ["Model licence",      "Apache-2.0"],
        ["Test-Time Aug (TTA)", "4 passes (spatial flips)" if result.get("tta_enabled") else "Standard single pass"],
        ["Ensemble mode",      "Active (multi-scale blend)" if result.get("ensemble_enabled") else "Disabled"],
        ["ET cleanup",         f"{result.get('et_voxels_cleaned', 0):,} voxels (< 200) relabelled as necrosis"],
        ["Missing modalities", ", ".join(result.get("missing_modalities", [])) or "None (all 4 provided)"],
        ["Uncertainty metric", f"Mean voxel variance = {result.get('uncertainty_stats', {}).get('mean_uncertainty_score', 0.0):.4f}" if result.get("uncertainty_stats") else "Evaluated"],
        ["Preprocessing",      "RAS reorientation, 1 mm resample, non-zero z-score per channel"],
        ["Channel order",      "T1Gd, T1, T2, FLAIR"],
        ["Input SHA-256",      result.get("sha256", "N/A")],
        ["Git commit",         result.get("commit", "N/A")],
        ["From cache",         str(result.get("from_cache", False))],
        ["Elapsed",            f"{result.get('elapsed_s', 0):.1f} s"],
    ]
    story.append(_make_table(prov_data))
    story.append(Spacer(1, 0.4 * cm))

    # ── Volumes ────────────────────────────────────────────────────────────
    story.append(Paragraph("Estimated Volumes", _H2))
    story.append(Paragraph(
        "Volume formula: <b>N_voxels × |det(affine[:3,:3])| / 1000</b> "
        "where spacing is read from the original NIfTI header.",
        _BODY,
    ))
    story.append(Spacer(1, 0.2 * cm))

    vol_data = [["Region", "Voxels", "Estimated Volume (mL)", "Formula"]]
    for region in ("WT", "TC", "ET"):
        info = result.get("volumes", {}).get(region, {})
        vol_data.append([
            _region_label(region),
            f"{info.get('voxels', 0):,}",
            f"{info.get('ml', 0):.2f} mL",
            info.get("formula", "N/A"),
        ])
    story.append(_make_table(vol_data, col_widths=[3 * cm, 2.5 * cm, 3.5 * cm, None]))
    story.append(Spacer(1, 0.4 * cm))

    # ── Expert mask comparison (if provided) ───────────────────────────────
    if mask_comparison:
        story.append(Paragraph("Expert Mask Comparison", _H2))
        story.append(Paragraph(
            "Comparison with the provided expert segmentation mask. "
            "Agreement overlay colours: TP=green, FP=red, FN=blue.",
            _BODY,
        ))
        m = mask_comparison.get("metrics")
        if m:
            comp_data = [
                ["Region", "Dice", "Sensitivity", "TP", "FP", "FN"],
                [
                    m.region, m.dice_display(), m.sensitivity_display(),
                    str(m.tp), str(m.fp), str(m.fn),
                ],
            ]
            story.append(_make_table(comp_data))
        story.append(Spacer(1, 0.4 * cm))

    # ── Limitations ────────────────────────────────────────────────────────
    story.append(Paragraph("Limitations & Disclosures", _H2))
    limitations = [
        "The MONAI bundle was trained on BraTS 2018. BraTS 2021 includes many "
        "earlier cases; evaluation Dice may be inflated due to training/evaluation overlap.",
        "Small Enhancing Tumour (ET) regions are particularly uncertain. "
        "ET volumes below 1 mL should be interpreted with caution.",
        "Performance may degrade on non-BraTS acquisition protocols, non-glioma "
        "pathologies, and non-skull-stripped inputs.",
        "This model has not been validated for clinical use.",
    ]
    for lim in limitations:
        story.append(Paragraph(f"• {lim}", _BODY))
    story.append(Spacer(1, 0.4 * cm))

    # ── Footer disclaimer (repeated) ───────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph(DISCLAIMER_TEXT, _DISCLAIMER_STYLE))

    doc.build(story)
    return output_path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_table(data, col_widths=None):
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#1a237e")),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("GRID",          (0, 0), (-1, -1), 0.25, colors.grey),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _region_label(region: str) -> str:
    return {
        "WT": "Whole Tumour (WT)",
        "TC": "Tumour Core (TC)",
        "ET": "Enhancing Tumour (ET)",
    }.get(region, region)
