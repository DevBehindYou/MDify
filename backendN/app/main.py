"""backendN entrypoint — normal pool (N1, N2) on Vercel.

Vercel's Python runtime serves the ASGI `app` exported here. Locally:
    uvicorn app.main:app --port 8001
"""

import logging
from pathlib import Path

from app.common.app_factory import create_app
from app.common.config import load_local_env, load_settings
from app import pdf_tasks
from app.converter import NormalConverter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

# Local runs read <backend>/.env; deployments set real environment variables.
load_local_env(Path(__file__).resolve().parents[1] / ".env")
app = create_app(load_settings(role="normal"), NormalConverter())
pdf_tasks.register(app)
