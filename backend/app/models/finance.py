import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
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
    from app.models.identity import Branch, Organization
    from app.models.procurement import Vendor
    from app.models.project import Project


class ExpenseCategory(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "expense_categories"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, server_default="true", default=True, nullable=False, index=True
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    expenses: Mapped[list["Expense"]] = relationship(
        "Expense", back_populates="category"
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_expense_categories_org_code"),
        UniqueConstraint("organization_id", "id", name="uq_expense_categories_org_id"),
    )


class Expense(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "expenses"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    expense_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("expense_categories.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
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
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(
        String(10), server_default="USD", default="USD", nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(30), server_default="draft", default="draft", nullable=False, index=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    employee: Mapped["Employee"] = relationship(
        "Employee", foreign_keys=[employee_id]
    )
    category: Mapped["ExpenseCategory"] = relationship(
        "ExpenseCategory", foreign_keys=[category_id], back_populates="expenses"
    )
    project: Mapped["Project | None"] = relationship(
        "Project", foreign_keys=[project_id]
    )
    client: Mapped["Client | None"] = relationship(
        "Client", foreign_keys=[client_id]
    )
    branch: Mapped["Branch | None"] = relationship(
        "Branch", foreign_keys=[branch_id]
    )
    reviewer: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[reviewer_id]
    )

    items: Mapped[list["ExpenseItem"]] = relationship(
        "ExpenseItem",
        back_populates="expense",
        cascade="all, delete-orphan",
        foreign_keys="[ExpenseItem.expense_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "expense_number", name="uq_expenses_org_number"),
        UniqueConstraint("organization_id", "id", name="uq_expenses_org_id"),
        CheckConstraint("amount >= 0", name="ck_expenses_amount_non_negative"),
        CheckConstraint("tax_amount >= 0", name="ck_expenses_tax_non_negative"),
        CheckConstraint("total_amount >= 0", name="ck_expenses_total_non_negative"),
        CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'paid')",
            name="ck_expenses_status",
        ),
    )


class ExpenseItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "expense_items"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    expense_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        index=True,
        nullable=False,
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), server_default="1.00", default=Decimal("1.00"), nullable=False
    )
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    expense: Mapped["Expense"] = relationship(
        "Expense", foreign_keys=[expense_id], back_populates="items"
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_expense_items_org_id"),
        CheckConstraint("quantity > 0", name="ck_expense_items_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="ck_expense_items_unit_price_non_negative"),
        CheckConstraint("tax_amount >= 0", name="ck_expense_items_tax_non_negative"),
        CheckConstraint("line_total >= 0", name="ck_expense_items_line_total_non_negative"),
        ForeignKeyConstraint(
            ["organization_id", "expense_id"],
            ["expenses.organization_id", "expenses.id"],
            ondelete="CASCADE",
            name="fk_expense_items_expense_org",
        ),
    )


class FinancialTransaction(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "financial_transactions"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    transaction_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    transaction_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    reference_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    debit: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    credit: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    currency: Mapped[str] = mapped_column(
        String(10), server_default="USD", default="USD", nullable=False
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
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vendors.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(30), server_default="posted", default="posted", nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    project: Mapped["Project | None"] = relationship(
        "Project", foreign_keys=[project_id]
    )
    client: Mapped["Client | None"] = relationship(
        "Client", foreign_keys=[client_id]
    )
    vendor: Mapped["Vendor | None"] = relationship(
        "Vendor", foreign_keys=[vendor_id]
    )
    employee: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[employee_id]
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "transaction_number", name="uq_financial_transactions_org_number"),
        UniqueConstraint("organization_id", "id", name="uq_financial_transactions_org_id"),
        CheckConstraint("debit >= 0", name="ck_financial_transactions_debit_non_negative"),
        CheckConstraint("credit >= 0", name="ck_financial_transactions_credit_non_negative"),
        CheckConstraint(
            "(debit > 0 OR credit > 0) AND NOT (debit > 0 AND credit > 0)",
            name="ck_financial_transactions_debit_or_credit",
        ),
        CheckConstraint(
            "status IN ('pending', 'posted', 'void')",
            name="ck_financial_transactions_status",
        ),
    )
