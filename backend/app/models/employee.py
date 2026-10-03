import uuid
from datetime import date

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.identity import Branch, Organization, OrganizationMembership, Profile


class Department(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "departments"
    __table_args__ = (UniqueConstraint("organization_id", "code", name="uq_departments_organization_code"),)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    code: Mapped[str] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(Text)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True)

    organization: Mapped[Organization] = relationship()
    manager: Mapped["Employee | None"] = relationship(foreign_keys=[manager_id], post_update=True)
    employees: Mapped[list["Employee"]] = relationship(
        "Employee", back_populates="department", foreign_keys="Employee.department_id"
    )


class Employee(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("organization_id", "employee_code", name="uq_employees_organization_code"),
        CheckConstraint("date_of_exit IS NULL OR date_of_exit >= date_of_joining", name="ck_employees_dates"),
        CheckConstraint(
            "employment_type IN ('full_time', 'part_time', 'contract', 'intern')",
            name="ck_employees_employment_type",
        ),
        CheckConstraint(
            "status IN ('active', 'probation', 'notice_period', 'on_leave', 'suspended', 'terminated')",
            name="ck_employees_status",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    employee_code: Mapped[str] = mapped_column(String(32))
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    designation: Mapped[str] = mapped_column(String(120))
    employment_type: Mapped[str] = mapped_column(String(32), default="full_time", server_default="full_time")
    status: Mapped[str] = mapped_column(String(32), default="active", server_default="active", index=True)

    date_of_joining: Mapped[date] = mapped_column(Date)
    date_of_exit: Mapped[date | None] = mapped_column(Date, nullable=True)

    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reporting_manager_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    membership_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization_memberships.id", ondelete="SET NULL"), nullable=True, index=True
    )

    work_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    personal_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    current_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    emergency_contact_relationship: Mapped[str | None] = mapped_column(String(50), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True)

    organization: Mapped[Organization] = relationship()
    department: Mapped[Department | None] = relationship(
        "Department", back_populates="employees", foreign_keys=[department_id]
    )
    branch: Mapped[Branch | None] = relationship()
    reporting_manager: Mapped["Employee | None"] = relationship(
        "Employee", remote_side="Employee.id", foreign_keys=[reporting_manager_id]
    )
    profile: Mapped[Profile | None] = relationship()
    membership: Mapped[OrganizationMembership | None] = relationship()
