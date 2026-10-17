"""
eval/run_eval.py
Evaluate the segmentation pipeline on held-out BraTS 2021 cases.

Usage:
    python eval/run_eval.py \
        --data-dir /path/to/brats2021 \
        --out eval/results.csv

Reads case IDs from eval/case_ids.txt.
Outputs per-case and aggregate metrics to results.csv.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("eval")

EVAL_DIR = Path(__file__).parent
CASE_IDS_FILE = EVAL_DIR / "case_ids.txt"

DISCLAIMER = (
    "EVALUATION DISCLOSURE: The MONAI bundle was trained on BraTS 2018. "
    "BraTS 2021 includes many earlier cases. Evaluation Dice may be inflated. "
    "See docs/LIMITATIONS.md for full disclosure."
)


def load_case_ids() -> list[str]:
    if not CASE_IDS_FILE.exists():
        logger.error("case_ids.txt not found at %s", CASE_IDS_FILE)
        sys.exit(1)
    return [line.strip() for line in CASE_IDS_FILE.read_text().splitlines() if line.strip()]


def find_case_files(data_dir: Path, case_id: str) -> dict[str, Path]:
    """Find T1/T1ce/T2/FLAIR and segmentation for a BraTS case."""
    case_dir = data_dir / case_id
    if not case_dir.exists():
        raise FileNotFoundError(f"Case directory not found: {case_dir}")

    seqs = {}
    for suffix, keys in [
        ("_t1ce.nii.gz", "t1ce"), ("_t1.nii.gz", "t1"),
        ("_t2.nii.gz", "t2"), ("_flair.nii.gz", "flair"),
        ("_seg.nii.gz", "gt"),
    ]:
        candidates = list(case_dir.glob(f"*{suffix}"))
        if not candidates:
            raise FileNotFoundError(f"Missing {suffix} in {case_dir}")
        seqs[keys] = candidates[0]

    return seqs


def run_evaluation(data_dir: Path, out_path: Path) -> None:
    from core.eval import evaluate_case
    from core.predict import run_pipeline

    logger.info(DISCLAIMER)
    case_ids = load_case_ids()
    logger.info("Evaluating %d cases from %s", len(case_ids), data_dir)

    rows = []
    agg = {region: {"dice": [], "sensitivity": []} for region in ("WT", "TC", "ET")}

    for case_id in case_ids:
        try:
            files = find_case_files(data_dir, case_id)
        except FileNotFoundError as e:
            logger.warning("Skipping %s: %s", case_id, e)
            continue

        pred_path = data_dir / case_id / "pred_neuroscope.nii.gz"

        try:
            run_pipeline(
                t1=files["t1"], t1ce=files["t1ce"],
                t2=files["t2"], flair=files["flair"],
                out=pred_path, use_cache=True,
            )
        except SystemExit as e:
            logger.error("Pipeline failed for %s (exit %s)", case_id, e.code)
            continue

        try:
            metrics = evaluate_case(pred_path, files["gt"])
        except Exception as e:
            logger.error("Metrics failed for %s: %s", case_id, e)
            continue

        row = {"case_id": case_id}
        for region, m in metrics.items():
            row[f"{region}_dice"] = m.dice_display()
            row[f"{region}_sensitivity"] = m.sensitivity_display()
            if m.dice is not None:
                agg[region]["dice"].append(m.dice)
            if m.sensitivity is not None:
                agg[region]["sensitivity"].append(m.sensitivity)

        rows.append(row)
        logger.info("  %s: WT=%.3f TC=%.3f ET=%.3f",
                    case_id,
                    metrics["WT"].dice or 0,
                    metrics["TC"].dice or 0,
                    metrics["ET"].dice or 0)

    # Write CSV
    if rows:
        fieldnames = ["case_id"] + [
            f"{r}_{m}" for r in ("WT", "TC", "ET") for m in ("dice", "sensitivity")
        ]
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

        # Append aggregate row
        agg_row = {"case_id": "MEAN"}
        for region in ("WT", "TC", "ET"):
            d = agg[region]["dice"]
            s = agg[region]["sensitivity"]
            agg_row[f"{region}_dice"] = f"{sum(d)/len(d):.4f}" if d else "N/A"
            agg_row[f"{region}_sensitivity"] = f"{sum(s)/len(s):.4f}" if s else "N/A"
        with open(out_path, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writerow(agg_row)

        logger.info("Results written to %s", out_path)
        logger.info("MEAN: WT_Dice=%.4f  TC_Dice=%.4f  ET_Dice=%.4f",
                    *[sum(agg[r]["dice"])/max(len(agg[r]["dice"]),1) for r in ("WT","TC","ET")])

    logger.info("\n%s", DISCLAIMER)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--out", default=EVAL_DIR / "results.csv", type=Path)
    args = parser.parse_args()
    run_evaluation(args.data_dir, args.out)
