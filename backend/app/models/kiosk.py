import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.identity import Branch, Organization, Profile


class KioskDevice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "kiosk_devices"
    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_kiosk_device_org_id"),
        UniqueConstraint("organization_id", "device_identifier", name="uq_kiosk_device_identifier"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True
    )

    device_name: Mapped[str] = mapped_column(String(150), nullable=False)
    device_identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    is_activated: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    device_token_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    exit_pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    allowed_ip_range: Mapped[str | None] = mapped_column(String(255), nullable=True)

    verification_modes: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=lambda: {"face_camera": True, "fingerprint": True, "pin": True, "qr_badge": True},
        server_default='{"face_camera": true, "fingerprint": true, "pin": true, "qr_badge": true}',
    )
    ip_tracking_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    last_known_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    battery_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    app_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True)

    organization: Mapped[Organization] = relationship()
    branch: Mapped[Branch | None] = relationship()


class KioskActivationCode(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "kiosk_activation_codes"
    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_kiosk_activation_codes_org_id"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True
    )

    code_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    code_preview: Mapped[str] = mapped_column(String(32), nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_by_device_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kiosk_devices.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, server_default="now()"
    )

    organization: Mapped[Organization] = relationship()
    branch: Mapped[Branch | None] = relationship()
    created_by: Mapped[Profile | None] = relationship(foreign_keys=[created_by_id])
    used_by_device: Mapped[KioskDevice | None] = relationship(foreign_keys=[used_by_device_id])


class EmployeeBiometric(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "employee_biometrics"
    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_employee_biometrics_org_id"),
        UniqueConstraint("organization_id", "employee_code", name="uq_employee_biometrics_code"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), index=True
    )
    employee_code: Mapped[str] = mapped_column(String(32), nullable=False)
    credential_id: Mapped[str] = mapped_column(String(500), nullable=False)
    raw_id_base64: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    finger_label: Mapped[str | None] = mapped_column(String(64), default="Biometric", server_default="Biometric")
    device_model: Mapped[str | None] = mapped_column(String(150), nullable=True)
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, server_default="now()"
    )

    organization: Mapped[Organization] = relationship()
    employee: Mapped["Employee"] = relationship("Employee")
