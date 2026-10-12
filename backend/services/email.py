import smtplib
import ssl
from email.message import EmailMessage

from backend import backendConfig
from backend.models.user import User

SMTP_TIMEOUT_SECONDS = 15


def smtp_configured() -> bool:
    return bool(backendConfig.SMTP_HOST and backendConfig.SMTP_USER and backendConfig.SMTP_PASSWORD)


def send_contact_email(user: User, subject: str, message: str) -> None:
    """Email a "Contact us" message to CONTACT_EMAIL. Replying goes straight to the user.
    Raises smtplib.SMTPException or OSError if it can't be sent."""
    email = EmailMessage()
    email["From"] = backendConfig.SMTP_FROM
    email["To"] = backendConfig.CONTACT_EMAIL
    email["Reply-To"] = user.email
    email["Subject"] = f"[Ilna] {subject}"
    email.set_content(
        f"{message}\n\n"
        "---\n"
        f"From: {user.first_name} {user.last_name} (@{user.username}, user #{user.id})\n"
        f"Email: {user.email}\n"
        f"University: {user.university} / {user.college} / {user.major}\n"
    )

    context = ssl.create_default_context()
    if backendConfig.SMTP_PORT == 465:
        server = smtplib.SMTP_SSL(backendConfig.SMTP_HOST, backendConfig.SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS, context=context)
    else:
        server = smtplib.SMTP(backendConfig.SMTP_HOST, backendConfig.SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS)

    with server:
        if backendConfig.SMTP_PORT != 465:
            server.starttls(context=context)
        server.login(backendConfig.SMTP_USER, backendConfig.SMTP_PASSWORD)
        server.send_message(email)
