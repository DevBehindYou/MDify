"""Permanent PDF / XLSX conversion benchmark (offline, no servers).

    backendN/.venv/Scripts/python tests/load/pdf_xlsx_bench.py [--out results/<run>/pdf_xlsx.json]

PDF: compares MarkItDown 0.1.8 upstream (A) with two candidate fast paths:
  B  sample the first SAMPLE_PAGES pages with MarkItDown's own form detector;
     if none is form-like, parse the whole file once with pdfminer (what
     upstream does anyway after its extra pdfplumber pass); else run upstream.
  C  pdfminer only, always.
For each file it records total time, the form-detection pass time, the main
parse time, peak Python heap (tracemalloc, separate run) and whether the
output is identical to upstream after MarkItDown's whitespace normalization.

XLSX: 1k / 10k / 20k rows through upstream MarkItDown: time, output size,
peak heap, first/last row present in the output.
"""

from __future__ import annotations

import argparse
import io
import json
import random
import re
import sys
import time
import tracemalloc
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pdfminer.high_level  # noqa: E402
import pdfplumber  # noqa: E402
from markitdown import MarkItDown, StreamInfo  # noqa: E402
from markitdown.converters._pdf_converter import (  # noqa: E402
    _extract_form_content_from_words,
    _merge_partial_numbering_lines,
)

from corpus import make_xlsx, pdf_pages, sentence  # noqa: E402

SAMPLE_PAGES = 3
MD = MarkItDown(enable_plugins=False)


def text_pdf(pages: int) -> bytes:
    return pdf_pages([[f"marker-page-{p}"] + [sentence(10) for _ in range(45)] for p in range(pages)])


def pdf_with_tables(pages: int, table_pages: set[int]) -> bytes:
    """PDF where the given pages hold a 3-column borderless table."""
    objects: list[bytes] = [b"<< /Type /Catalog /Pages 2 0 R >>"]
    font_id = 3 + 2 * pages
    kids = " ".join(f"{3 + 2 * i} 0 R" for i in range(pages))
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {pages} >>".encode())
    rnd = random.Random(pages)
    for i in range(pages):
        ops = ["BT /F1 11 Tf"]
        if i in table_pages:
            ops.append(f"1 0 0 1 50 760 Tm (marker-table-{i}) Tj")
            for r in range(30):
                y = 730 - r * 20
                for x, cell in ((50, f"Item-{r}"), (260, f"{rnd.randint(1, 999)} units"), (460, f"USD {rnd.randint(10, 9999)}")):
                    ops.append(f"1 0 0 1 {x} {y} Tm ({cell}) Tj")
        else:
            ops.append("14 TL 50 760 Td")
            ops.append(f"(marker-page-{i}) Tj T*")
            ops += [f"({sentence(10)}) Tj T*" for _ in range(45)]
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {4 + 2 * i} 0 R "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> >>".encode()
        )
        objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for n, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{n} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return out.getvalue()


# ── conversion paths ────────────────────────────────────────────────────────


def upstream(data: bytes) -> str:
    return MD.convert_stream(io.BytesIO(data), stream_info=StreamInfo(extension=".pdf")).markdown


def form_detection_pass(data: bytes, max_pages: int | None = None) -> bool:
    """True if any examined page is form-like (MarkItDown's own heuristic)."""
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for idx, page in enumerate(pdf.pages):
            if max_pages is not None and idx >= max_pages:
                break
            found = _extract_form_content_from_words(page) is not None
            page.close()
            if found:
                return True
    return False


def normalize(text: str) -> str:
    """The whitespace normalization MarkItDown applies to every converter's output."""
    text = "\n".join(line.rstrip() for line in re.split(r"\r?\n", text))
    return re.sub(r"\n{3,}", "\n\n", text)


def pdfminer_only(data: bytes) -> str:
    return normalize(_merge_partial_numbering_lines(pdfminer.high_level.extract_text(io.BytesIO(data))))


def sampled(data: bytes) -> str:
    return upstream(data) if form_detection_pass(data, SAMPLE_PAGES) else pdfminer_only(data)


def timed(fn, *args, repeat: int = 2):
    best, result = None, None
    for _ in range(repeat):
        start = time.perf_counter()
        result = fn(*args)
        elapsed = (time.perf_counter() - start) * 1000
        best = elapsed if best is None else min(best, elapsed)
    return round(best), result


def peak_heap_mb(fn, *args) -> float:
    tracemalloc.start()
    tracemalloc.reset_peak()
    fn(*args)
    peak = tracemalloc.get_traced_memory()[1]
    tracemalloc.stop()
    return round(peak / 1048576, 1)


def bench_pdf(name: str, data: bytes, markers: list[str]) -> dict:
    a_ms, a_out = timed(upstream, data)
    detect_ms, _ = timed(form_detection_pass, data)
    parse_ms, _ = timed(lambda d: pdfminer.high_level.extract_text(io.BytesIO(d)), data)
    b_ms, b_out = timed(sampled, data)
    c_ms, c_out = timed(pdfminer_only, data)
    row = {
        "file": name,
        "bytes": len(data),
        "A_upstream_ms": a_ms,
        "form_detection_pass_ms": detect_ms,
        "pdfminer_parse_ms": parse_ms,
        "B_sampled_ms": b_ms,
        "C_pdfminer_only_ms": c_ms,
        "B_identical_to_A": b_out.strip() == a_out.strip(),
        "C_identical_to_A": c_out.strip() == a_out.strip(),
        "A_has_table": "|" in a_out,
        "B_has_table": "|" in b_out,
        "markers_ok": all(m in a_out for m in markers),
        "A_peak_heap_mb": peak_heap_mb(upstream, data),
        "B_peak_heap_mb": peak_heap_mb(sampled, data),
    }
    print(json.dumps(row), flush=True)
    return row


def bench_xlsx(rows: int) -> dict:
    data = make_xlsx([["id", "name", "value", "note"]] + [[i, f"row-{i}", i * 3.5, sentence(6)] for i in range(rows)])
    ms, out = timed(lambda d: MD.convert_stream(io.BytesIO(d), stream_info=StreamInfo(extension=".xlsx")).markdown, data)
    row = {
        "rows": rows,
        "bytes": len(data),
        "ms": ms,
        "output_bytes": len(out.encode()),
        "peak_heap_mb": peak_heap_mb(lambda d: MD.convert_stream(io.BytesIO(d), stream_info=StreamInfo(extension=".xlsx")), data),
        "first_and_last_row_present": "row-0" in out and f"row-{rows - 1}" in out,
        "table_rows_in_output": sum(1 for line in out.splitlines() if line.startswith("| ")),
    }
    print(json.dumps(row), flush=True)
    return row


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=None)
    args = parser.parse_args()
    pdfs = {
        "text-10p.pdf": (text_pdf(10), ["marker-page-9"]),
        "text-50p.pdf": (text_pdf(50), ["marker-page-49"]),
        "text-150p.pdf": (text_pdf(150), ["marker-page-149"]),
        "table-5p.pdf": (pdf_with_tables(5, {0, 1, 2, 3, 4}), ["marker-table-4"]),
        "mixed-table-p2-10p.pdf": (pdf_with_tables(10, {1}), ["marker-table-1", "marker-page-9"]),
        "mixed-table-p8-10p.pdf": (pdf_with_tables(10, {7}), ["marker-table-7", "marker-page-9"]),
    }
    result = {"sample_pages": SAMPLE_PAGES, "pdf": [bench_pdf(n, d, m) for n, (d, m) in pdfs.items()], "xlsx": [bench_xlsx(r) for r in (1000, 10000, 20000)]}
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"saved {args.out}")


if __name__ == "__main__":
    main()
