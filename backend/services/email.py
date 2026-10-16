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
    _send(email)


def send_otp_email(user: User, code: str) -> None:
    """Email the 6-digit sign-up code, in English and Arabic.
    Raises smtplib.SMTPException or OSError if it can't be sent."""
    minutes = backendConfig.OTP_EXPIRE_MINUTES
    email = EmailMessage()
    email["From"] = backendConfig.SMTP_FROM
    email["To"] = user.email
    email["Subject"] = f"Your Ilna code: {code}"
    email.set_content(
        f"Hi {user.first_name},\n\n"
        f"Your Ilna verification code is: {code}\n"
        f"It expires in {minutes} minutes.\n\n"
        f"رمز التحقق الخاص بك في Ilna هو: {code}\n"
        f"ينتهي خلال {minutes} دقائق.\n\n"
        "If you didn't create an Ilna account, you can ignore this email.\n"
        "إذا لم تنشئ حسابًا في Ilna، يمكنك تجاهل هذه الرسالة.\n"
    )
    _send(email)


def send_admin_code_email(code: str) -> None:
    """Email an admin login code to ADMIN_EMAIL.
    Raises smtplib.SMTPException or OSError if it can't be sent."""
    email = EmailMessage()
    email["From"] = backendConfig.SMTP_FROM
    email["To"] = backendConfig.ADMIN_EMAIL
    email["Subject"] = f"Ilna admin code: {code}"
    email.set_content(
        f"Your Ilna admin login code is: {code}\n"
        f"It expires in {backendConfig.OTP_EXPIRE_MINUTES} minutes.\n\n"
        "If you didn't ask for this, someone typed the admin email at /admin. "
        "They can't get in without this code.\n"
    )
    _send(email)


def _send(email: EmailMessage) -> None:
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
