"""backendO entrypoint — OCR pool (O1, O2) on Render (Docker).

Run with exactly one worker per container:
    uvicorn app.main:app --port 8002 --workers 1
"""

import logging
from pathlib import Path

from app.common.app_factory import create_app
from app.common.config import load_local_env, load_settings
from app.converter import OcrConverter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

# Local runs read <backend>/.env; deployments set real environment variables.
load_local_env(Path(__file__).resolve().parents[1] / ".env")
app = create_app(load_settings(role="ocr"), OcrConverter())
