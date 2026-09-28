import pytest

from fixtures import make_docx, make_epub, make_pdf, make_pptx, make_xlsx

# ── health / readiness / auth ────────────────────────────────────────────────


def test_health_reports_role_and_instance(client):
    body = client.get("/api/v1/health").json()
    assert body == {"status": "ok", "role": "normal", "instance": "N1", "version": "test"}


def test_ready_when_engine_and_secret_present(client):
    res = client.get("/api/v1/ready")
    assert res.status_code == 200
    assert res.json()["engine"] == "MarkItDown"


def test_not_ready_without_secret(make_client):
    assert make_client(secret="").get("/api/v1/ready").status_code == 503


def test_convert_rejects_wrong_secret(convert):
    assert convert("a.txt", b"hello", secret="nope").status_code == 401


def test_convert_fails_closed_without_configured_secret(make_client):
    res = make_client(secret="").post(
        "/api/v1/internal/convert",
        files={"file": ("a.txt", b"hello")},
        headers={"X-Internal-Secret": ""},
    )
    assert res.status_code == 503


def test_public_docs_are_disabled(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


# ── conversions ──────────────────────────────────────────────────────────────

CASES = [
    ("notes.txt", b"plain words here", "plain words here"),
    ("readme.md", b"# Readme\n\nSome **bold** text", "Some **bold** text"),
    ("table.csv", b"name,city\nAda,London\n", "Ada"),
    ("table.tsv", b"name\tcity\nAda\tLondon\n", "Ada"),
    ("data.json", b'{"key": "value"}', "value"),
    ("feed.xml", b"<root><item>xml-item</item></root>", "xml-item"),
    ("page.html", b"<html><head><title>T</title></head><body><h2>Section</h2><p>Hi html</p></body></html>", "Hi html"),
]


@pytest.mark.parametrize("name,data,expected", CASES)
def test_text_formats_convert(convert, name, data, expected):
    res = convert(name, data)
    assert res.status_code == 200, res.text
    body = res.json()
    assert expected in body["content"]
    assert body["backend_role"] == "normal"
    assert body["backend_instance"] == "N1"
    assert body["filename"] == name.rsplit(".", 1)[0] + ".md"
    assert body["content"].startswith("# ")


def test_pdf_converts(convert):
    res = convert("report.pdf", make_pdf("Hello PDF World from MDify"))
    assert res.status_code == 200, res.text
    assert "Hello PDF World from MDify" in res.json()["content"]


def test_docx_converts(convert):
    res = convert("memo.docx", make_docx("Quarterly Memo", "Revenue grew steadily."))
    assert res.status_code == 200, res.text
    content = res.json()["content"]
    assert "Quarterly Memo" in content
    assert "Revenue grew steadily." in content


def test_xlsx_converts_to_table(convert):
    res = convert("sheet.xlsx", make_xlsx([["Name", "Score"], ["Ada", 99]]))
    assert res.status_code == 200, res.text
    content = res.json()["content"]
    assert "| Name" in content and "Ada" in content


def test_pptx_converts(convert):
    res = convert("deck.pptx", make_pptx("Launch Plan", "Ship on Monday"))
    assert res.status_code == 200, res.text
    content = res.json()["content"]
    assert "Launch Plan" in content and "Ship on Monday" in content


def test_epub_converts(convert):
    res = convert("book.epub", make_epub("It was a bright cold day."))
    assert res.status_code == 200, res.text
    assert "It was a bright cold day." in res.json()["content"]


def test_scanned_like_pdf_gets_warning(convert):
    res = convert("scan.pdf", make_pdf(""))
    assert res.status_code == 200, res.text
    assert res.json()["warning"] == "low-text-pdf"


# ── validation ───────────────────────────────────────────────────────────────


def test_images_are_not_accepted_by_normal_pool(convert):
    res = convert("photo.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
    assert res.status_code == 400
    assert "normal pool" in res.json()["detail"]


def test_unknown_extension_rejected(convert):
    assert convert("archive.zip", b"PK\x03\x04").status_code == 400


def test_pdf_magic_mismatch_rejected(convert):
    res = convert("fake.pdf", b"this is not a pdf")
    assert res.status_code == 400
    assert "does not match" in res.json()["detail"]


def test_docx_without_word_part_rejected(convert):
    assert convert("fake.docx", make_epub("x")).status_code == 400


def test_binary_disguised_as_text_rejected(convert):
    assert convert("evil.txt", b"MZ\x00\x00binary").status_code == 400


def test_corrupt_pdf_is_422(convert):
    res = convert("broken.pdf", b"%PDF-1.4\n" + b"\xff" * 200)
    assert res.status_code in (200, 422)
    if res.status_code == 200:
        # pdfminer may tolerate garbage and yield no text; then it's flagged.
        assert res.json()["warning"] == "low-text-pdf"


def test_empty_file_rejected(convert):
    assert convert("empty.txt", b"").status_code == 400


def test_oversize_file_rejected(make_client):
    client = make_client(max_upload_bytes=10)
    res = client.post(
        "/api/v1/internal/convert",
        files={"file": ("big.txt", b"x" * 11)},
        headers={"X-Internal-Secret": "test-secret"},
    )
    assert res.status_code == 413


def test_path_components_are_stripped_from_names(convert):
    res = convert("../../etc/passwd.txt", b"root:x:0:0")
    assert res.status_code == 200
    assert res.json()["original_name"] == "passwd.txt"


# ── profiles ─────────────────────────────────────────────────────────────────


def test_standard_profile_has_source_line(convert):
    content = convert("n.txt", b"body").json()["content"]
    assert "> **Source:** `n.txt`" in content
    assert "**Engine:** MarkItDown" in content


def test_clean_profile_drops_source_line(convert):
    content = convert("n.txt", b"body", profile="Clean").json()["content"]
    assert "**Source:**" not in content


def test_rag_profile_marks_chunks(convert):
    content = convert("n.md", b"## One\n\nA\n\n## Two\n\nB", profile="RAG-ready").json()["content"]
    assert content.startswith("<!-- rag-profile:")
    assert content.count("<!-- chunk-boundary -->") == 2


def test_unknown_profile_falls_back_to_standard(convert):
    content = convert("n.txt", b"body", profile="Bogus").json()["content"]
    assert "**Source:**" in content
