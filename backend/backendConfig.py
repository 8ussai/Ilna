from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
import os

load_dotenv()


SQLALCHEMY_DATABASE_URL = "sqlite:///./ilna.db"

SECRET_KEY = "DEVELOPMENT_TEST_KEY" 
ALGORITHM = "HS256"               
ACCESS_TOKEN_EXPIRE_MINUTES = 10080

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

UPLOAD_DIR = "uploads/courses"
os.makedirs(UPLOAD_DIR, exist_ok=True)

CHROMA_DB_DIR = "chroma_db"
os.makedirs(CHROMA_DB_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "ppt", "pptx"}

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
