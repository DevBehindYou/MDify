<p align="center">
  <img src="frontend/public/mdify-icon.png" width="80" height="80" alt="MDify logo" />
</p>

<h1 align="center">MDify</h1>

<p align="center">
  <strong>Document → Markdown converter, powered by <a href="https://github.com/microsoft/markitdown">Microsoft MarkItDown</a></strong><br/>
  Upload any file. Get clean, structured <code>.md</code> in seconds.
</p>

<p align="center">
  <a href="https://mdify-app.onrender.com"><img src="https://img.shields.io/badge/Live%20Demo-mdify--app.onrender.com-F59E0B?style=flat-square&logo=render&logoColor=white" alt="Live Demo" /></a>
  <a href="https://github.com/DevBehindYou"><img src="https://img.shields.io/badge/Developer-DevBehindYou-181717?style=flat-square&logo=github&logoColor=white" alt="Developer" /></a>
  <a href="https://github.com/microsoft/markitdown"><img src="https://img.shields.io/badge/Powered%20by-MarkItDown-0078D4?style=flat-square&logo=microsoft&logoColor=white" alt="MarkItDown" /></a>
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" alt="Next.js 14" />
  <img src="https://img.shields.io/badge/FastAPI-Python%203.11-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
</p>

---

## What is MDify?

MDify is a free, open-source web app that converts documents to clean Markdown using Microsoft's [MarkItDown](https://github.com/microsoft/markitdown) library.

**Core flow:**

```
Upload files (drag & drop or browse)
        ↓
Click "Convert N files"
        ↓
Preview Markdown output inline
        ↓
Copy to clipboard or download .md files
```

Up to **10 files per session**, batch conversion, tabbed output viewer, and syntax-highlighted Markdown preview — all in a single-page dark UI.

---

## Live Demo

| Service  | URL |
|----------|-----|
| Frontend | https://mdify-app.onrender.com |
| Backend  | https://mdify-api.onrender.com |
| Why Use It? | https://mdify-app.onrender.com/usecase |

> **Free tier note:** Render free services sleep after 15 min of inactivity. First request may take 20–30 s to wake up.

---

## Supported File Types

| Format | Extensions | Notes |
|--------|-----------|-------|
| PDF | `.pdf` | Text extraction via pdfminer-six |
| Word | `.docx` `.doc` | Via mammoth |
| Excel | `.xlsx` `.xls` | Via openpyxl / xlrd |
| PowerPoint | `.pptx` `.ppt` | Via python-pptx |
| HTML | `.html` `.htm` | Via BeautifulSoup4 |
| Plain text | `.txt` | Direct read |
| CSV | `.csv` | Converted to Markdown table |
| JSON | `.json` | Formatted and converted |
| XML | `.xml` | Parsed and converted |
| ePub | `.epub` | Extracted and converted |
| Audio | `.wav` `.mp3` | Transcribed via SpeechRecognition |
| Image | `.jpg` `.jpeg` `.png` | OCR via ONNX + Pillow |
| Archive | `.zip` | Contents extracted and converted |

---

## Architecture

```
Browser
  │
  │  POST /api/convert  (multipart/form-data)
  │  GET  /api/health
  ▼
┌─────────────────────────────────────┐
│  mdify-app.onrender.com             │
│  Next.js 14  ·  Node 20            │
│                                     │
│  next.config.js rewrites            │
│  /api/health  → backend /health     │
│  /api/convert → backend /convert    │
└──────────────┬──────────────────────┘
               │  Reverse-proxy (no body size limit)
               ▼
┌─────────────────────────────────────┐
│  mdify-api.onrender.com             │
│  FastAPI  ·  Python 3.11            │
│  MarkItDown 0.1.x                   │
│                                     │
│  GET  /health   → status check      │
│  POST /convert  → file conversion   │
└─────────────────────────────────────┘
```

The Next.js app acts as a transparent reverse proxy via `next.config.js` rewrites — the browser never communicates directly with the Python backend.

---

## Project Structure

```
MDify/
├── render.yaml               Render blueprint (one-click deploy)
├── README.md
├── markitdown-setup-guide.pdf
│
├── backend/
│   ├── main.py               FastAPI server (all conversion logic)
│   ├── requirements.txt      Python dependencies
│   └── .env.example
│
└── frontend/
    ├── package.json
    ├── next.config.js        Rewrite rules → backend proxy
    ├── tailwind.config.js    Design tokens + custom theme
    ├── postcss.config.js
    ├── .env.example
    └── app/
        ├── layout.js         HTML shell + fonts + metadata
        ├── globals.css       Base styles + animations
        ├── page.js           Main converter UI (~800 lines)
        └── usecase/
            └── page.js       /usecase — why use MDify?
```

---

## Local Development

### Prerequisites

- **Python 3.10+**
- **Node.js 18+**

---

### 1 — Backend (Python / FastAPI)

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (macOS / Linux)
source venv/bin/activate
# Activate (Windows)
venv\Scripts\activate

# Install dependencies (~500 MB — includes MarkItDown extras)
pip install -r requirements.txt

# Start API server with hot reload
uvicorn main:app --reload --port 8000
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

---

### 2 — Frontend (Next.js)

Open a second terminal:

```bash
cd frontend

# Copy env template (sets BACKEND_URL=http://localhost:8000)
cp .env.example .env.local

# Install packages
npm install

# Start dev server with hot reload
npm run dev
# → http://localhost:3000
```

---

### Verify the connection

```bash
# Backend health check
curl http://localhost:8000/health
# → {"status":"ok","markitdown":true}
```

---

## Deploy to Render

### Option A — One-click Blueprint

1. Render dashboard → **New → Blueprint**
2. Connect this GitHub repo — Render reads `render.yaml` and creates both services
3. After first deploy, fill in environment variables:
   - `BACKEND_URL` on the frontend service → your backend Render URL
   - `FRONTEND_URL` on the backend service → your frontend Render URL
4. Trigger a redeploy on both services

---

### Option B — Manual Deploy

**Deploy backend first:**

| Setting | Value |
|---------|-------|
| Runtime | Python 3 |
| Root Directory | `backend/` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |

**Then deploy frontend:**

| Setting | Value |
|---------|-------|
| Runtime | Node |
| Root Directory | `frontend/` |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Environment variable | `BACKEND_URL` = your backend URL from above |

**Finally, wire CORS:**

Go back to the backend service → Environment → add `FRONTEND_URL` = your frontend URL → Save.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Conversion | Microsoft MarkItDown |
| Deploy | Render |

---

## Developer

Built by **[DevBehindYou](https://github.com/DevBehindYou)**

Powered by Microsoft's open-source [MarkItDown](https://github.com/microsoft/markitdown) library.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Backend offline" badge | Confirm `uvicorn` is running and `BACKEND_URL` is correct |
| `ImportError: markitdown` | Run `pip install 'markitdown[all]'` in your virtualenv |
| Audio/image conversion fails | `markitdown[all]` includes Whisper + OCR; verify install |
| CORS errors in browser | Set `FRONTEND_URL` on the backend to match your frontend URL |
| Render free tier sleeps | Upgrade to Starter ($7/mo) or add an uptime monitor (e.g. UptimeRobot) |
| `BACKEND_URL` not updating | This is read at build time — trigger a full frontend redeploy after changing it |
