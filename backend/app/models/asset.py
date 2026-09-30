import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
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
    from app.models.employee import Employee
    from app.models.identity import Branch, Organization
    from app.models.procurement import PurchaseOrder, Vendor


class Asset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "assets"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    asset_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vendors.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    purchase_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    purchase_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str] = mapped_column(
        String(3), server_default="USD", default="USD", nullable=False
    )
    warranty_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    warranty_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    current_custodian_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(30), server_default="available", default="available", nullable=False, index=True
    )
    condition: Mapped[str] = mapped_column(
        String(30), server_default="good", default="good", nullable=False, index=True
    )
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    vendor: Mapped["Vendor | None"] = relationship("Vendor", foreign_keys=[vendor_id])
    purchase_order: Mapped["PurchaseOrder | None"] = relationship(
        "PurchaseOrder", foreign_keys=[purchase_order_id]
    )
    branch: Mapped["Branch | None"] = relationship("Branch", foreign_keys=[branch_id])
    current_custodian: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[current_custodian_id]
    )
    assignments: Mapped[list["AssetAssignment"]] = relationship(
        "AssetAssignment",
        back_populates="asset",
        cascade="all, delete-orphan",
        order_by="AssetAssignment.assigned_date.desc()",
        foreign_keys="[AssetAssignment.asset_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "asset_code", name="uq_assets_organization_code"),
        UniqueConstraint("organization_id", "id", name="uq_assets_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "vendor_id"],
            ["vendors.organization_id", "vendors.id"],
            ondelete="SET NULL",
            name="fk_assets_vendor_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "purchase_order_id"],
            ["purchase_orders.organization_id", "purchase_orders.id"],
            ondelete="SET NULL",
            name="fk_assets_po_org",
        ),
        CheckConstraint(
            "status IN ('available', 'assigned', 'under_maintenance', 'lost', 'retired', 'disposed')",
            name="ck_assets_status",
        ),
        CheckConstraint(
            "condition IN ('new', 'good', 'fair', 'poor', 'damaged')",
            name="ck_assets_condition",
        ),
        CheckConstraint(
            "purchase_cost IS NULL OR purchase_cost >= 0",
            name="ck_assets_purchase_cost",
        ),
        CheckConstraint(
            "warranty_end_date IS NULL OR warranty_start_date IS NULL OR warranty_end_date >= warranty_start_date",
            name="ck_assets_warranty_dates",
        ),
    )


class AssetAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "asset_assignments"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_date: Mapped[date] = mapped_column(Date, nullable=False)
    returned_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    assignment_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    return_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    returned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False, index=True
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    asset: Mapped["Asset"] = relationship(
        "Asset", back_populates="assignments", foreign_keys=[asset_id]
    )
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    branch: Mapped["Branch | None"] = relationship("Branch", foreign_keys=[branch_id])
    assigned_by: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[assigned_by_id]
    )
    returned_by: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[returned_by_id]
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_asset_assignments_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "asset_id"],
            ["assets.organization_id", "assets.id"],
            ondelete="CASCADE",
            name="fk_asset_assignments_asset_org",
        ),
        CheckConstraint(
            "returned_date IS NULL OR returned_date >= assigned_date",
            name="ck_asset_assignments_dates",
        ),
    )
