"""Transactional email: templates, the outbox and the delivery worker."""

import asyncio
import html
import logging
from contextlib import suppress
from datetime import timedelta
from email.message import EmailMessage
from urllib.parse import quote

import aiosmtplib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from vault_api.config import get_settings
from vault_api.db import SessionLocal, utcnow
from vault_api.models import EmailOutbox

log = logging.getLogger("vault.email")
MAX_ATTEMPTS = 8


def _render(
    title: str,
    paragraphs: list[str],
    action: tuple[str, str] | None = None,
    footer: str | None = None,
) -> tuple[str, str]:
    """Return (text, html) bodies. All dynamic values must already be plain text."""
    settings = get_settings()
    text_parts = [title, "", *paragraphs]
    if action:
        text_parts += ["", f"{action[0]}: {action[1]}"]
    if footer:
        text_parts += ["", footer]
    text_parts += ["", f"— {settings.app_name}"]

    esc = html.escape
    button = ""
    if action:
        button = (
            f'<p style="margin:28px 0"><a href="{esc(action[1], quote=True)}" '
            'style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:10px;'
            f'text-decoration:none;font-weight:600;display:inline-block">{esc(action[0])}</a></p>'
            f'<p style="color:#6b7280;font-size:13px">Or paste this link into your browser:<br>'
            f'<span style="word-break:break-all">{esc(action[1])}</span></p>'
        )
    body = "".join(f'<p style="margin:0 0 14px">{esc(p)}</p>' for p in paragraphs)
    foot = (
        f'<p style="color:#6b7280;font-size:13px;margin-top:24px">{esc(footer)}</p>'
        if footer
        else ""
    )
    html_body = (
        '<!doctype html><html><body style="margin:0;background:#f4f5f4;padding:32px 12px;'
        'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1f1e">'
        '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;'
        'padding:32px;border:1px solid #e5e7e6">'
        f'<div style="font-weight:700;font-size:15px;color:#0f766e;margin-bottom:20px">'
        f"&#128274; {esc(settings.app_name)}</div>"
        f'<h1 style="font-size:20px;margin:0 0 16px">{esc(title)}</h1>{body}{button}{foot}'
        "</div></body></html>"
    )
    return "\n".join(text_parts), html_body


def enqueue(
    db: AsyncSession,
    to: str,
    subject: str,
    title: str,
    paragraphs: list[str],
    action: tuple[str, str] | None = None,
    footer: str | None = None,
) -> None:
    text_body, html_body = _render(title, paragraphs, action, footer)
    db.add(EmailOutbox(to_address=to, subject=subject, text_body=text_body, html_body=html_body))


def link(path: str) -> str:
    return get_settings().app_url.rstrip("/") + path


# ---- Templates -------------------------------------------------------------------------------


def send_verification(db: AsyncSession, to: str, name: str, token: str) -> None:
    enqueue(
        db,
        to,
        "Verify your email address",
        f"Welcome, {name}",
        ["Confirm your email address to finish creating your account."],
        ("Verify email", link(f"/verify-email?token={token}")),
        "If you did not sign up, you can ignore this email.",
    )


def send_account_exists(db: AsyncSession, to: str) -> None:
    enqueue(
        db,
        to,
        "Sign-up attempt for your account",
        "You already have an account",
        [
            "Someone (hopefully you) tried to sign up with this email address, "
            "but an account already exists.",
            "If you forgot your password you can reset it below.",
        ],
        ("Reset password", link("/forgot-password")),
        "If this was not you, no action is needed. Your account is unchanged.",
    )


def send_password_reset(db: AsyncSession, to: str, token: str) -> None:
    minutes = get_settings().password_reset_ttl_minutes
    enqueue(
        db,
        to,
        "Reset your password",
        "Reset your login password",
        [
            f"Use the link below to choose a new login password. It expires in {minutes} "
            "minutes and can be used once.",
            "This changes your login password only. Your vault password is separate and "
            "cannot be reset by email.",
        ],
        ("Choose a new password", link(f"/reset-password?token={token}")),
        "If you did not request this, you can ignore this email.",
    )


def send_password_changed(db: AsyncSession, to: str) -> None:
    enqueue(
        db,
        to,
        "Your password was changed",
        "Your login password was changed",
        [
            "The login password for your account was just changed and your other sessions "
            "were signed out.",
            "If this was not you, reset your password immediately and review your active sessions.",
        ],
        ("Review security settings", link("/settings/security")),
    )


def send_new_sign_in(
    db: AsyncSession, to: str, when: str, ip: str | None, device: str | None
) -> None:
    enqueue(
        db,
        to,
        "New sign-in to your account",
        "New sign-in detected",
        [
            f"Your account was signed in to on {when}.",
            f"Device: {device or 'unknown'}",
            f"IP address: {ip or 'unknown'}",
            "If this was you, no action is needed. If not, change your password and sign "
            "out other sessions.",
        ],
        ("Review active sessions", link("/settings/security")),
    )


def send_invitation(
    db: AsyncSession, to: str, inviter: str, workspace: str, role: str, is_existing_user: bool
) -> None:
    days = get_settings().invitation_ttl_days
    if is_existing_user:
        action = ("Open invitation", link("/invitations"))
        extra = "Sign in to accept or decline."
    else:
        action = ("Create your account", link(f"/signup?email={quote(to)}"))
        extra = "Create an account with this email address and the invitation will be waiting."
    enqueue(
        db,
        to,
        f"{inviter} invited you to {workspace}",
        f"Join {workspace}",
        [f"{inviter} invited you to the {workspace} workspace as {role}.", extra],
        action,
        f"This invitation expires in {days} days.",
    )


# ---- Delivery worker -------------------------------------------------------------------------


async def _send(message: EmailOutbox) -> None:
    settings = get_settings()
    msg = EmailMessage()
    msg["From"] = settings.mail_from
    msg["To"] = message.to_address
    msg["Subject"] = message.subject
    msg.set_content(message.text_body)
    msg.add_alternative(message.html_body, subtype="html")
    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        password=settings.smtp_password.get_secret_value() if settings.smtp_password else None,
        start_tls=settings.smtp_starttls,
        use_tls=settings.smtp_tls,
        timeout=20,
    )


async def deliver_pending(batch: int = 20) -> int:
    """Send due emails. Safe to run on several instances at once (SKIP LOCKED)."""
    sent = 0
    async with SessionLocal() as db:
        rows = (
            (
                await db.execute(
                    select(EmailOutbox)
                    .where(EmailOutbox.status == "pending", EmailOutbox.next_attempt_at <= utcnow())
                    .order_by(EmailOutbox.created_at)
                    .limit(batch)
                    .with_for_update(skip_locked=True)
                )
            )
            .scalars()
            .all()
        )
        for message in rows:
            try:
                await _send(message)
            except (aiosmtplib.SMTPException, OSError, TimeoutError) as exc:
                message.attempts += 1
                message.last_error = type(exc).__name__
                if message.attempts >= MAX_ATTEMPTS:
                    message.status = "failed"
                    log.error("Email %s permanently failed", message.id)
                else:
                    backoff = timedelta(seconds=min(30 * 2**message.attempts, 3600))
                    message.next_attempt_at = utcnow() + backoff
            else:
                message.status = "sent"
                message.sent_at = utcnow()
                message.attempts += 1
                sent += 1
        await db.commit()
    return sent


async def run_worker(stop: asyncio.Event, interval: float = 2.0) -> None:
    while not stop.is_set():
        try:
            await deliver_pending()
        except Exception:
            log.exception("Email worker iteration failed")
        with suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=interval)


def send_vault_event(db: AsyncSession, to: str, event: str) -> None:
    """Security email for vault changes. Never includes key material."""
    subjects = {
        "password_changed": (
            "Your vault password was changed",
            "Vault password changed",
            "The password that unlocks your vault was just changed. Your keys "
            "and access are unchanged.",
        ),
        "recovered": (
            "Your vault was recovered",
            "Vault recovered with your recovery key",
            "Your recovery key was used to set a new vault password, and a new "
            "recovery key was issued. The old recovery key no longer works.",
        ),
        "reset": (
            "Your vault was reset",
            "Your vault was reset",
            "A new vault keypair was created for your account. Your previous keys were "
            "discarded. Teammates' browsers will re-share project keys with you "
            "automatically; projects where you were the only key holder can no longer "
            "be decrypted.",
        ),
    }
    subject, title, body = subjects[event]
    enqueue(
        db,
        to,
        subject,
        title,
        [
            body,
            "If this wasn't you, change your login password and sign out other sessions "
            "immediately.",
        ],
        ("Review security settings", link("/settings/security")),
    )
