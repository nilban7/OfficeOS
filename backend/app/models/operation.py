import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.asset import Asset
    from app.models.client import Client
    from app.models.employee import Department, Employee
    from app.models.identity import Branch, Organization
    from app.models.project import Project


class OperationTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "operation_tasks"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    task_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    priority: Mapped[str] = mapped_column(
        String(30), server_default="medium", default="medium", nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(30), server_default="open", default="open", nullable=False, index=True
    )
    requester_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    requester: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[requester_id]
    )
    assigned_to: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[assigned_to_id]
    )
    department: Mapped["Department | None"] = relationship(
        "Department", foreign_keys=[department_id]
    )
    branch: Mapped["Branch | None"] = relationship(
        "Branch", foreign_keys=[branch_id]
    )
    project: Mapped["Project | None"] = relationship(
        "Project", foreign_keys=[project_id]
    )
    client: Mapped["Client | None"] = relationship(
        "Client", foreign_keys=[client_id]
    )
    asset: Mapped["Asset | None"] = relationship(
        "Asset", foreign_keys=[asset_id]
    )

    checklists: Mapped[list["OperationChecklist"]] = relationship(
        "OperationChecklist",
        back_populates="task",
        cascade="all, delete-orphan",
        foreign_keys="[OperationChecklist.task_id]",
    )
    assignees: Mapped[list["OperationTaskAssignee"]] = relationship(
        "OperationTaskAssignee",
        back_populates="task",
        cascade="all, delete-orphan",
        foreign_keys="[OperationTaskAssignee.task_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "task_number", name="uq_operation_tasks_org_number"),
        UniqueConstraint("organization_id", "id", name="uq_operation_tasks_org_id"),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')",
            name="ck_operation_tasks_priority",
        ),
        CheckConstraint(
            "status IN ('open', 'assigned', 'in_progress', 'blocked', 'completed', 'cancelled')",
            name="ck_operation_tasks_status",
        ),
    )


class OperationChecklist(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "operation_checklists"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    sequence_order: Mapped[int] = mapped_column(
        Integer, server_default="0", default=0, nullable=False
    )
    is_required: Mapped[bool] = mapped_column(
        Boolean, server_default="false", default=False, nullable=False
    )
    is_completed: Mapped[bool] = mapped_column(
        Boolean, server_default="false", default=False, nullable=False
    )
    completed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    task: Mapped["OperationTask"] = relationship(
        "OperationTask", foreign_keys=[task_id], back_populates="checklists"
    )
    completed_by: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[completed_by_id]
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_operation_checklists_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "task_id"],
            ["operation_tasks.organization_id", "operation_tasks.id"],
            ondelete="CASCADE",
            name="fk_operation_checklists_task_org",
        ),
    )


class OperationTaskAssignee(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "operation_task_assignees"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        index=True,
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role: Mapped[str] = mapped_column(
        String(100), server_default="assignee", default="assignee", nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    task: Mapped["OperationTask"] = relationship(
        "OperationTask", foreign_keys=[task_id], back_populates="assignees"
    )
    employee: Mapped["Employee"] = relationship(
        "Employee", foreign_keys=[employee_id]
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_operation_task_assignees_org_id"),
        UniqueConstraint(
            "organization_id", "task_id", "employee_id",
            name="uq_operation_task_assignee",
        ),
        ForeignKeyConstraint(
            ["organization_id", "task_id"],
            ["operation_tasks.organization_id", "operation_tasks.id"],
            ondelete="CASCADE",
            name="fk_operation_task_assignees_task_org",
        ),
    )
