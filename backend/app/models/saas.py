import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.identity import Profile


class PlatformConfiguration(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "platform_configurations"

    platform_name: Mapped[str] = mapped_column(String(100), default="OfficeOS", nullable=False)
    support_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    allowed_signup_domains: Mapped[list[str]] = mapped_column(
        JSONB, default=list, nullable=False, server_default="[]"
    )
    max_organizations: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)


class PlatformAnnouncement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "platform_announcements"
    __table_args__ = (
        CheckConstraint("severity IN ('info', 'warning', 'critical')", name="ck_announcements_severity"),
        CheckConstraint("target_type IN ('all', 'specific_orgs')", name="ck_announcements_target_type"),
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(30), default="info", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(30), default="all", nullable=False, index=True)
    target_org_ids: Mapped[list[str]] = mapped_column(
        JSONB, default=list, nullable=False, server_default="[]"
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by: Mapped[Profile | None] = relationship(foreign_keys=[created_by_id])
