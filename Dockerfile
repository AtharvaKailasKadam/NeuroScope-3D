# NeuroScope-3D Dockerfile
# One-command start: docker compose up --build

FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# ---------- System deps ----------
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3-pip python3.10-dev \
    git curl build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf python3.10 /usr/bin/python && ln -sf pip3 /usr/bin/pip

WORKDIR /app

# ---------- Python deps ----------
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---------- Download model bundle (baked into image) ----------
COPY scripts/download_bundle.py scripts/
RUN python scripts/download_bundle.py

# ---------- Copy source ----------
COPY . .

# ---------- Non-root user for security ----------
RUN useradd -m -u 1000 neuroscope && \
    chown -R neuroscope:neuroscope /app
USER neuroscope

# ---------- Healthcheck ----------
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
