"""Peak memory of one OCR instance for the largest image of each format that
fits the upload cap. One job at a time. Memory is the uvicorn process plus its
tesseract child processes, sampled every 20 ms (Windows: working set).

    python tests/load/ocr_cap_bench.py --run-id run-20260927 --new O1 --old O2

--new  instance running the current caps (10 MB images, 25 MP).
--old  optional instance started with MAX_UPLOAD_BYTES=15728640, the previous
       image cap, to measure what the 15 MB cap allowed.
"""

from __future__ import annotations

import argparse
import asyncio
import io
import threading
import time
from pathlib import Path

import psutil
from PIL import Image

from corpus import text_image
from harness import PORTS, RESULTS, direct, new_client, pid_for_port, save

MB = 1024 * 1024
NEW_CAP = 10 * MB
OLD_CAP = 15 * MB
MAX_PIXELS = 25_000_000

WORDS = ("invoice total amount due payment account number reference customer "
         "address delivery order quantity price balance").split()
LINES = [" ".join(WORDS[(i * 4 + j) % len(WORDS)] for j in range(8)) for i in range(80)]


def page(size: tuple[int, int], fmt: str, mode: str = "RGB", **save_kwargs) -> tuple[bytes, str]:
    """A readable text page; returns (file bytes, ground truth of drawn lines)."""
    font_px = max(24, min(80, size[0] // 30))
    drawn, y = [], font_px
    for line in LINES:
        drawn.append(line)
        y += int(font_px * 1.6)
        if y > size[1] - font_px:
            break
    png = text_image(size, LINES, font_px, "PNG")
    if fmt == "PNG" and mode == "RGB":
        return png, " ".join(drawn)
    img = Image.open(io.BytesIO(png)).convert(mode)
    buf = io.BytesIO()
    img.save(buf, fmt, **save_kwargs)
    return buf.getvalue(), " ".join(drawn)


# (name, format, size, mode, save kwargs, cap it must fit)
CASES = [
    ("png-25mp.png", "PNG", (5000, 4990), "RGB", {}, NEW_CAP),
    ("jpeg-25mp.jpg", "JPEG", (5000, 4990), "RGB", {"quality": 90}, NEW_CAP),
    ("webp-25mp.webp", "WEBP", (5000, 4990), "RGB", {"quality": 90}, NEW_CAP),
    ("tiff-lzw-25mp.tiff", "TIFF", (5000, 4990), "RGB", {"compression": "tiff_lzw"}, NEW_CAP),
    ("gif-25mp.gif", "GIF", (5000, 4990), "P", {}, NEW_CAP),
    ("bmp24-10mb.bmp", "BMP", (2000, 1747), "RGB", {}, NEW_CAP),
    ("bmp8-10mb.bmp", "BMP", (3200, 3276), "L", {}, NEW_CAP),
    ("tiff-raw-10mb.tiff", "TIFF", (2000, 1747), "RGB", {}, NEW_CAP),
    # Only the previous 15 MB cap let these in.
    ("bmp24-15mb.bmp", "BMP", (2500, 2096), "RGB", {}, OLD_CAP),
    ("bmp8-15mb.bmp", "BMP", (3968, 3963), "L", {}, OLD_CAP),
    # WebP decodes through three full-size buffers; smaller pages size a WebP pixel cap.
    ("webp-16mp.webp", "WEBP", (4000, 4000), "RGB", {"quality": 90}, NEW_CAP),
    ("webp-12mp.webp", "WEBP", (3464, 3464), "RGB", {"quality": 90}, NEW_CAP),
]


class TreeSampler:
    """Samples RSS of a process and all its children in a background thread."""

    def __init__(self, pid: int, interval: float = 0.02):
        self.proc = psutil.Process(pid)
        self.interval = interval
        self.peak_total = self.peak_parent = self.peak_children = 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _sample(self) -> None:
        parent = self.proc.memory_info().rss
        children = 0
        for child in self.proc.children(recursive=True):
            try:
                children += child.memory_info().rss
            except psutil.Error:
                pass
        self.peak_parent = max(self.peak_parent, parent)
        self.peak_children = max(self.peak_children, children)
        self.peak_total = max(self.peak_total, parent + children)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self._sample()
            except psutil.Error:
                pass
            time.sleep(self.interval)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._thread.join()


def mb(value: int) -> float:
    return round(value / MB, 1)


async def measure(client, instance: str, entry: dict) -> dict:
    pid = pid_for_port(PORTS[instance])
    if not pid:
        raise SystemExit(f"{instance} is not running")
    baseline = psutil.Process(pid).memory_info().rss
    with TreeSampler(pid) as sampler:
        rec = await direct(client, instance, entry)
    await asyncio.sleep(1.0)
    return {
        "instance": instance,
        "status": rec["status"],
        "error": rec["error"],
        "backend_ms": rec["backend_ms"],
        "recall": rec.get("ocr_word_recall"),
        "baseline_mb": mb(baseline),
        "peak_parent_mb": mb(sampler.peak_parent),
        "peak_tesseract_mb": mb(sampler.peak_children),
        "peak_total_mb": mb(sampler.peak_total),
        "after_mb": mb(psutil.Process(pid).memory_info().rss),
    }


async def main(args) -> None:
    rows = []
    async with new_client(2) as client:
        for name, fmt, size, mode, kwargs, cap in CASES:
            if args.only and not any(part in name for part in args.only.split(",")):
                continue
            data, truth = page(size, fmt, mode, **kwargs)
            assert size[0] * size[1] <= MAX_PIXELS, name
            if len(data) > cap:
                print(f"skip {name}: {len(data):,} bytes is over its cap")
                continue
            entry = {"name": name, "class": "ocr-cap", "type": name.rsplit(".", 1)[1],
                     "size": len(data), "data": data, "ground_truth": truth}
            row = {"file": name, "bytes": len(data), "megapixels": round(size[0] * size[1] / 1e6, 2),
                   "decoded_mode": mode, "fits": "10 MB" if cap == NEW_CAP else "15 MB only"}
            targets = [args.new] + ([args.old] if args.old and cap == OLD_CAP else [])
            for instance in targets:
                result = await measure(client, instance, entry)
                rows.append(row | result)
                print(f"{name:<20} {len(data) / MB:5.1f} MB {row['megapixels']:5.2f} MP  {instance} "
                      f"HTTP {result['status']}  peak {result['peak_total_mb']:6.1f} MB "
                      f"(uvicorn {result['peak_parent_mb']}, tesseract {result['peak_tesseract_mb']})  "
                      f"{result['backend_ms']} ms  recall {result['recall']}")
    name = "ocr_cap" + (f"-{args.only.replace(',', '-')}" if args.only else "")
    path = save(Path(RESULTS) / args.run_id, name, {"command": "ocr_cap_bench", "args": vars(args), "rows": rows})
    print(f"saved {path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--new", default="O1")
    parser.add_argument("--old", default=None)
    parser.add_argument("--only", default="", help="comma-separated name fragments, e.g. webp")
    asyncio.run(main(parser.parse_args()))
