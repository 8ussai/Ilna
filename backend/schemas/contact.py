from pydantic import BaseModel, field_validator


class ContactCreate(BaseModel):
    subject: str
    message: str

    @field_validator("subject")
    @classmethod
    def check_subject(cls, value: str) -> str:
        # a subject is one line (it becomes an email header)
        value = " ".join(value.split())
        if not value:
            raise ValueError("Subject can't be empty.")
        if len(value) > 150:
            raise ValueError("Subject is too long (max 150 characters).")
        return value

    @field_validator("message")
    @classmethod
    def check_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message can't be empty.")
        if len(value) > 5000:
            raise ValueError("Message is too long (max 5000 characters).")
        return value
