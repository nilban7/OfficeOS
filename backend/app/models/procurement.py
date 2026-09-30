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
    from app.models.employee import Department, Employee
    from app.models.identity import Organization


class Vendor(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vendors"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    vendor_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    contact_person: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False, index=True
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(
        "PurchaseOrder",
        back_populates="vendor",
        foreign_keys="[PurchaseOrder.vendor_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "vendor_code", name="uq_vendors_organization_code"),
        UniqueConstraint("organization_id", "id", name="uq_vendors_org_id"),
    )


class PurchaseRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "purchase_requests"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    request_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    required_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[str] = mapped_column(
        String(20), server_default="medium", default="medium", nullable=False, index=True
    )
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    estimated_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    currency: Mapped[str] = mapped_column(
        String(3), server_default="USD", default="USD", nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), server_default="draft", default="draft", nullable=False, index=True
    )
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    requester: Mapped["Employee"] = relationship("Employee", foreign_keys=[requester_id])
    department: Mapped["Department | None"] = relationship(
        "Department", foreign_keys=[department_id]
    )
    reviewer: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[reviewer_id])
    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(
        "PurchaseOrder",
        back_populates="purchase_request",
        foreign_keys="[PurchaseOrder.purchase_request_id]",
    )

    __table_args__ = (
        UniqueConstraint(
            "organization_id", "request_number", name="uq_purchase_requests_org_number"
        ),
        UniqueConstraint("organization_id", "id", name="uq_purchase_requests_org_id"),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')",
            name="ck_purchase_requests_priority",
        ),
        CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')",
            name="ck_purchase_requests_status",
        ),
        CheckConstraint(
            "estimated_amount >= 0",
            name="ck_purchase_requests_amount",
        ),
    )


class PurchaseOrder(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "purchase_orders"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    po_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    vendor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vendors.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    purchase_request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("purchase_requests.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), server_default="draft", default="draft", nullable=False, index=True
    )
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    currency: Mapped[str] = mapped_column(
        String(3), server_default="USD", default="USD", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    vendor: Mapped["Vendor"] = relationship("Vendor", foreign_keys=[vendor_id])
    purchase_request: Mapped["PurchaseRequest | None"] = relationship(
        "PurchaseRequest", foreign_keys=[purchase_request_id]
    )
    created_by: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[created_by_id])
    items: Mapped[list["PurchaseOrderItem"]] = relationship(
        "PurchaseOrderItem",
        back_populates="purchase_order",
        cascade="all, delete-orphan",
        order_by="PurchaseOrderItem.created_at",
        foreign_keys="[PurchaseOrderItem.purchase_order_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "po_number", name="uq_purchase_orders_org_number"),
        UniqueConstraint("organization_id", "id", name="uq_purchase_orders_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "vendor_id"],
            ["vendors.organization_id", "vendors.id"],
            ondelete="RESTRICT",
            name="fk_po_org_vendor",
        ),
        ForeignKeyConstraint(
            ["organization_id", "purchase_request_id"],
            ["purchase_requests.organization_id", "purchase_requests.id"],
            ondelete="SET NULL",
            name="fk_po_org_pr",
        ),
        CheckConstraint(
            "status IN ('draft', 'issued', 'partially_received', 'received', 'cancelled', 'closed')",
            name="ck_purchase_orders_status",
        ),
        CheckConstraint("subtotal >= 0", name="ck_purchase_orders_subtotal"),
        CheckConstraint("tax_amount >= 0", name="ck_purchase_orders_tax"),
        CheckConstraint("total_amount >= 0", name="ck_purchase_orders_total"),
        CheckConstraint(
            "expected_delivery_date IS NULL OR expected_delivery_date >= order_date",
            name="ck_purchase_orders_dates",
        ),
    )


class PurchaseOrderItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "purchase_order_items"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit: Mapped[str] = mapped_column(
        String(20), server_default="pcs", default="pcs", nullable=False
    )
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    purchase_order: Mapped["PurchaseOrder"] = relationship(
        "PurchaseOrder", foreign_keys=[purchase_order_id]
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_purchase_order_items_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "purchase_order_id"],
            ["purchase_orders.organization_id", "purchase_orders.id"],
            ondelete="CASCADE",
            name="fk_po_items_org_po",
        ),
        CheckConstraint("quantity > 0", name="ck_po_items_quantity"),
        CheckConstraint("unit_price >= 0", name="ck_po_items_unit_price"),
        CheckConstraint("tax_rate >= 0", name="ck_po_items_tax_rate"),
        CheckConstraint("tax_amount >= 0", name="ck_po_items_tax_amount"),
        CheckConstraint("line_total >= 0", name="ck_po_items_line_total"),
    )
