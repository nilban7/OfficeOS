import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.client import Client
    from app.models.employee import Employee
    from app.models.identity import Organization


class Project(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), index=True, nullable=True
    )
    project_code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), server_default="planned", default="planned", nullable=False, index=True
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    project_manager_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), index=True, nullable=True
    )

    organization: Mapped["Organization"] = relationship("Organization", foreign_keys=[organization_id])
    client: Mapped["Client | None"] = relationship("Client", foreign_keys=[client_id])
    project_manager: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[project_manager_employee_id])
    members: Mapped[list["ProjectMember"]] = relationship(
        "ProjectMember",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="desc(ProjectMember.created_at)",
        foreign_keys="[ProjectMember.project_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "project_code", name="uq_projects_organization_code"),
        UniqueConstraint("organization_id", "id", name="uq_projects_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "client_id"],
            ["clients.organization_id", "clients.id"],
            ondelete="SET NULL",
            name="fk_projects_clients_org",
        ),
        CheckConstraint(
            "status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled')",
            name="ck_projects_status",
        ),
        CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
            name="ck_projects_dates",
        ),
        CheckConstraint(
            "budget IS NULL OR budget >= 0",
            name="ck_projects_budget",
        ),
    )


class ProjectMember(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "project_members"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    allocation_percentage: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), server_default="100.00", default=Decimal("100.00"), nullable=True
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    organization: Mapped["Organization"] = relationship("Organization", foreign_keys=[organization_id])
    project: Mapped["Project"] = relationship("Project", back_populates="members", foreign_keys=[project_id])
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])

    __table_args__ = (
        UniqueConstraint("project_id", "employee_id", name="uq_project_members_project_employee"),
        ForeignKeyConstraint(
            ["organization_id", "project_id"],
            ["projects.organization_id", "projects.id"],
            ondelete="CASCADE",
            name="fk_project_members_projects_org",
        ),
        CheckConstraint(
            "allocation_percentage IS NULL OR (allocation_percentage >= 0 AND allocation_percentage <= 100)",
            name="ck_project_members_allocation",
        ),
        CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
            name="ck_project_members_dates",
        ),
    )
