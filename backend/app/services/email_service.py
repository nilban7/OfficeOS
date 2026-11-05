"""Reusable Gmail SMTP Email Service for OfficeOS.

Supports secure STARTTLS delivery, Jinja2 template rendering, MIME composition,
outbox queuing, asynchronous background processing, and bounded retry policies.
"""

from __future__ import annotations

import email.encoders
import email.utils
import logging
import os
import smtplib
import ssl
from datetime import UTC, datetime
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any
from uuid import UUID

import jinja2
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import session_factory
from app.models.email import EmailOutbox

logger = logging.getLogger("officeos.email")

# Jinja2 environment configured for secure, auto-escaped HTML email rendering
_TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", "emails")
_jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(_TEMPLATE_DIR),
    autoescape=jinja2.select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


class EmailService:
    """Manages Gmail SMTP delivery and reliable outbox queue processing."""

    @staticmethod
    def render_template(template_name: str, context: dict[str, Any] | None = None, **kwargs: Any) -> str:
        """Render a Jinja2 email template with provided context variables."""
        ctx = dict(context or {})
        ctx.update(kwargs)
        try:
            template = _jinja_env.get_template(template_name)
            return template.render(**ctx)
        except Exception as exc:
            logger.error("Failed to render email template '%s': %s", template_name, exc)
            raise

    @staticmethod
    def validate_configuration() -> tuple[bool, str | None]:
        """Validate SMTP environment settings without initiating network connection."""
        settings = get_settings()
        if not settings.email_enabled:
            return False, "Email service is disabled (EMAIL_ENABLED=false)"
        if not settings.smtp_host:
            return False, "SMTP_HOST is not configured"
        if not settings.smtp_username or not settings.smtp_username.strip():
            return False, "SMTP_USERNAME is not configured"
        if not settings.smtp_password or not settings.smtp_password.strip():
            return False, "SMTP_PASSWORD is not configured"
        return True, None

    @staticmethod
    def send_smtp_email(
        recipient_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
        recipient_name: str | None = None,
        attachments: list[dict[str, Any]] | None = None,
    ) -> tuple[bool, str | None]:
        """Establish STARTTLS connection to Gmail SMTP, authenticate, and send message.

        Returns (success: bool, error_message: str | None).
        Logs outcomes without exposing credentials or sensitive message content.
        """
        settings = get_settings()

        is_valid, validation_error = EmailService.validate_configuration()
        if not is_valid:
            logger.warning(
                "SMTP email dispatch skipped for recipient %s: %s",
                recipient_email,
                validation_error,
            )
            return False, validation_error

        # Build MIME multipart message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.sender_email
        msg["To"] = (
            f"{recipient_name} <{recipient_email}>"
            if recipient_name
            else recipient_email
        )
        msg["Date"] = email.utils.formatdate(localtime=True)
        msg["Message-ID"] = email.utils.make_msgid(domain="officeos.local")

        # Plain text fallback
        plain_body = text_content or "Please view this notification in an HTML-compatible email reader."
        part_text = MIMEText(plain_body, "plain", "utf-8")
        msg.attach(part_text)

        # HTML body
        part_html = MIMEText(html_content, "html", "utf-8")
        msg.attach(part_html)

        # Optional attachments
        if attachments:
            for att in attachments:
                filename = att.get("filename", "attachment")
                content = att.get("content")
                if content:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(content)
                    email.encoders.encode_base64(part)
                    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
                    msg.attach(part)

        # Establish SMTP connection with STARTTLS
        try:
            ssl_context = ssl.create_default_context()
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
                server.ehlo()
                server.starttls(context=ssl_context)
                server.ehlo()
                server.login(settings.smtp_username.strip(), settings.smtp_password.strip())
                server.send_message(msg)

            logger.info("Successfully sent SMTP email to %s (subject: '%s')", recipient_email, subject)
            return True, None

        except smtplib.SMTPAuthenticationError as exc:
            err_msg = f"Gmail SMTP authentication failed: {exc.smtp_code} {exc.smtp_error}"
            logger.error("SMTP Authentication Error: %s", err_msg)
            return False, err_msg

        except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected) as exc:
            err_msg = f"Gmail SMTP connection failed: {exc}"
            logger.error("SMTP Connection Error: %s", err_msg)
            return False, err_msg

        except smtplib.SMTPException as exc:
            err_msg = f"SMTP protocol error: {exc}"
            logger.error("SMTP Protocol Error: %s", err_msg)
            return False, err_msg

        except (TimeoutError, OSError) as exc:
            err_msg = f"Network timeout while connecting to SMTP host: {exc}"
            logger.error("SMTP Network Error: %s", err_msg)
            return False, err_msg

        except Exception as exc:
            err_msg = f"Unexpected error during email transmission: {type(exc).__name__}: {exc}"
            logger.exception("Unexpected error dispatching email to %s", recipient_email)
            return False, err_msg

    @staticmethod
    async def enqueue_email(
        session: AsyncSession,
        organization_id: UUID,
        recipient_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
        email_type: str = "general",
        related_entity_type: str | None = None,
        related_entity_id: UUID | None = None,
        recipient_name: str | None = None,
    ) -> EmailOutbox:
        """Enqueue an email record into the outbox within the existing database transaction.

        Guarantees that database operations succeed even if SMTP sending fails later.
        """
        now = datetime.now(UTC)
        outbox_entry = EmailOutbox(
            organization_id=organization_id,
            recipient_email=recipient_email.strip().lower(),
            recipient_name=recipient_name.strip() if recipient_name else None,
            subject=subject.strip(),
            body_html=html_content,
            body_text=text_content,
            email_type=email_type,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            status="PENDING",
            retry_count=0,
            max_retries=3,
            error_details=None,
            created_at=now,
            updated_at=now,
        )
        session.add(outbox_entry)
        await session.flush()
        logger.info(
            "Enqueued outbox email %s [type=%s] for %s",
            outbox_entry.id,
            email_type,
            recipient_email,
        )
        return outbox_entry

    @staticmethod
    async def process_outbox_item(outbox_id: UUID) -> bool:
        """Asynchronously process an outbox entry with idempotency and retry safeguards.

        Opens a short-lived independent database session to update outbox status.
        """
        async with session_factory() as session:
            try:
                outbox_entry = await session.scalar(
                    select(EmailOutbox).where(EmailOutbox.id == outbox_id)
                )
                if not outbox_entry:
                    logger.warning("Outbox item %s not found for processing", outbox_id)
                    return False

                # Prevent duplicate sends if already processed
                if outbox_entry.status == "SENT":
                    logger.info("Outbox item %s is already marked SENT. Skipping duplicate dispatch.", outbox_id)
                    return True

                # Check max retry limit
                if outbox_entry.retry_count >= outbox_entry.max_retries:
                    outbox_entry.status = "FAILED"
                    outbox_entry.updated_at = datetime.now(UTC)
                    await session.commit()
                    logger.error("Outbox item %s exceeded max retries (%d). Marked as FAILED.", outbox_id, outbox_entry.max_retries)
                    return False

                # Execute delivery
                success, error_msg = EmailService.send_smtp_email(
                    recipient_email=outbox_entry.recipient_email,
                    subject=outbox_entry.subject,
                    html_content=outbox_entry.body_html,
                    text_content=outbox_entry.body_text,
                    recipient_name=outbox_entry.recipient_name,
                )

                now = datetime.now(UTC)
                if success:
                    outbox_entry.status = "SENT"
                    outbox_entry.sent_at = now
                    outbox_entry.error_details = None
                    outbox_entry.updated_at = now
                    await session.commit()
                    logger.info("Outbox item %s successfully sent to %s", outbox_id, outbox_entry.recipient_email)
                    return True
                else:
                    outbox_entry.retry_count += 1
                    outbox_entry.error_details = error_msg
                    outbox_entry.updated_at = now
                    if outbox_entry.retry_count >= outbox_entry.max_retries:
                        outbox_entry.status = "FAILED"
                        logger.error("Outbox item %s permanently failed after %d retries: %s", outbox_id, outbox_entry.retry_count, error_msg)
                    else:
                        outbox_entry.status = "PENDING"
                        logger.warning("Outbox item %s attempt %d failed: %s. Remains PENDING for retry.", outbox_id, outbox_entry.retry_count, error_msg)
                    await session.commit()
                    return False

            except Exception:
                await session.rollback()
                logger.exception("Unexpected error processing outbox item %s", outbox_id)
                return False
