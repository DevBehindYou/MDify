from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile
import os
from pathlib import Path

app = FastAPI(title="MarkItDown API", version="1.0.0")

# CORS: read allowed origins from env so the Render frontend URL is accepted in prod.
# FRONTEND_URL=https://markitdown-frontend.onrender.com  (set in Render dashboard)
_raw = os.getenv("FRONTEND_URL", "")
_extra = [u.strip() for u in _raw.split(",") if u.strip()]
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    *_extra,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    from markitdown import MarkItDown
    md_converter = MarkItDown()
    MARKITDOWN_AVAILABLE = True
except ImportError:
    md_converter = None
    MARKITDOWN_AVAILABLE = False


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "markitdown": MARKITDOWN_AVAILABLE,
    }


@app.post("/convert")
async def convert_file(file: UploadFile = File(...)):
    if not MARKITDOWN_AVAILABLE:
        raise HTTPException(
            status_code=500,
            detail="MarkItDown is not installed. Run: pip install 'markitdown[all]'"
        )

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    original_name = file.filename
    suffix = Path(original_name).suffix or ".tmp"
    stem = Path(original_name).stem

    # Write uploaded file to a temp location
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = md_converter.convert(tmp_path)
        text = result.text_content or ""

        return JSONResponse({
            "filename": stem + ".md",
            "content": text,
            "original_name": original_name,
            "char_count": len(text),
            "word_count": len(text.split()),
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Conversion failed for '{original_name}': {str(e)}"
        )
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
