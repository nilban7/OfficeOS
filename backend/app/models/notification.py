import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.identity import Organization, Profile


class Notification(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_notifications_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "recipient_id"],
            ["organization_memberships.organization_id", "organization_memberships.profile_id"],
            ondelete="CASCADE",
            name="fk_notifications_org_recipient",
        ),
        CheckConstraint(
            "notification_type IN ('system', 'task', 'project', 'document', 'leave', 'attendance', 'finance', 'maintenance', 'training', 'general')",
            name="ck_notifications_type",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), index=True
    )
    notification_type: Mapped[str] = mapped_column(String(50), index=True)
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(
        "metadata", JSONB, nullable=True, server_default="{}"
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization: Mapped[Organization] = relationship()
    recipient: Mapped[Profile] = relationship(foreign_keys=[recipient_id])


class NotificationPreference(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_notification_preferences_org_id"),
        UniqueConstraint(
            "organization_id",
            "recipient_id",
            "notification_type",
            name="uq_notification_preferences_org_user_type",
        ),
        ForeignKeyConstraint(
            ["organization_id", "recipient_id"],
            ["organization_memberships.organization_id", "organization_memberships.profile_id"],
            ondelete="CASCADE",
            name="fk_notification_preferences_org_recipient",
        ),
        CheckConstraint(
            "notification_type IN ('system', 'task', 'project', 'document', 'leave', 'attendance', 'finance', 'maintenance', 'training', 'general')",
            name="ck_notification_preferences_type",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), index=True
    )
    notification_type: Mapped[str] = mapped_column(String(50))
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    organization: Mapped[Organization] = relationship()
    recipient: Mapped[Profile] = relationship(foreign_keys=[recipient_id])
