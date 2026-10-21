import smtplib
import ssl
from email.message import EmailMessage

from backend import config
from backend.accounts.models import User


# whether the mail server settings are filled in
def smtp_configured() -> bool:
    return bool(config.SMTP_HOST and config.SMTP_USER and config.SMTP_PASSWORD)


def send_contact_email(user: User, subject: str, message: str) -> None:
    """Email a "Contact us" message to CONTACT_EMAIL. Replying goes straight to the user.
    Raises smtplib.SMTPException or OSError if it can't be sent."""
    email = EmailMessage()
    email["From"] = config.SMTP_FROM
    email["To"] = config.CONTACT_EMAIL
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
    minutes = config.OTP_EXPIRE_MINUTES
    email = EmailMessage()
    email["From"] = config.SMTP_FROM
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


def send_password_reset_email(user: User, code: str) -> None:
    """Email the 6-digit "Forgot password?" code, in English and Arabic.
    Raises smtplib.SMTPException or OSError if it can't be sent."""
    minutes = config.OTP_EXPIRE_MINUTES
    email = EmailMessage()
    email["From"] = config.SMTP_FROM
    email["To"] = user.email
    email["Subject"] = f"Your Ilna password reset code: {code}"
    email.set_content(
        f"Hi {user.first_name},\n\n"
        f"Your code to reset your Ilna password is: {code}\n"
        f"It expires in {minutes} minutes.\n\n"
        f"رمز إعادة تعيين كلمة المرور الخاصة بك في Ilna هو: {code}\n"
        f"ينتهي خلال {minutes} دقائق.\n\n"
        "If you didn't ask for this, you can ignore this email. Your password hasn't changed.\n"
        "إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة. لم تتغير كلمة المرور الخاصة بك.\n"
    )
    _send(email)


def send_password_changed_email(user: User) -> None:
    """Tell a student their password was changed, in English and Arabic.
    Raises smtplib.SMTPException or OSError if it can't be sent."""
    support = config.CONTACT_EMAIL
    email = EmailMessage()
    email["From"] = config.SMTP_FROM
    email["To"] = user.email
    email["Reply-To"] = support
    email["Subject"] = "Your Ilna password was changed"
    email.set_content(
        f"Hi {user.first_name},\n\n"
        "Your Ilna password was just changed, and every device was logged out.\n"
        f"If this wasn't you, reset your password from the login page right away and write to {support}.\n\n"
        f"مرحباً {user.first_name}،\n\n"
        "تم تغيير كلمة المرور الخاصة بك في Ilna للتو، وتم تسجيل الخروج من جميع الأجهزة.\n"
        f"إذا لم تكن أنت، أعد تعيين كلمة المرور من صفحة تسجيل الدخول فوراً وراسلنا على {support}.\n"
    )
    _send(email)


def send_admin_code_email(code: str) -> None:
    """Email an admin login code to ADMIN_EMAIL.
    Raises smtplib.SMTPException or OSError if it can't be sent."""
    email = EmailMessage()
    email["From"] = config.SMTP_FROM
    email["To"] = config.ADMIN_EMAIL
    email["Subject"] = f"Ilna admin code: {code}"
    email.set_content(
        f"Your Ilna admin login code is: {code}\n"
        f"It expires in {config.OTP_EXPIRE_MINUTES} minutes.\n\n"
        "If you didn't ask for this, someone typed the admin email at /admin. "
        "They can't get in without this code.\n"
    )
    _send(email)


def send_suspended_email(user: User, reason: str) -> None:
    """Tell a student their account was banned, in English and Arabic.
    Raises smtplib.SMTPException or OSError if it can't be sent."""
    support = config.CONTACT_EMAIL
    email = EmailMessage()
    email["From"] = config.SMTP_FROM
    email["To"] = user.email
    email["Reply-To"] = support
    email["Subject"] = "Your Ilna account has been suspended"
    email.set_content(
        f"Hi {user.first_name},\n\n"
        "Your Ilna account has been suspended, and you've been logged out.\n"
        f"Reason: {reason}\n\n"
        f"If you think this is a mistake, reply to this email or write to {support}.\n\n"
        f"مرحباً {user.first_name}،\n\n"
        "تم إيقاف حسابك في Ilna وتسجيل خروجك.\n"
        f"السبب: {reason}\n\n"
        f"إذا كنت تعتقد أن هذا خطأ، يمكنك الرد على هذه الرسالة أو مراسلتنا على {support}.\n"
    )
    _send(email)


def send_restored_email(user: User) -> None:
    """Tell a student their ban was lifted, in English and Arabic.
    Raises smtplib.SMTPException or OSError if it can't be sent."""
    email = EmailMessage()
    email["From"] = config.SMTP_FROM
    email["To"] = user.email
    email["Reply-To"] = config.CONTACT_EMAIL
    email["Subject"] = "Your Ilna account has been restored"
    email.set_content(
        f"Hi {user.first_name},\n\n"
        "Your Ilna account has been restored. You can log in again.\n\n"
        f"مرحباً {user.first_name}،\n\n"
        "تمت إعادة تفعيل حسابك في Ilna. يمكنك تسجيل الدخول من جديد.\n"
    )
    _send(email)


# sends one email over SSL (port 465) or STARTTLS
def _send(email: EmailMessage) -> None:
    context = ssl.create_default_context()
    if config.SMTP_PORT == 465:
        server = smtplib.SMTP_SSL(
            config.SMTP_HOST, config.SMTP_PORT, timeout=config.SMTP_TIMEOUT_SECONDS, context=context
        )
    else:
        server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=config.SMTP_TIMEOUT_SECONDS)

    with server:
        if config.SMTP_PORT != 465:
            server.starttls(context=context)
        server.login(config.SMTP_USER, config.SMTP_PASSWORD)
        server.send_message(email)
