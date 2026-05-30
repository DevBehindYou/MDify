from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import tempfile
import os
import gc
from pathlib import Path

app = FastAPI(title="MarkItDown API", version="1.0.0")

# ── Config ────────────────────────────────────────────────────────────────────
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB per file

# CORS
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

# ── Pillow (lightweight — for image metadata fallback) ───────────────────────
try:
    from PIL import Image as PILImage
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False

# Image extensions
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".tiff", ".tif", ".webp"}


def image_metadata(image_path: str) -> str:
    """
    Extract image metadata using Pillow and return it as Markdown.
    This is a lightweight fallback that works within the 512 MB free tier.
    """
    if not PILLOW_AVAILABLE:
        return ""

    try:
        with PILImage.open(image_path) as img:
            width, height = img.size
            mode = img.mode
            fmt = img.format or Path(image_path).suffix.lstrip(".").upper()
            img_name = Path(image_path).name

            info_lines = [
                f"# Image: {img_name}\n",
                f"| Property | Value |",
                f"|----------|-------|",
                f"| **Format** | {fmt} |",
                f"| **Dimensions** | {width} × {height} px |",
                f"| **Color mode** | {mode} |",
            ]

            # Extract EXIF / metadata if available
            exif = img.info
            if exif:
                for key, val in exif.items():
                    if isinstance(val, (str, int, float)) and key not in ("exif",):
                        info_lines.append(f"| **{key}** | {val} |")

            info_lines.append("")
            info_lines.append(
                "> **Note:** Image text extraction (OCR) is not available on the free tier. "
                "The image metadata above is all that can be extracted."
            )
            info_lines.append("")

            return "\n".join(info_lines)
    except Exception:
        return ""


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

        # Step 1: Try MarkItDown
        try:
            result = md_converter.convert(tmp_path)
            text = (result.text_content or "").strip()
        except Exception as e:
            if not is_image:
                raise HTTPException(
                    status_code=500,
                    detail=f"Conversion failed for '{original_name}': {str(e)}"
                )

        # Step 2: For images with no text, provide metadata
        if is_image and not text:
            text = image_metadata(tmp_path)

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
        gc.collect()
