from datetime import datetime

from pydantic import BaseModel


class AdminCodeRequest(BaseModel):
    email: str


class AdminCodeVerify(BaseModel):
    email: str
    code: str


class AdminToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


class AdminSession(BaseModel):
    email: str
