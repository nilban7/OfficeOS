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
    from app.models.asset import Asset
    from app.models.employee import Employee
    from app.models.identity import Branch, Organization
    from app.models.procurement import Vendor


class MaintenanceRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "maintenance_requests"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    request_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    issue_title: Mapped[str] = mapped_column(String(200), nullable=False)
    issue_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(
        String(20), server_default="medium", default="medium", nullable=False, index=True
    )
    requested_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), server_default="submitted", default="submitted", nullable=False, index=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    asset: Mapped["Asset"] = relationship(
        "Asset", foreign_keys=[asset_id]
    )
    requester: Mapped["Employee"] = relationship(
        "Employee", foreign_keys=[requester_id]
    )
    branch: Mapped["Branch | None"] = relationship(
        "Branch", foreign_keys=[branch_id]
    )
    maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(
        "MaintenanceRecord",
        back_populates="maintenance_request",
        foreign_keys="[MaintenanceRecord.maintenance_request_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "request_number", name="uq_maintenance_requests_org_number"),
        UniqueConstraint("organization_id", "id", name="uq_maintenance_requests_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "asset_id"],
            ["assets.organization_id", "assets.id"],
            ondelete="CASCADE",
            name="fk_maintenance_requests_asset_org",
        ),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')",
            name="ck_maintenance_requests_priority",
        ),
        CheckConstraint(
            "status IN ('submitted', 'approved', 'rejected', 'scheduled', 'in_progress', 'completed', 'cancelled')",
            name="ck_maintenance_requests_status",
        ),
    )


class MaintenanceRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "maintenance_records"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    record_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    maintenance_request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("maintenance_requests.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    technician_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vendors.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    maintenance_type: Mapped[str] = mapped_column(
        String(50), server_default="corrective", default="corrective", nullable=False, index=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), server_default="scheduled", default="scheduled", nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parts_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    labor_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    parts_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    other_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    asset: Mapped["Asset"] = relationship(
        "Asset", foreign_keys=[asset_id]
    )
    maintenance_request: Mapped["MaintenanceRequest | None"] = relationship(
        "MaintenanceRequest", back_populates="maintenance_records", foreign_keys=[maintenance_request_id]
    )
    technician: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[technician_id]
    )
    vendor: Mapped["Vendor | None"] = relationship(
        "Vendor", foreign_keys=[vendor_id]
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "record_number", name="uq_maintenance_records_org_number"),
        UniqueConstraint("organization_id", "id", name="uq_maintenance_records_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "asset_id"],
            ["assets.organization_id", "assets.id"],
            ondelete="CASCADE",
            name="fk_maintenance_records_asset_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "maintenance_request_id"],
            ["maintenance_requests.organization_id", "maintenance_requests.id"],
            ondelete="SET NULL",
            name="fk_maintenance_records_request_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "vendor_id"],
            ["vendors.organization_id", "vendors.id"],
            ondelete="SET NULL",
            name="fk_maintenance_records_vendor_org",
        ),
        CheckConstraint(
            "maintenance_type IN ('corrective', 'preventive', 'inspection', 'upgrade')",
            name="ck_maintenance_records_type",
        ),
        CheckConstraint(
            "status IN ('scheduled', 'in_progress', 'completed', 'cancelled')",
            name="ck_maintenance_records_status",
        ),
        CheckConstraint(
            "labor_cost >= 0",
            name="ck_maintenance_records_labor_cost",
        ),
        CheckConstraint(
            "parts_cost >= 0",
            name="ck_maintenance_records_parts_cost",
        ),
        CheckConstraint(
            "other_cost >= 0",
            name="ck_maintenance_records_other_cost",
        ),
        CheckConstraint(
            "total_cost >= 0",
            name="ck_maintenance_records_total_cost",
        ),
        CheckConstraint(
            "completion_date IS NULL OR completion_date >= start_date",
            name="ck_maintenance_records_dates",
        ),
    )
