from fastapi.security import OAuth2PasswordBearer
import os


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