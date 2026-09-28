"""Builds the reusable MDify test corpus under tests/load/.corpus/.

Every file is generated deterministically from code (no binary fixtures in
git). manifest.json records, per file: class, type, size, the pool it must
route to, the HTTP status we expect, and ground-truth text to check the
Markdown against.

Run with the backendN virtualenv (it has openpyxl, python-pptx, Pillow):
    backendN/.venv/Scripts/python tests/load/corpus.py
"""

from __future__ import annotations

import io
import json
import random
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / ".corpus"
sys.path.insert(0, str(HERE.parents[1] / "backendN" / "tests"))
from fixtures import make_docx, make_epub, make_pptx, make_xlsx  # noqa: E402

rng = random.Random(42)
WORDS = (
    "markdown conversion pipeline document retrieval vector embedding chunk heading table "
    "invoice quarterly revenue customer analysis summary report section paragraph latency "
    "throughput storage metadata backend frontend dispatcher failover instance capacity"
).split()


def sentence(n: int = 12) -> str:
    return " ".join(rng.choice(WORDS) for _ in range(n)).capitalize() + "."


def pdf_pages(pages: list[list[str]]) -> bytes:
    """Multi-page text PDF with a valid xref table."""
    objects: list[bytes] = []
    font_id = 3 + 2 * len(pages)
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(len(pages)))
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())
    for i, lines in enumerate(pages):
        ops = ["BT /F1 11 Tf 14 TL 50 760 Td"]
        for line in lines:
            safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            ops.append(f"({safe}) Tj T*")
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1", "replace")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {4 + 2 * i} 0 R "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> >>".encode()
        )
        objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")
    xref_at = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        out.write(f"{offset:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode())
    return out.getvalue()


def docx_paragraphs(title: str, paragraphs: list[str]) -> bytes:
    body = "</w:t></w:r></w:p><w:p><w:r><w:t>".join(paragraphs)
    return make_docx(title, body)


def pptx_slides(n: int) -> bytes:
    from pptx import Presentation

    prs = Presentation()
    for i in range(n):
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = f"Slide {i + 1} marker-slide-{i + 1}"
        slide.placeholders[1].text = sentence(20)
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def epub_chapters(n: int) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
            "</rootfiles></container>",
        )
        manifest = "".join(
            f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(n)
        )
        spine = "".join(f'<itemref idref="c{i}"/>' for i in range(n))
        archive.writestr(
            "OEBPS/content.opf",
            '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">'
            '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Load Book</dc:title>'
            '<dc:identifier id="id">load-book</dc:identifier><dc:language>en</dc:language></metadata>'
            f"<manifest>{manifest}</manifest><spine>{spine}</spine></package>",
        )
        for i in range(n):
            paras = "".join(f"<p>{sentence(25)}</p>" for _ in range(15))
            archive.writestr(
                f"OEBPS/c{i}.xhtml",
                f'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>C{i}</title></head>'
                f"<body><h1>Chapter marker-chapter-{i}</h1>{paras}</body></html>",
            )
    return buf.getvalue()


FONT_PATH = "C:/Windows/Fonts/arial.ttf"


def text_image(size, lines, font_px, fmt, *, rotate=0, noise=0.0, blur=0.0, **save) -> bytes:
    img = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_PATH, font_px)
    y = font_px
    for line in lines:
        draw.text((font_px, y), line, fill="black", font=font)
        y += int(font_px * 1.6)
        if y > size[1] - font_px:
            break
    if rotate:
        img = img.rotate(rotate, expand=True, fillcolor="white")
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    if noise:
        px = img.load()
        w, h = img.size
        for _ in range(int(w * h * noise)):
            x, yy = rng.randrange(w), rng.randrange(h)
            px[x, yy] = (0, 0, 0) if rng.random() < 0.5 else (255, 255, 255)
    buf = io.BytesIO()
    img.save(buf, format=fmt, **save)
    return buf.getvalue()


def zip_bomb_docx() -> bytes:
    """Valid-looking DOCX whose members expand past the 250 MB guard."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<w:document/>")
        chunk = b"\0" * (1024 * 1024)
        with archive.open("word/media/padding.bin", "w", force_zip64=True) as member:
            for _ in range(260):
                member.write(chunk)
    return buf.getvalue()


def build() -> list[dict]:
    OUT.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []

    def add(name, data, cls, pool, expect=200, markers=(), ground_truth=None, meta=None):
        (OUT / name).write_bytes(data)
        entries.append(
            {
                "name": name,
                "class": cls,
                "type": name.rsplit(".", 1)[-1].lower() if "." in name else "",
                "size": len(data),
                "pool": pool,
                "expect_status": expect,
                "markers": list(markers),
                "ground_truth": ground_truth,
                **(meta or {}),
            }
        )

    # ── normal-small
    add("small.txt", b"Plain marker-txt text file.\n" + sentence().encode(), "normal-small", "normal", markers=["marker-txt"])
    add("small.csv", b"name,marker\nAda,marker-csv\nLinus,x\n", "normal-small", "normal", markers=["marker-csv"])
    add("small.json", json.dumps({"key": "marker-json", "n": [1, 2, 3]}).encode(), "normal-small", "normal", markers=["marker-json"])
    add("small.xml", b"<root><item>marker-xml</item></root>", "normal-small", "normal", markers=["marker-xml"])
    add("small.html", b"<html><body><h2>marker-html</h2><p>" + sentence().encode() + b"</p></body></html>", "normal-small", "normal", markers=["marker-html"])
    add("small.pdf", pdf_pages([["marker-pdf-small", sentence()]]), "normal-small", "normal", markers=["marker-pdf-small"])
    add("small.docx", docx_paragraphs("Memo marker-docx", [sentence() for _ in range(5)]), "normal-small", "normal", markers=["marker-docx"])
    add("small.pptx", make_pptx("Deck marker-pptx", sentence()), "normal-small", "normal", markers=["marker-pptx"])
    add("small.xlsx", make_xlsx([["Name", "Marker"], ["Ada", "marker-xlsx"]]), "normal-small", "normal", markers=["marker-xlsx"])
    add("small.epub", make_epub("marker-epub " + sentence()), "normal-small", "normal", markers=["marker-epub"])

    # ── normal-medium
    add("medium.pdf", pdf_pages([[f"marker-page-{p}"] + [sentence(10) for _ in range(45)] for p in range(20)]), "normal-medium", "normal", markers=["marker-page-0", "marker-page-19"])
    add("medium.docx", docx_paragraphs("Report marker-docx-medium", [sentence(30) for _ in range(300)]), "normal-medium", "normal", markers=["marker-docx-medium"])
    add("medium.pptx", pptx_slides(25), "normal-medium", "normal", markers=["marker-slide-1", "marker-slide-25"])
    add("medium.xlsx", make_xlsx([["id", "name", "value", "note"]] + [[i, f"row-{i}", i * 3.5, sentence(6)] for i in range(3000)]), "normal-medium", "normal", markers=["row-2999"])
    add("medium.epub", epub_chapters(12), "normal-medium", "normal", markers=["marker-chapter-0", "marker-chapter-11"])
    add("medium.html", ("<html><body>" + "".join(f"<h2>Section marker-sec-{i}</h2><p>{sentence(40)}</p><table><tr><td>a</td><td>{i}</td></tr></table>" for i in range(400)) + "</body></html>").encode(), "normal-medium", "normal", markers=["marker-sec-399"])
    add("medium.csv", ("id,name,value\n" + "".join(f"{i},name-{i},{i * 2}\n" for i in range(20000))).encode(), "normal-medium", "normal", markers=["name-19999"])

    # ── normal-large
    add("large.pdf", pdf_pages([[f"marker-page-{p}"] + [sentence(10) for _ in range(48)] for p in range(150)]), "normal-large", "normal", markers=["marker-page-149"])
    add("large.xlsx", make_xlsx([["id", "name", "value", "note"]] + [[i, f"row-{i}", i * 3.5, sentence(6)] for i in range(20000)]), "normal-large", "normal", markers=["row-19999"])
    add("large.txt", ("marker-large-txt\n" + "\n".join(sentence(20) for _ in range(80000))).encode(), "normal-large", "normal", markers=["marker-large-txt"])

    # ── OCR (ground truth = the rendered lines)
    small_lines = ["Invoice 4821 total due 1250 USD", "Customer Ada Lovelace London"]
    page_lines = [sentence(9) for _ in range(40)]
    add("ocr-small.png", text_image((900, 260), small_lines, 34, "PNG"), "ocr-small", "ocr", ground_truth=" ".join(small_lines), meta={"dims": [900, 260]})
    add("ocr-small.jpg", text_image((900, 260), small_lines, 34, "JPEG", quality=90), "ocr-small", "ocr", ground_truth=" ".join(small_lines), meta={"dims": [900, 260]})
    add("ocr-small.webp", text_image((900, 260), small_lines, 34, "WEBP", quality=90), "ocr-small", "ocr", ground_truth=" ".join(small_lines), meta={"dims": [900, 260]})
    add("ocr-small.bmp", text_image((900, 260), small_lines, 34, "BMP"), "ocr-small", "ocr", ground_truth=" ".join(small_lines), meta={"dims": [900, 260]})
    add("ocr-small.tiff", text_image((900, 260), small_lines, 34, "TIFF"), "ocr-small", "ocr", ground_truth=" ".join(small_lines), meta={"dims": [900, 260]})
    add("ocr-medium.png", text_image((1700, 2200), page_lines, 30, "PNG"), "ocr-medium", "ocr", ground_truth=" ".join(page_lines), meta={"dims": [1700, 2200]})
    add("ocr-large.png", text_image((3400, 4400), page_lines * 2, 56, "PNG"), "ocr-large", "ocr", ground_truth=" ".join(page_lines * 2), meta={"dims": [3400, 4400]})
    add("ocr-near-limit.png", text_image((5000, 4990), page_lines, 80, "PNG"), "ocr-large", "ocr", ground_truth=" ".join(page_lines), meta={"dims": [5000, 4990]})
    # Same page as JPEG: measures the grayscale JPEG decode path (ocrmem).
    add("ocr-near-limit.jpg", text_image((5000, 4990), page_lines, 80, "JPEG", quality=90), "ocr-memory", "ocr", ground_truth=" ".join(page_lines), meta={"dims": [5000, 4990]})
    add("ocr-over-limit.png", text_image((5100, 5000), ["over limit"], 80, "PNG"), "ocr-edge", "ocr", expect=413, meta={"dims": [5100, 5000]})
    add("ocr-lowres.png", text_image((300, 90), ["Low res 42 test"], 12, "PNG"), "ocr-edge", "ocr", ground_truth="Low res 42 test", meta={"dims": [300, 90]})
    add("ocr-rotated.png", text_image((1200, 400), small_lines, 40, "PNG", rotate=90), "ocr-edge", "ocr", ground_truth=" ".join(small_lines), meta={"dims": [400, 1200]})
    add("ocr-noisy.png", text_image((1200, 400), small_lines, 40, "PNG", noise=0.04, blur=0.6), "ocr-edge", "ocr", ground_truth=" ".join(small_lines), meta={"dims": [1200, 400]})
    multi = ["Café crème à Paris – naïve façade", "Straße über Größe – Müller"]
    add("ocr-multilingual.png", text_image((1200, 300), multi, 40, "PNG"), "multilingual", "ocr", ground_truth=" ".join(multi), meta={"dims": [1200, 300], "note": "eng model only"})

    # ── corrupt / unsupported / edge
    add("corrupt.pdf", b"%PDF-1.4\n" + bytes(rng.randrange(256) for _ in range(4000)), "corrupt", "normal", expect=(200, 422))
    add("corrupt.docx", b"PK\x03\x04" + bytes(rng.randrange(256) for _ in range(2000)), "corrupt", "normal", expect=400)
    add("corrupt.png", b"\x89PNG\r\n\x1a\n" + bytes(rng.randrange(256) for _ in range(2000)), "corrupt", "ocr", expect=400)
    add("magic-mismatch.pdf", b"This is plain text pretending to be a PDF", "corrupt", "normal", expect=400)
    add("bomb.docx", zip_bomb_docx(), "corrupt", "normal", expect=413)
    add("unsupported.exe", b"MZ\x90\x00" + b"\x00" * 100, "unsupported", None, expect=400)
    add("zero.txt", b"", "edge-case", "normal", expect=400)
    long_name = "VeryLongFilenameWithoutAnySpacesOrBreakCharactersThatCouldOverflowTheContainer" * 2 + ".txt"
    add(long_name, b"marker-long-name", "long-filename", "normal", markers=["marker-long-name"])
    add("ファイル名_文書_日本語.txt", "marker-unicode 日本語テキスト".encode(), "edge-case", "normal", markers=["marker-unicode"])

    (OUT / "manifest.json").write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")
    return entries


if __name__ == "__main__":
    items = build()
    total = sum(e["size"] for e in items)
    print(f"{len(items)} files, {total / 1024 / 1024:.1f} MB -> {OUT}")
    for e in items:
        print(f"  {e['class']:<14} {e['size']:>10,}  {e['name'][:60]}".encode('ascii', 'replace').decode())
