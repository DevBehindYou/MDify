# MarkItDown Web

> Convert any document to clean Markdown — PDF, Word, Excel, PowerPoint, HTML, and more.  
> Powered by [Microsoft MarkItDown](https://github.com/microsoft/markitdown).

---

## Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| Frontend | Next.js 14 · Tailwind CSS     |
| Backend  | Python · FastAPI · MarkItDown |
| Deploy   | Render (recommended)          |

---

## Local Development

### 1 — Backend (Python / FastAPI)

```bash
cd backend

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

uvicorn main:app --reload --port 8000
# → http://localhost:8000
```

### 2 — Frontend (Next.js)

Open a second terminal:

```bash
cd frontend
cp .env.example .env.local      # BACKEND_URL=http://localhost:8000

npm install
npm run dev
# → http://localhost:3000
```

---

## Deploy to Render

This is the recommended platform. The Python backend runs as a persistent web
service — no serverless timeouts or 250 MB size caps.

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "init: markitdown-web"
git remote add origin https://github.com/YOUR_USER/markitdown-web.git
git push -u origin main
```

### Step 2 — Deploy backend first

1. Go to [render.com/new](https://render.com/new) → **Web Service**
2. Connect your GitHub repo
3. Set **Root Directory** → `backend`
4. Runtime: **Python 3**
5. Build command: `pip install -r requirements.txt`
6. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
7. Click **Deploy**
8. Copy the live URL, e.g. `https://markitdown-backend.onrender.com`

### Step 3 — Deploy frontend

1. Render → **New Web Service** → same repo
2. Root Directory → `frontend`
3. Runtime: **Node**
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
6. **Environment Variables**:
   - `BACKEND_URL` = `https://markitdown-backend.onrender.com` ← from Step 2
   - `PORT` = `3000`
7. Click **Deploy**
8. Copy the live URL, e.g. `https://markitdown-frontend.onrender.com`

### Step 4 — Wire CORS

1. Go back to the **backend** service on Render → Environment
2. Add `FRONTEND_URL` = `https://markitdown-frontend.onrender.com`
3. Click **Save Changes** — Render redeploys automatically

Done. Both services are live and talking to each other.

> **Free tier note**: Render free services sleep after 15 minutes of inactivity.
> Upgrade to the Starter plan ($7/mo) for always-on behaviour.

### One-click deploy with render.yaml

Alternatively, use the included `render.yaml` blueprint:

1. Render dashboard → **New → Blueprint**
2. Connect repo — Render auto-reads `render.yaml` and creates both services
3. Fill in the two env vars (`BACKEND_URL`, `FRONTEND_URL`) after the first deploy

---

## Supported File Types

| Format     | Extensions                      |
|------------|----------------------------------|
| PDF        | `.pdf`                           |
| Word       | `.docx` `.doc`                   |
| Excel      | `.xlsx` `.xls`                   |
| PowerPoint | `.pptx` `.ppt`                   |
| Web        | `.html` `.htm`                   |
| Text       | `.txt` `.csv` `.json` `.xml`     |
| E-book     | `.epub`                          |
| Audio      | `.wav` `.mp3` (needs Whisper)    |
| Image      | `.jpg` `.jpeg` `.png` (OCR)      |
| Archive    | `.zip`                           |

---

## Project Structure

```
markitdown-web/
├── render.yaml                  ← Render blueprint (both services)
├── .gitignore
├── README.md
├── backend/
│   ├── main.py                  ← FastAPI server
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── package.json
    ├── next.config.js           ← uses BACKEND_URL env var
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── .env.example
    └── app/
        ├── layout.js
        ├── globals.css
        ├── page.js              ← full UI (single page, two panels)
        └── api/
            └── convert/
                └── route.js    ← Next.js → FastAPI proxy
```

---

## Environment Variables Reference

### Frontend (`frontend/.env.local`)

| Variable      | Default                    | Description                    |
|---------------|----------------------------|--------------------------------|
| `BACKEND_URL` | `http://localhost:8000`    | URL of the FastAPI backend     |

### Backend (`backend/.env`)

| Variable       | Default                   | Description                          |
|----------------|---------------------------|--------------------------------------|
| `FRONTEND_URL` | `http://localhost:3000`   | Comma-separated allowed CORS origins |

---

## Troubleshooting

| Issue                          | Fix                                                                 |
|--------------------------------|---------------------------------------------------------------------|
| "Backend offline" badge        | Make sure `uvicorn main:app` is running and `BACKEND_URL` is correct |
| `ImportError: markitdown`      | Run `pip install 'markitdown[all]'` inside your virtualenv          |
| Audio/image conversion fails   | `markitdown[all]` includes Whisper + pytesseract; confirm install   |
| CORS errors in browser         | Set `FRONTEND_URL` on the backend service to match the frontend URL |
| Render free tier sleeps        | Upgrade to Starter ($7/mo) or add an uptime monitor (e.g. UptimeRobot) |
