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

# ── MarkItDown ────────────────────────────────────────────────────────────────
try:
    from markitdown import MarkItDown
    md_converter = MarkItDown()
    MARKITDOWN_AVAILABLE = True
except ImportError:
    md_converter = None
    MARKITDOWN_AVAILABLE = False

# ── RapidOCR (lightweight pure-Python OCR, no system binaries required) ──────
try:
    from rapidocr_onnxruntime import RapidOCR
    _ocr_engine = RapidOCR()
    RAPIDOCR_AVAILABLE = True
except Exception:
    _ocr_engine = None
    RAPIDOCR_AVAILABLE = False

# ── Pillow (for image pre-processing / metadata) ─────────────────────────────
try:
    from PIL import Image as PILImage
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False

# Image extensions that should go through the OCR pipeline
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tiff", ".tif", ".webp"}


def ocr_image(image_path: str) -> str:
    """
    Run RapidOCR on an image file and return the extracted text as Markdown.
    Falls back to a Pillow-based metadata block if OCR is unavailable.
    """
    if RAPIDOCR_AVAILABLE and _ocr_engine is not None:
        try:
            result, _ = _ocr_engine(image_path)
            if result:
                # result is a list of [bounding_box, text, confidence] tuples
                lines = [item[1] for item in result if item and len(item) >= 2]
                extracted = "\n".join(lines).strip()
                if extracted:
                    img_name = Path(image_path).name
                    md_blocks = [f"# Image: {img_name}\n"]
                    md_blocks.append("## Extracted Text\n")
                    md_blocks.append(extracted)
                    return "\n".join(md_blocks)
        except Exception:
            pass  # fall through to Pillow metadata fallback

    # Pillow fallback: at least report image dimensions / mode
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
                    f"> No text could be extracted from this image. "
                    f"Install `rapidocr-onnxruntime` on the backend for OCR support.\n"
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

    # Write uploaded file to a temp location
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        tmp.write(content)
        tmp_path = tmp.name

    try:
        is_image = suffix in IMAGE_EXTENSIONS
        text = ""

        # ── Step 1: Try MarkItDown first (works for all non-image types) ──────
        try:
            result = md_converter.convert(tmp_path)
            text = (result.text_content or "").strip()
        except Exception as e:
            if not is_image:
                # For non-images, a MarkItDown failure is a real error
                raise HTTPException(
                    status_code=500,
                    detail=f"Conversion failed for '{original_name}': {str(e)}"
                )
            # For images, MarkItDown often returns empty — we'll fall through to OCR

        # ── Step 2: For images, if MarkItDown returned nothing, run OCR ───────
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
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
