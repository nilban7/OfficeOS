import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.identity import Organization, Profile


class Automation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "automations"
    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_automations_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "created_by_id"],
            ["organization_memberships.organization_id", "organization_memberships.profile_id"],
            ondelete="CASCADE",
            name="fk_automations_org_creator",
        ),
        CheckConstraint("trigger_type IN ('event', 'schedule', 'manual')", name="ck_automations_trigger_type"),
        CheckConstraint(
            "action_type IN ('notification', 'audit_log', 'task_create')", name="ck_automations_action_type"
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False, index=True)
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    trigger_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False, server_default="{}"
    )
    action_type: Mapped[str] = mapped_column(String(50), nullable=False)
    action_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False, server_default="{}"
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    organization: Mapped[Organization] = relationship()
    creator: Mapped[Profile] = relationship(foreign_keys=[created_by_id])
    executions: Mapped[list["AutomationExecution"]] = relationship(
        back_populates="automation",
        cascade="all, delete-orphan",
        order_by="AutomationExecution.created_at.desc()",
        foreign_keys="[AutomationExecution.automation_id]",
    )


class AutomationExecution(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "automation_executions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "automation_id"],
            ["automations.organization_id", "automations.id"],
            ondelete="CASCADE",
            name="fk_auto_exec_org_auto",
        ),
        CheckConstraint("status IN ('success', 'failed', 'skipped')", name="ck_auto_exec_status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    automation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    triggered_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    trigger_source: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    execution_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False, server_default="{}"
    )
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    automation: Mapped[Automation] = relationship(
        back_populates="executions", foreign_keys=[automation_id]
    )
    triggered_by: Mapped[Profile | None] = relationship(foreign_keys=[triggered_by_id])
