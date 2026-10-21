from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
import os
from datetime import timedelta
from pathlib import Path

load_dotenv()

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# the AI models (~3 GB) live in the project's models/ folder instead of the user's home cache;
# Hugging Face reads this when its libraries are first imported, so anything that loads a model imports this file first
os.environ.setdefault("HF_HOME", os.path.join(PROJECT_ROOT, "models"))


SQLALCHEMY_DATABASE_URL = "sqlite:///./ilna.db"

# signs login tokens; set in .env, never in code
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is missing from .env (see .env.example)")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 10080

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
# admin logins come from the emailed code, not a password; tokenUrl only labels the docs page
admin_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="admin/verify-code", scheme_name="AdminLogin")

UPLOAD_DIR = "uploads/courses"
os.makedirs(UPLOAD_DIR, exist_ok=True)

CHROMA_DB_DIR = "chroma_db"
os.makedirs(CHROMA_DB_DIR, exist_ok=True)

# the universities and majors offered at sign-up
CATALOG_PATH = Path(PROJECT_ROOT) / "backend" / "data" / "universities.json"

# extension -> content type it is served with; set here rather than guessed, since Python guesses .webm as video
DOCUMENT_EXTENSIONS = {
    "pdf": "application/pdf",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
# webm/ogg are what Chrome and Firefox record; m4a is what Safari records
AUDIO_EXTENSIONS = {
    "mp3": "audio/mpeg",
    "m4a": "audio/mp4",
    "wav": "audio/wav",
    "webm": "audio/webm",
    "ogg": "audio/ogg",
}
ALLOWED_EXTENSIONS = DOCUMENT_EXTENSIONS.keys() | AUDIO_EXTENSIONS.keys()

# a drawn note's stroke JSON; text notes are much smaller
MAX_DRAWING_BYTES = 1_000_000
MAX_TEXT_NOTE_CHARS = 100_000
# a typed note waits this long after its last edit before it's indexed for the AI
NOTE_INDEX_DELAY_SEC = 30

# total size of all files one user can upload
STORAGE_LIMIT_BYTES = 1024 ** 3
# premium (turned on from the admin panel) gets more room
PREMIUM_STORAGE_LIMIT_BYTES = 5 * 1024 ** 3
# largest single file or recording, premium too; Cloudflare's free plan drops request bodies over 100 MB,
# so this stays under it with room for the rest of the form
MAX_UPLOAD_BYTES = 95 * 1024 ** 2
# uploads are read and written this much at a time
UPLOAD_CHUNK_BYTES = 1024 * 1024

# courses one user can have; premium has no limit
COURSE_LIMIT = 5

# course material is embedded with this model
EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-0.6B"
# named after the model: vectors from another model can't share a collection (different sizes and meaning)
CHROMA_COLLECTION_NAME = "course_chunks_qwen3"
# Qwen3 reads long inputs well, so chunks can carry more context than MiniLM's did;
# transcript segments are merged into chunks about this long too, but without overlap
CHUNK_CHARS = 1500
CHUNK_OVERLAP_CHARS = 200

# recordings are transcribed with this faster-whisper model
WHISPER_MODEL = "large-v3-turbo"
# languages a recording can be transcribed as; anything else is detected
TRANSCRIPT_LANGUAGES = {"ar", "en"}
# write progress at most this often, so a long lecture isn't thousands of tiny commits
TRANSCRIBE_PROGRESS_EVERY_SEC = 2

# summaries and quizzes are written by Gemini; GOOGLE_API_KEY goes in .env
GEMINI_MODEL = "gemini-2.5-flash"
# summaries and quizzes one user can start in any 24 hours, by kind (retries of failed ones don't count)
STUDY_DAILY_LIMITS = {"summary": 2, "quiz": 2}
# premium is shown as unlimited; this hidden cap only guards the Gemini quota
PREMIUM_STUDY_DAILY_LIMITS = {"summary": 50, "quiz": 50}

# theme colors anyone can pick in Settings > Appearance (the colors are in frontend/src/accent.ts);
# premium can also pick any "#rrggbb"
ACCENT_PRESETS = ("orange", "blue", "green", "purple", "teal", "rose")
# sources one summary or quiz can be made from
STUDY_MAX_SOURCES = 50
# the daily limits count what was started in the last this-long, rather than resetting at midnight
STUDY_LIMIT_WINDOW = timedelta(days=1)
# above this much source text the material is read in parts; Gemini 2.5 takes about 1M tokens,
# and Arabic needs more tokens per character than English
STUDY_MAX_PROMPT_CHARS = 600_000
# a document's chunks overlap by up to CHUNK_OVERLAP_CHARS; a recording's don't
STUDY_MAX_OVERLAP_CHARS = 250
QUIZ_OPTIONS_PER_QUESTION = 4
# a reply that's short of questions, or a translation that lost its shape, is asked for once more
STUDY_ATTEMPTS = 2
# how a note is named in a source list when it has no title
NOTE_NAME_CHARS = 80

# in the hot ranking a reply counts as half an upvote
HOT_REPLY_WEIGHT = 0.5
# post and reply text in the activity list and in notifications is cut to this many characters
ACTIVITY_PREVIEW_CHARS = 300
NOTIFICATION_PREVIEW_CHARS = 200
# the start of removed text kept in a removal notice, so the author knows which one it was
REMOVED_PREVIEW_CHARS = 200

# "Contact us" messages go to this inbox (Cloudflare Email Routing forwards it)
CONTACT_EMAIL = "support@ilna-academic.com"
# at most this many contact messages per user per hour
CONTACT_MESSAGES_PER_HOUR = 5
# at most this many reports per user per hour
REPORTS_PER_HOUR = 20

# new accounts confirm their email with a 6-digit code before they can log in
OTP_EXPIRE_MINUTES = 10
# wrong guesses allowed per code; after that a new one has to be sent
OTP_MAX_ATTEMPTS = 5
# seconds before another code can be sent to the same account
OTP_RESEND_COOLDOWN_SECONDS = 60

# the one admin logs in at /admin with a code sent to this address; set in .env
ADMIN_EMAIL = (os.getenv("ADMIN_EMAIL") or "").strip().lower()
# an admin login lasts this long, then a new code is needed
ADMIN_SESSION_MINUTES = 120
# admin codes use OTP_EXPIRE_MINUTES, OTP_MAX_ATTEMPTS and OTP_RESEND_COOLDOWN_SECONDS too
# the admin's own account; a hyphen, which the sign-up form doesn't allow, so no student can take this username
ADMIN_USERNAME = "ilna-admin"
# the longest a post can be pinned, in hours (matches MAX_PIN_HOURS in frontend/src/api/admin.ts)
MAX_PIN_HOURS = 168
# the admin's test accounts are named this plus their id (testuser12, ...)
TEST_USERNAME_PREFIX = "testuser"
# test accounts get a stand-in address under this domain; it's never shown and never emailed
TEST_EMAIL_DOMAIN = "test-accounts.ilna-academic.com"
# the longest the site can be closed in one go
MAINTENANCE_MAX_WINDOW = timedelta(days=30)
# the note shown on the maintenance page (matches frontend/src/pages/admin/AdminMaintenance.tsx)
MAINTENANCE_MESSAGE_MAX = 1000
# the maintenance state is read from the database at most this often
MAINTENANCE_CACHE_SECONDS = 5

# the mailbox that sends contact messages and codes; set these in .env, never in code. Port 465 uses SSL, anything else STARTTLS.
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT") or "587")
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USER
# give up on the mail server after this many seconds
SMTP_TIMEOUT_SECONDS = 15
