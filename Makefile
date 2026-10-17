.DEFAULT_GOAL := help

# ============================================================
# NeuroScope-3D Makefile
# ============================================================

.PHONY: help run dev test test-unit test-wording lint eval download-model clean

help:
	@echo ""
	@echo "NeuroScope-3D"
	@echo "============="
	@echo "  make run          Start everything (Docker Compose)"
	@echo "  make dev          Start backend dev server (no Docker)"
	@echo "  make test         Full test suite (pytest + wording linter)"
	@echo "  make test-unit    pytest only (no Playwright)"
	@echo "  make test-wording Banned-phrase linter only"
	@echo "  make lint         flake8 + wording linter"
	@echo "  make eval         Run evaluation on held-out cases"
	@echo "  make download-model Download MONAI bundle weights"
	@echo "  make clean        Remove uploads and cache"
	@echo ""

# ── Docker ──────────────────────────────────────────────────

run:
	docker compose up --build

# ── Local dev ───────────────────────────────────────────────

dev:
	uvicorn api.main:app --reload --port 8000 --log-level info

download-model:
	python scripts/download_bundle.py

# ── Tests ───────────────────────────────────────────────────

test: test-unit test-wording

test-unit:
	pytest tests/ -v --tb=short -x \
		--ignore=tests/test_e2e.py \
		--ignore=tests/test_timing.py

test-wording:
	pytest tests/test_wording.py -v --tb=short

test-e2e:
	playwright install chromium
	pytest tests/test_e2e.py -v --tb=short

lint:
	flake8 core/ api/ tests/ --max-line-length=100 --extend-ignore=E203,W503
	pytest tests/test_wording.py -v --tb=short -q

# ── Evaluation ──────────────────────────────────────────────

eval:
	python eval/run_eval.py

# ── Cleanup ─────────────────────────────────────────────────

clean:
	rm -rf uploads/ .cache/
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# ── CLI shortcut (for judges' scorer) ───────────────────────

predict:
	@echo "Usage: make predict T1=... T1CE=... T2=... FLAIR=... OUT=pred.nii.gz"
	python -m core.predict --t1 $(T1) --t1ce $(T1CE) --t2 $(T2) --flair $(FLAIR) --out $(OUT)
