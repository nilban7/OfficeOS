import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.employee import Employee


class SalaryStructure(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "salary_structures"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    base_salary: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00")
    )
    hra: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    allowances: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    deductions: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    payment_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="monthly")
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    employee: Mapped["Employee"] = relationship("Employee", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_salary_structures_org_id"),
        UniqueConstraint(
            "organization_id", "employee_id", name="uq_salary_structures_org_employee"
        ),
        CheckConstraint("base_salary >= 0", name="ck_salary_structures_base_salary"),
        CheckConstraint("hra >= 0", name="ck_salary_structures_hra"),
        CheckConstraint(
            "payment_frequency IN ('monthly', 'biweekly', 'weekly', 'annual')",
            name="ck_salary_structures_frequency",
        ),
    )


class Payroll(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payrolls"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    total_gross_pay: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00")
    )
    total_deductions: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00")
    )
    total_net_pay: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00")
    )
    employee_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    payslips: Mapped[list["Payslip"]] = relationship(
        "Payslip",
        back_populates="payroll",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_payrolls_org_id"),
        UniqueConstraint(
            "organization_id", "period_year", "period_month", name="uq_payrolls_org_period"
        ),
        CheckConstraint(
            "status IN ('draft', 'processing', 'approved', 'paid', 'cancelled')",
            name="ck_payrolls_status",
        ),
        CheckConstraint("period_month BETWEEN 1 AND 12", name="ck_payrolls_period_month"),
        CheckConstraint("period_year >= 2020", name="ck_payrolls_period_year"),
    )


class Payslip(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payslips"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    payroll_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    payslip_number: Mapped[str] = mapped_column(String(50), nullable=False)
    base_salary: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00")
    )
    gross_pay: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00")
    )
    total_deductions: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00")
    )
    net_pay: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00")
    )
    paid_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    unpaid_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    earnings_breakdown: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    deductions_breakdown: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False, default="bank_transfer")
    payment_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    disbursement_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    payroll: Mapped["Payroll"] = relationship("Payroll", back_populates="payslips")
    employee: Mapped["Employee"] = relationship("Employee", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_payslips_org_id"),
        UniqueConstraint("organization_id", "payslip_number", name="uq_payslips_org_num"),
        UniqueConstraint(
            "organization_id", "payroll_id", "employee_id", name="uq_payslips_payroll_employee"
        ),
        ForeignKeyConstraint(
            ["organization_id", "payroll_id"],
            ["payrolls.organization_id", "payrolls.id"],
            ondelete="CASCADE",
            name="fk_payslips_payroll_org",
        ),
        CheckConstraint(
            "status IN ('draft', 'pending', 'paid', 'cancelled')", name="ck_payslips_status"
        ),
        CheckConstraint("net_pay >= 0", name="ck_payslips_net_pay"),
    )
