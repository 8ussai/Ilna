# Ilna: developer guide

How to run, configure and deploy Ilna. For what the site does, see the [README](README.md).

## Tech stack

| Part | Built with |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, i18next, perfect-freehand (drawn notes), jsPDF (drawing downloads) |
| Backend | FastAPI, SQLAlchemy, SQLite, JWT auth |
| Search index | [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) in ChromaDB, via LangChain |
| Transcription | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) `large-v3-turbo` |
| Summaries & quizzes | Google Gemini Flash (falls back through `GEMINI_MODELS` as each runs out of quota) |
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
| `npm run lint` | Runs oxlint |

## Configuration

Limits and other settings live in [`backend/config.py`](backend/config.py). The main ones:

| Setting | Default |
| --- | --- |
| Courses per user | 5 (premium: unlimited) |
| Storage per user | 1 GB (premium: 5 GB) |
| Largest single file or recording | 95 MB |
| Summaries and quizzes per day | 2 of each (premium: shown as unlimited) |
| Gemini models (`GEMINI_MODELS`) | 3.6 Flash, 2.5 Flash, then 3.1 Flash-Lite; tried in that order, each skipped while it's out of quota, overloaded or retired |
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
  data/                  university, college and major catalog, and the C++ script that sorts it
frontend/src/
  main.tsx, App.tsx      start-up: the admin panel at /admin, the student site everywhere else
  api/                   typed API client, one file per backend area
  features/              one folder per part of the site:
    auth/                log in, sign up, email code, forgot password
    landing/             the page for visitors who aren't logged in
    home/                the logged-in app's shell: header, tabs, account drawer, routing
    blog/                posts, replies, votes, reports, pictures, anonymous authors, links
    friends/             profile cards, the Friends page, the shared friends list
    account/             settings, activity, notifications, contact, premium
    courses/             courses, files, recordings, notes, links, sharing, summaries, quizzes
    admin/               the admin panel
    maintenance/         the closing-soon banner and the closed page
  components/            shared UI: dialogs, fields, selects, header, tab bar, button styles
  hooks/                 shared React hooks (autosave, polling, unread count)
  lib/                   small helpers: dates, sizes, links, routes, theme color, catalog names
  locales/               English and Arabic text
deploy/              free hosting on an Oracle Cloud VM: setup, update and backup scripts, and the guide
```

## Universities

### Supported now

All in Jordan (country id `jordan`):

| id | University | Email domain | Colleges | Majors |
| --- | --- | --- | --- | --- |
| `aabu` | Al Al Bayt University | `st.aabu.edu.jo` | 14 | 56 |
| `ju` | University of Jordan | `ju.edu.jo` | 19 | 91 |
| `psut` | Princess Sumaya University for Technology | `std.psut.edu.jo` | 3 | 14 |
| `zu` | Zarqa University | `zu.edu.jo` | 14 | 44 |
| `asu` | Applied Science Private University | `students.asu.edu.jo` | 11 | 44 |
| `just` | Jordan University of Science and Technology | `just.edu.jo` | 11 | 77 |
| `hu` | The Hashemite University | `std.hu.edu.jo` | 15 | 57 |
| `yu` | Yarmouk University | `ses.yu.edu.jo` | 16 | 79 |
| `aau` | Amman Arab University | `aau.edu.jo` | 11 | 30 |

Keep this table and the one in the [README](README.md#supported-universities) up to date when the catalog changes.

### How the catalog works

Every country, university, college and major lives in one file, [`backend/data/universities.json`](backend/data/universities.json). There's no database table for them. The backend reads the file once at startup (`backend/core/catalog.py`) and serves it to the sign-up form at `GET /universities`, so the frontend needs no changes.

The file nests like this:

```json
{
  "countries": [
    {
      "id": "jordan", "name_en": "Jordan", "name_ar": "الأردن",
      "universities": [
        {
          "id": "ju", "name_en": "University of Jordan", "name_ar": "الجامعة الأردنية",
          "domain": "ju.edu.jo",
          "colleges": [
            {
              "id": "ju-eng", "name_en": "Engineering", "name_ar": "الهندسة",
              "majors": [
                { "id": "ju-eng-ce", "name_en": "Computer Engineering", "name_ar": "هندسة الحاسوب" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

- `domain` is the university's **student** email domain (students' addresses are `ID@domain`). Sign-up accepts that domain or any of its subdomains, so `just.edu.jo` also allows `eng.just.edu.jo`. The check is `is_student_email` in `backend/core/catalog.py`, mirrored in `RegisterForm.tsx`. Changing a domain doesn't affect accounts that already exist.
- Users and posts store these `id`s, and the blogs for each university, college and major are keyed by them.

### Adding a university, college or major

1. Add the entry to `backend/data/universities.json` under its parent: a university under its country, a college under its university, a major under its college. A new country goes in `countries` with its own `universities` list.
2. Give it an `id`, `name_en` and `name_ar`, and for a university its student email `domain`. Follow the pattern: a short university id (`ju`), then `<university>-<college>` (`ju-eng`), then `<university>-<college>-<major>` (`ju-eng-ce`). College and major ids must be unique across the whole catalog, not just within their parent.
3. Don't change or remove an existing `id`. Users who already picked it would no longer match the catalog. Fixing a typo in a name is fine.
4. Sort the file (see below) and check `git diff`.
5. Restart the backend so it reads the new file.
6. Update the two "supported universities" tables (here and in the README).

## Sorting the university catalog

`backend/data/sort_universities.cpp` sorts `universities.json` in Arabic alphabetical order and overwrites the file. Run it after adding universities, colleges or majors. It's a one-off tool, not part of the app.

Every list with a `name_ar` field is sorted by that name: countries, universities, colleges and majors. Items stay under the same parent and their `id`s don't change, so existing users' choices still work.

Names are compared like a dictionary:

- a leading "ال" is ignored, so التاريخ sorts under ت
- أ إ آ ٱ count as ا, ة as ه, ى and ئ as ي, ؤ as و
- harakat and tatweel ـ are ignored
- names that compare equal keep their current order

Build, run and remove the program from `backend/data` (needs `g++`, for example from MSYS2):

```bash
cd backend/data
g++ -std=c++17 -o sort_universities sort_universities.cpp && ./sort_universities && rm sort_universities.exe
```

Some limits to know:

- The script expects valid JSON that holds only objects, lists and strings, which is what the catalog contains. It doesn't check the file first, so check `git diff` afterwards. `git restore backend/data/universities.json` undoes a bad run.
- The output uses 2-space indentation and Unix line endings.
- `.exe` files are ignored by git (`*.exe` in `.gitignore`), so the built program is never committed.

## Deployment

The frontend is hosted on Cloudflare Workers as static assets (`frontend/wrangler.jsonc`), which rebuilds on every push to `main`. The backend, database and uploads run on a free Oracle Cloud ARM VM as the `ilna-backend` service, and a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) sends `api.ilna-academic.com` to it on port 8000. The full setup, updates, backups and restores are in [deploy/DEPLOY.md](deploy/DEPLOY.md).

Cloudflare's free plan rejects request bodies over 100 MB, which is why uploads stop at 95 MB.
