"""
tests/test_wording.py
Banned-phrase linter — scans the entire codebase for forbidden wording.

FAIL the test if any source file or template contains:
  - "tumour detected" (or "tumor detected")
  - "diagnostic system"
  - "replaces the radiologist"
  - "clinical diagnosis"
  - "diagnostic tool"  (when NOT in a negated context)

This test acts as a CI gate.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import List, Tuple

import pytest

# ---------------------------------------------------------------------------
# Project root
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).parent.parent

# ---------------------------------------------------------------------------
# Paths to scan (exclude .git, node_modules, __pycache__, .cache, .venv)
# ---------------------------------------------------------------------------
SCAN_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx",
    ".html", ".md", ".txt", ".json", ".pdf.py",
}
EXCLUDE_DIRS = {".git", "node_modules", "__pycache__", ".cache", ".venv", "dist", "build"}

# ---------------------------------------------------------------------------
# Patterns to DETECT (these should NEVER appear literally in the output/UI)
# ---------------------------------------------------------------------------
BANNED_PATTERNS: List[re.Pattern] = [
    re.compile(r"tumou?r\s+detected",        re.IGNORECASE),
    re.compile(r"diagnostic\s+system",       re.IGNORECASE),
    re.compile(r"replaces?\s+the\s+radiologist", re.IGNORECASE),
    re.compile(r"clinical\s+diagnosis",      re.IGNORECASE),
    # "is a diagnostic tool" — but allow "is NOT a diagnostic tool"
    re.compile(r"(?<!not\s)(?<!NOT\s)(?<!n't\s)is\s+a\s+diagnostic\s+tool", re.IGNORECASE),
]

# ---------------------------------------------------------------------------
# Allowlist — test/comment strings that are OK to reference
# ---------------------------------------------------------------------------
ALLOWLIST_PATTERNS: List[re.Pattern] = [
    re.compile(r"#.*banned", re.IGNORECASE),   # comment explaining the ban
    re.compile(r"BANNED_PATTERNS"),             # this file itself
    re.compile(r"match.*tumou?r",              re.IGNORECASE),  # pytest match strings
    re.compile(r"\".*tumou?r detected.*\"",    re.IGNORECASE),  # test string literals
]


def _iter_files() -> List[Path]:
    files = []
    for path in REPO_ROOT.rglob("*"):
        if path.is_file() and path.suffix in SCAN_EXTENSIONS:
            if not any(excl in path.parts for excl in EXCLUDE_DIRS):
                files.append(path)
    return files


def _is_allowlisted(line: str) -> bool:
    return any(p.search(line) for p in ALLOWLIST_PATTERNS)


def test_no_banned_phrases():
    """Fail if any banned wording is found in scanned files."""
    violations: List[Tuple[Path, int, str, str]] = []

    for filepath in _iter_files():
        try:
            text = filepath.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        for lineno, line in enumerate(text.splitlines(), start=1):
            if _is_allowlisted(line):
                continue
            for pattern in BANNED_PATTERNS:
                if pattern.search(line):
                    violations.append((filepath, lineno, pattern.pattern, line.strip()))

    if violations:
        msg = "BANNED WORDING FOUND:\n"
        for filepath, lineno, pattern, line in violations:
            rel = filepath.relative_to(REPO_ROOT)
            msg += f"  {rel}:{lineno} [{pattern}]\n    → {line}\n"
        pytest.fail(msg)


def test_disclaimer_present_in_predict_output():
    """
    The CLI output and API response must include required disclaimer language.
    """
    import subprocess, sys
    # Check that the predict module source contains the required disclaimer phrases
    predict_src = (REPO_ROOT / "core" / "predict.py").read_text(encoding="utf-8")

    required_phrases = [
        "suspected tumour region",
        "estimated volume",
        "Not a diagnostic tool",
    ]
    for phrase in required_phrases:
        assert phrase.lower() in predict_src.lower(), (
            f"Required disclaimer phrase missing from core/predict.py: '{phrase}'"
        )
