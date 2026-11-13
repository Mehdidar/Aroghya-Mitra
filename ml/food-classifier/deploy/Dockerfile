# DishDetect food model as a Hugging Face Space (Docker SDK, free CPU).
# Built by `npm run deploy:food`, which copies api/, core/, checkpoints/ and
# requirements-serve.txt next to this file. Also runs locally:
#   docker build -t dishdetect-space . && docker run -p 7860:7860 -e DISHDETECT_API_KEYS=<key> dishdetect-space
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/.cache/huggingface \
    DISHDETECT_ENV=prod \
    DISHDETECT_LOG_DIR=/tmp/dishdetect/predictions

# libgl/glib for OpenCV's GrabCut (headless build still needs glib).
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# Spaces run the container as uid 1000.
RUN useradd -m -u 1000 app
WORKDIR /app

# CPU-only torch (the default wheels carry the CUDA runtime: gigabytes for nothing here).
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
COPY requirements-serve.txt .
RUN pip install -r requirements-serve.txt

# Bake the CLIP weights into the image so a waking Space does not download 600 MB first.
RUN python -c "import open_clip; open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k')" \
 && chown -R app:app /app

COPY --chown=app:app core ./core
COPY --chown=app:app api ./api
COPY --chown=app:app checkpoints ./checkpoints

USER app
EXPOSE 7860
# DISHDETECT_ENV=prod refuses to start without DISHDETECT_API_KEYS (set it as a Space secret).
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1", "--timeout-keep-alive", "65"]
