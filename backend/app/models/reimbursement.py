import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
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
    from app.models.identity import Organization


class ReimbursementClaim(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reimbursement_claims"

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
    claim_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="other", default="other", index=True
    )
    claim_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="USD", default="USD"
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="draft", default="draft", index=True
    )
    receipt_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    items: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default="[]", default=list
    )

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)

    organization: Mapped["Organization"] = relationship("Organization")
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    reviewer: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[reviewer_id])

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_reimbursement_claims_org_id"),
        UniqueConstraint("organization_id", "claim_number", name="uq_reimbursement_claims_org_num"),
        CheckConstraint("amount >= 0", name="ck_reimbursement_claims_amount_non_negative"),
        CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'paid', 'cancelled')",
            name="ck_reimbursement_claims_status",
        ),
    )
