# MDify Pro backend — optional container image.
# Render can also build natively (see render.yaml); this Dockerfile gives an
# identical, reproducible build for local Docker or other hosts.
FROM python:3.11-slim

# System libs some converters benefit from (kept minimal for image size).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libmagic1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000
# $PORT is provided by the host (Render); default to 8000 locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
