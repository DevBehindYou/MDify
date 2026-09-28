# backendO — OCR pool image (O1, O2 on Render).
FROM python:3.12-slim

# OMP_THREAD_LIMIT=1: one OCR thread per process, for predictable memory and
# CPU on small instances. TESSDATA_PREFIX points Tesseract at the
# tessdata_fast English model instead of the distro default.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMP_THREAD_LIMIT=1 \
    TESSDATA_PREFIX=/usr/share/tessdata_fast

RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr curl ca-certificates \
 && mkdir -p "$TESSDATA_PREFIX" \
 && curl -fsSL -o "$TESSDATA_PREFIX/eng.traineddata" \
      https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/eng.traineddata \
 && curl -fsSL -o "$TESSDATA_PREFIX/osd.traineddata" \
      https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/osd.traineddata \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 mdify
USER mdify

EXPOSE 8000
# Exactly one worker: OCR concurrency is 1 per container by design.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers"]
