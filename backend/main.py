from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile
import os
import gc
from pathlib import Path

app = FastAPI(title="MarkItDown API", version="1.0.0")

# ── Config ────────────────────────────────────────────────────────────────────
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB per file — keeps RAM usage safe on free tier

# CORS: read allowed origins from env so the Render frontend URL is accepted in prod.
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

# ── MarkItDown ────────────────────────────────────────────────────────────────
try:
    from markitdown import MarkItDown
    md_converter = MarkItDown()
    MARKITDOWN_AVAILABLE = True
except ImportError:
    md_converter = None
    MARKITDOWN_AVAILABLE = False

# ── Lazy OCR globals (initialised on first image request, not at startup) ─────
_ocr_engine = None
_ocr_checked = False
RAPIDOCR_AVAILABLE = False

# ── Pillow (lightweight — safe to import at startup) ─────────────────────────
try:
    from PIL import Image as PILImage
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False

# Image extensions that should go through the OCR pipeline
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tiff", ".tif", ".webp"}


def _get_ocr_engine():
    """
    Lazily import and initialise RapidOCR on the first image request.
    This avoids loading ONNX models at startup, preventing OOM on 512 MB.
    """
    global _ocr_engine, _ocr_checked, RAPIDOCR_AVAILABLE
    if _ocr_checked:
        return _ocr_engine

    _ocr_checked = True
    try:
        from rapidocr_onnxruntime import RapidOCR
        _ocr_engine = RapidOCR()
        RAPIDOCR_AVAILABLE = True
    except Exception:
        _ocr_engine = None
        RAPIDOCR_AVAILABLE = False

    return _ocr_engine


def _resize_for_ocr(image_path: str, max_dim: int = 2000) -> str:
    """
    If an image exceeds max_dim in any dimension, resize it to keep memory
    usage low during OCR. Returns the (possibly new) path.
    """
    if not PILLOW_AVAILABLE:
        return image_path
    try:
        with PILImage.open(image_path) as img:
            w, h = img.size
            if w <= max_dim and h <= max_dim:
                return image_path  # small enough already
            # Scale down proportionally
            ratio = min(max_dim / w, max_dim / h)
            new_size = (int(w * ratio), int(h * ratio))
            resized = img.resize(new_size, PILImage.LANCZOS)
            resized_path = image_path + ".resized.png"
            resized.save(resized_path, format="PNG")
            return resized_path
    except Exception:
        return image_path


def ocr_image(image_path: str) -> str:
    """
    Run RapidOCR on an image and return extracted text as Markdown.
    Falls back to Pillow metadata if OCR is unavailable.
    """
    engine = _get_ocr_engine()

    if engine is not None:
        resized_path = _resize_for_ocr(image_path)
        try:
            result, _ = engine(resized_path)
            if result:
                lines = [item[1] for item in result if item and len(item) >= 2]
                extracted = "\n".join(lines).strip()
                if extracted:
                    img_name = Path(image_path).name
                    return (
                        f"# Image: {img_name}\n\n"
                        f"## Extracted Text\n\n"
                        f"{extracted}\n"
                    )
        except Exception:
            pass  # fall through to Pillow metadata
        finally:
            # Clean up resized temp file
            if resized_path != image_path:
                try:
                    os.unlink(resized_path)
                except Exception:
                    pass

    # Pillow fallback: report dimensions / format at minimum
    if PILLOW_AVAILABLE:
        try:
            with PILImage.open(image_path) as img:
                width, height = img.size
                mode = img.mode
                fmt = img.format or Path(image_path).suffix.lstrip(".").upper()
                img_name = Path(image_path).name
                return (
                    f"# Image: {img_name}\n\n"
                    f"**Format:** {fmt}  \n"
                    f"**Dimensions:** {width} × {height} px  \n"
                    f"**Color mode:** {mode}  \n\n"
                    f"> No text was extracted from this image.\n"
                )
        except Exception:
            pass

    return ""


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "markitdown": MARKITDOWN_AVAILABLE,
        "ocr": RAPIDOCR_AVAILABLE,
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
    suffix = Path(original_name).suffix.lower() or ".tmp"
    stem = Path(original_name).stem

    # Read uploaded bytes and enforce size limit
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) // (1024*1024)} MB). Maximum is {MAX_FILE_SIZE // (1024*1024)} MB."
        )

    # Write to a temp file preserving the extension
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    # Release the upload buffer immediately
    del content
    gc.collect()

    try:
        is_image = suffix in IMAGE_EXTENSIONS
        text = ""

        # Step 1: Try MarkItDown (handles all non-image types well)
        try:
            result = md_converter.convert(tmp_path)
            text = (result.text_content or "").strip()
        except Exception as e:
            if not is_image:
                raise HTTPException(
                    status_code=500,
                    detail=f"Conversion failed for '{original_name}': {str(e)}"
                )
            # For images, MarkItDown often returns empty without an LLM client — fall through

        # Step 2: For images with no text, run OCR
        if is_image and not text:
            text = ocr_image(tmp_path)

        return JSONResponse({
            "filename": stem + ".md",
            "content": text,
            "original_name": original_name,
            "char_count": len(text),
            "word_count": len(text.split()) if text.strip() else 0,
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Conversion failed for '{original_name}': {str(e)}"
        )
    finally:
        # Clean up temp file and free memory
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        gc.collect()
