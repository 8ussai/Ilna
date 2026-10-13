from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
import os

load_dotenv()

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# the AI models (~3 GB) live in the project's models/ folder instead of the user's home cache;
# Hugging Face reads this when its libraries are first imported, so anything that loads a model imports this file first
os.environ.setdefault("HF_HOME", os.path.join(PROJECT_ROOT, "models"))


SQLALCHEMY_DATABASE_URL = "sqlite:///./ilna.db"

SECRET_KEY = "DEVELOPMENT_TEST_KEY" 
ALGORITHM = "HS256"               
ACCESS_TOKEN_EXPIRE_MINUTES = 10080

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

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
STORAGE_LIMIT_BYTES = 5 * 1024 ** 3

# "Contact us" messages go to this inbox
CONTACT_EMAIL = "mr.qussai2004@gmail.com"
# at most this many contact messages per user per hour
CONTACT_MESSAGES_PER_HOUR = 5

# the mailbox that sends them; set these in .env, never in code. Port 465 uses SSL, anything else STARTTLS.
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT") or "587")
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USER
