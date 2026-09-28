"""Builds test archives in memory, including hostile ones."""

from __future__ import annotations

import io
import zipfile

from PIL import Image, ImageDraw


def make_zip(entries: dict[str, bytes | str], *, compression=zipfile.ZIP_DEFLATED) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression) as z:
        for name, data in entries.items():
            z.writestr(name, data.encode() if isinstance(data, str) else data)
    return buf.getvalue()


def zip_with_infos(infos: list[tuple[zipfile.ZipInfo, bytes]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for info, data in infos:
            z.writestr(info, data)
    return buf.getvalue()


def mark_encrypted(data: bytes, name: str) -> bytes:
    """Sets the "encrypted" flag on one entry. zipfile cannot write encrypted
    entries (it resets flag_bits), so the headers are patched directly."""
    raw = bytearray(data)
    encoded = name.encode()
    for sig, flags_at, name_len_at, name_at in ((b"PK\x03\x04", 6, 26, 30), (b"PK\x01\x02", 8, 28, 46)):
        pos = raw.find(sig)
        while pos != -1:
            length = int.from_bytes(raw[pos + name_len_at:pos + name_len_at + 2], "little")
            if bytes(raw[pos + name_at:pos + name_at + length]) == encoded:
                raw[pos + flags_at] |= 0x1
            pos = raw.find(sig, pos + 4)
    return bytes(raw)


def png_bytes(text: str = "Diagram", size=(400, 120)) -> bytes:
    img = Image.new("RGB", size, "white")
    ImageDraw.Draw(img).text((10, 40), text, fill="black")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def html_doc(title: str, body: str) -> str:
    return f"<html><body><h1>{title}</h1><p>{body}</p></body></html>"
