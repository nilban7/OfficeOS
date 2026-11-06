import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.identity import Organization


class EmailOutbox(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Stores outgoing email notifications for asynchronous, reliable delivery and audit trail."""

    __tablename__ = "email_outbox"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    recipient_email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    recipient_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    email_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    related_entity_type: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    related_entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), default="PENDING", server_default="PENDING", index=True, nullable=False
    )
    retry_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, server_default="3", nullable=False)
    error_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization: Mapped["Organization"] = relationship("Organization")
