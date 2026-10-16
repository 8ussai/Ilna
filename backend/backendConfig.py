from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
import os

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

# total size of all files one user can upload
STORAGE_LIMIT_BYTES = 1024 ** 3
# premium (turned on from the admin panel) gets more room
PREMIUM_STORAGE_LIMIT_BYTES = 5 * 1024 ** 3

# summaries and quizzes are written by Gemini; GOOGLE_API_KEY goes in .env
GEMINI_MODEL = "gemini-2.5-flash"
# summaries and quizzes one user can start in any 24 hours, by kind (retries of failed ones don't count)
STUDY_DAILY_LIMITS = {"summary": 2, "quiz": 2}
# premium is shown as unlimited; this hidden cap only guards the Gemini quota
PREMIUM_STUDY_DAILY_LIMITS = {"summary": 50, "quiz": 50}
# sources one summary or quiz can be made from
STUDY_MAX_SOURCES = 50

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

# the mailbox that sends contact messages and codes; set these in .env, never in code. Port 465 uses SSL, anything else STARTTLS.
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT") or "587")
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USER
