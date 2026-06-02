<p align="center">
  <img src="frontend/public/mdify-icon.png" width="80" height="80" alt="MDify logo" style="border-radius:18px" />
</p>

<h1 align="center">MDify</h1>

<p align="center">
  <strong>Drop a document. Get Markdown.</strong><br/>
  Built on <a href="https://github.com/microsoft/markitdown">Microsoft MarkItDown</a>.
  Made by <a href="https://github.com/DevBehindYou">DevBehindYou</a>.
</p>

<p align="center">
  <a href="https://mdify-app.vercel.app"><img src="https://img.shields.io/badge/Live_Demo-mdify--app.vercel.app-F59E0B?style=flat-square&logo=render&logoColor=white" alt="Live Demo" /></a>
  <a href="https://github.com/DevBehindYou"><img src="https://img.shields.io/badge/Developer-DevBehindYou-181717?style=flat-square&logo=github&logoColor=white" alt="Developer" /></a>
  <a href="https://github.com/microsoft/markitdown"><img src="https://img.shields.io/badge/Powered_by-MarkItDown-0078D4?style=flat-square&logo=microsoft&logoColor=white" alt="MarkItDown" /></a>
</p>

---

## The Problem

You have a folder of PDFs, Word docs, spreadsheets, and slide decks. You need them in Markdown. Maybe you're feeding files into an LLM pipeline. Maybe you're migrating a wiki. Maybe you're tired of copy-pasting from Word into your CMS.

MDify handles the conversion. Upload your files. Click convert. Download the `.md` output.

No account. No watermark. No pricing page.

---

## What It Does

MDify is a free, open-source web app. You drag documents onto it, and it gives you clean Markdown files back.

- **12+ file formats** in, one format out
- **10 files per batch**, converted one at a time to stay within memory limits
- **Syntax-highlighted preview** right in the browser
- **Copy or download** with one click
- **Dark-themed UI** because nobody asked for light mode

---

## Supported Formats

| Format | Extensions |
|--------|-----------|
| PDF | `.pdf` |
| Word | `.docx` |
| Excel | `.xlsx` `.xls` |
| PowerPoint | `.pptx` |
| HTML | `.html` `.htm` |
| Plain Text | `.txt` |
| CSV | `.csv` |
| JSON | `.json` |
| XML | `.xml` |
| ePub | `.epub` |
| Images | `.jpg` `.jpeg` `.png` (metadata extraction) |

---

## How It Works

```
Your files → Next.js frontend → FastAPI backend → MarkItDown → clean .md
```

The frontend is a Next.js 14 single-page app with drag-and-drop upload. It proxies requests to a FastAPI backend through `next.config.js` rewrites. The backend wraps Microsoft's MarkItDown library, converts files to Markdown, and sends the output back as JSON.

Your browser never talks to the Python server directly. The Next.js app handles the proxy.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Conversion | Microsoft MarkItDown |
| Hosting | Render (free tier) |

---

## Run It Locally

**Backend:**

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend** (second terminal):

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Upload a file. Watch it convert.

---

## Live Demo

The app runs free on Render. First load takes 20-30 seconds while the backend wakes up. The frontend shows a countdown while it waits.

**App:** [https://mdify-app.vercel.app](https://mdify-app.vercel.app/)
**Use Cases:** [https://mdify-app.vercel.app/usecase](https://mdify-app.vercel.app/usecase)

---

## Developer

Built by **[DevBehindYou](https://github.com/DevBehindYou)**.
Powered by Microsoft's open-source [MarkItDown](https://github.com/microsoft/markitdown) library.
