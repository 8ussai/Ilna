# Ilna

**Your university life, in one place.** Ilna brings a student's courses, study material and campus community together. Upload your slides and lecture recordings, get AI summaries and quizzes made from them, and talk with students at your university, in your college and in your major.

Live at **[ilna-academic.com](https://ilna-academic.com)**. Available in English and Arabic (right-to-left).

## Features

### Study workspace
- **Courses** hold a subject's slides and documents (PDF, PPT, PPTX), lecture recordings, links and notes.
- **Recordings**: record a lecture in the browser or upload audio (MP3, M4A, WAV, WEBM, OGG). It's transcribed automatically in Arabic or English, with a transcript you can click to jump through the audio.
- **Notes** can be typed or drawn by hand.
- **AI summaries and quizzes** are made from the material you choose: brief or detailed summaries, and multiple-choice quizzes with explanations. Either one can be read in the other language.

### Campus feed
- Posts in four places: everyone, your university, your college and your major.
- Votes, threaded replies, and sorting by hot, new or top.
- Notifications, reports and a contact form.

### Accounts
- Sign up with an emailed code, and reset a forgotten password the same way.
- **Premium** (granted by the admin): unlimited courses, more storage, more AI and a gold name.

### Admin panel (`/admin`)
- Users: verify, ban, delete, grant premium, and make test accounts.
- Posts and replies: remove, pin, and publish as the admin.
- Reports, the contact inbox, messages to users, and a log of every admin action.
- **Maintenance mode**: close the site for a while with a countdown. It opens again by itself.

## Tech stack

| Part | Built with |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, i18next |
| Backend | FastAPI, SQLAlchemy, SQLite, JWT auth |
| Search index | [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) in ChromaDB, via LangChain |
| Transcription | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) `large-v3-turbo` |
| Summaries & quizzes | Google Gemini 2.5 Flash |
| Email | Any SMTP server (production uses Brevo) |

The AI models run locally. They use a GPU (CUDA) when there is one and fall back to the CPU otherwise.

## Getting started

### Requirements
- Python 3.10+
- Node.js 20+
- About 3 GB of disk space for the AI models, which download into `models/` on first use
- A [Gemini API key](https://aistudio.google.com/apikey) for summaries and quizzes
- An SMTP account for sign-up codes and the contact form

### 1. Backend

```bash
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill it in:

| Variable | What it's for |
| --- | --- |
| `SECRET_KEY` | Signs login tokens. Any long random string: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `GOOGLE_API_KEY` | Gemini, for summaries and quizzes |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Sends sign-up codes, password resets and contact messages. Port 465 uses SSL, anything else STARTTLS. |
| `ADMIN_EMAIL` | The only address that can get an admin login code at `/admin` |

Start the API from the project root:

```bash
uvicorn backend.main:app --reload --port 8000
```

On the first start the backend creates the database (`ilna.db`), the upload and index folders, and the admin account. The API docs are at http://localhost:8000/docs.

The database is managed with Alembic migrations (`backend/migrations`), which the backend runs on every start. After changing a model, make a migration from the project root and read the generated file before committing it:

```
venvScriptsalembic.exe revision --autogenerate -m "what changed"
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env    # VITE_API_URL=http://localhost:8000
npm run dev
```

Open http://localhost:5173.

| Command | Does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-checks and builds to `frontend/dist`, using the API URL in `.env.production` |
| `npm run preview` | Serves the built site on port 4173 |
| `npm run lint` | Runs oxlint |

## Configuration

Limits and other settings live in [`backend/backendConfig.py`](backend/backendConfig.py). The main ones:

| Setting | Default |
| --- | --- |
| Courses per user | 5 (premium: unlimited) |
| Storage per user | 1 GB (premium: 5 GB) |
| Largest single file or recording | 95 MB |
| Summaries and quizzes per day | 2 of each (premium: shown as unlimited) |
| Login lasts | 7 days |

A few of these are mirrored in the frontend, for example `MAX_UPLOAD_BYTES` in `frontend/src/api/courses.ts`. Each one has a comment saying where its partner is.

## Project structure

```
backend/
  main.py            app setup, maintenance gate, routers
  backendConfig.py   settings and limits
  database.py        SQLite engine and session
  models/            SQLAlchemy tables
  migrations/        Alembic database migrations, run on startup
  schemas/           Pydantic request and response models
  routes/            API endpoints
  services/          AI indexing, transcription, Gemini, email, jobs
  data/              university, college and major catalog
frontend/
  src/api/           typed API client
  src/pages/         app pages, and admin/ for the admin panel
  src/components/    UI, and courses/ for the study workspace
  src/locales/       English and Arabic text
start-demo.ps1       builds and runs the public demo on Windows
```

## Deployment

The public site runs on a single Windows machine behind a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/). `start-demo.ps1` builds the frontend, then starts the API on port 8000 and `vite preview` on port 4173. The tunnel sends `ilna-academic.com` to 4173 and `api.ilna-academic.com` to 8000.

Cloudflare's free plan rejects request bodies over 100 MB, which is why uploads stop at 95 MB.
