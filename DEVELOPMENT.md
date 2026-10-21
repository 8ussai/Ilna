# Ilna: developer guide

How to run, configure and deploy Ilna. For what the site does, see the [README](README.md).

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
venv\Scripts\alembic.exe revision --autogenerate -m "what changed"
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

Limits and other settings live in [`backend/config.py`](backend/config.py). The main ones:

| Setting | Default |
| --- | --- |
| Courses per user | 5 (premium: unlimited) |
| Storage per user | 1 GB (premium: 5 GB) |
| Largest single file or recording | 95 MB |
| Summaries and quizzes per day | 2 of each (premium: shown as unlimited) |
| Friends per user | 100 (premium: 500) |
| Pictures per post | 4, up to 10 MB each |
| Login lasts | 7 days |

A few of these are mirrored in the frontend, for example `MAX_UPLOAD_BYTES` in `frontend/src/api/courses.ts`. Each one has a comment saying where its partner is.

## Project structure

```
backend/                 one folder per feature: models.py (tables), schemas.py (request and
                         response shapes), *routes.py (API endpoints) and the logic they use
  main.py                app setup, maintenance gate, routers
  config.py              settings and limits
  database.py            SQLite engine and session
  core/                  logins and tokens, request dependencies, email, background jobs,
                         file removal, the university catalog
  accounts/              users, sign-up and login, /me, usage limits, storage, account deletion
  blog/                  posts, replies, votes, reports, anonymous posts, post pictures
  notifications/         notifications and who gets them
  friends/               friends lists and user search
  courses/               courses, files, recordings, notes, links, sharing, AI indexing, transcription
  study/                 AI summaries and quizzes (Gemini)
  contact/               the Contact us form
  admin/                 the admin panel's API: login, users, posts, reports, messages, courses, log
  maintenance/           closing the site for a while
  meta/                  the catalog and site status
  migrations/            Alembic database migrations, run on startup
  data/                  university, college and major catalog
frontend/src/
  main.tsx, App.tsx      start-up: the admin panel at /admin, the student site everywhere else
  api/                   typed API client, one file per backend area
  features/              one folder per part of the site:
    auth/                log in, sign up, email code, forgot password
    landing/             the page for visitors who aren't logged in
    home/                the logged-in app's shell: header, tabs, account drawer, routing
    blog/                posts, replies, votes, reports, pictures, anonymous authors
    friends/             profile cards, the Friends page, the shared friends list
    account/             settings, activity, notifications, contact, premium
    courses/             courses, files, recordings, notes, links, sharing, summaries, quizzes
    admin/               the admin panel
    maintenance/         the closing-soon banner and the closed page
  components/            shared UI: dialogs, fields, selects, header, tab bar, button styles
  hooks/                 shared React hooks (autosave, polling, unread count)
  lib/                   small helpers: dates, sizes, links, routes, theme color, catalog names
  locales/               English and Arabic text
start-demo.ps1       builds and runs the public demo on Windows
```

## Deployment

The public site runs on a single Windows machine behind a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/). `start-demo.ps1` builds the frontend, then starts the API on port 8000 and `vite preview` on port 4173. The tunnel sends `ilna-academic.com` to 4173 and `api.ilna-academic.com` to 8000.

Cloudflare's free plan rejects request bodies over 100 MB, which is why uploads stop at 95 MB.
