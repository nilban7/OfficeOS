import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
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
    from app.models.client import Client
    from app.models.employee import Department, Employee
    from app.models.identity import Organization, Profile
    from app.models.project import Project


class TravelTrip(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "travel_trips"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    trip_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    business_purpose: Mapped[str] = mapped_column(Text, nullable=False)
    registration_type: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="planned", default="planned", index=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="draft", default="draft", index=True
    )
    settlement_status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="unsettled", default="unsettled", index=True
    )

    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    origin: Mapped[str] = mapped_column(String(255), nullable=False)
    destination: Mapped[str] = mapped_column(String(255), nullable=False)

    planned_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    planned_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    preferred_transport_mode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    actual_transport_mode: Mapped[str | None] = mapped_column(String(50), nullable=True)

    estimated_budget: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    currency: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="USD", default="USD"
    )

    # 5 Expense Categories (Estimated & Actual)
    est_travel_transport: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    act_travel_transport: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    est_hotel_accommodation: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    act_hotel_accommodation: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    est_food_meals: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    act_food_meals: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    est_local_transport: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    act_local_transport: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    est_other_expenses: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    act_other_expenses: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )

    estimated_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    actual_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    cost_difference: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )

    # Payer details (company, employee, split)
    payer_type: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="company", default="company"
    )
    company_paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    employee_paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )

    advance_requested: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    advance_approved: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    advance_paid: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    advance_status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="none", default="none"
    )
    advance_payment_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    advance_paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    accommodation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    missing_info_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    approver_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approver_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization: Mapped["Organization"] = relationship("Organization")
    requester: Mapped["Employee"] = relationship("Employee", foreign_keys=[requester_id])
    department: Mapped["Department | None"] = relationship("Department", foreign_keys=[department_id])
    client: Mapped["Client | None"] = relationship("Client", foreign_keys=[client_id])
    project: Mapped["Project | None"] = relationship("Project", foreign_keys=[project_id])
    approver: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[approver_id])
    created_by: Mapped["Profile | None"] = relationship("Profile", foreign_keys=[created_by_profile_id])

    members: Mapped[list["TravelMember"]] = relationship(
        "TravelMember", back_populates="trip", cascade="all, delete-orphan"
    )
    itineraries: Mapped[list["TravelItinerary"]] = relationship(
        "TravelItinerary", back_populates="trip", cascade="all, delete-orphan"
    )
    expenses: Mapped[list["TravelExpense"]] = relationship(
        "TravelExpense", back_populates="trip", cascade="all, delete-orphan"
    )
    payments: Mapped[list["TravelPayment"]] = relationship(
        "TravelPayment", back_populates="trip", cascade="all, delete-orphan"
    )
    settlements: Mapped[list["TravelSettlement"]] = relationship(
        "TravelSettlement", back_populates="trip", cascade="all, delete-orphan"
    )
    activity_logs: Mapped[list["TravelActivityLog"]] = relationship(
        "TravelActivityLog", back_populates="trip", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_travel_trips_org_id"),
        UniqueConstraint("organization_id", "trip_number", name="uq_travel_trips_org_trip_num"),
        CheckConstraint("registration_type IN ('planned', 'past')", name="ck_travel_trips_reg_type"),
        CheckConstraint(
            "status IN ('draft', 'pending_approval', 'approved', 'rejected', 'booked', 'ongoing', 'completed', 'cancelled')",
            name="ck_travel_trips_status",
        ),
        CheckConstraint(
            "settlement_status IN ('unsettled', 'pending', 'partially_settled', 'settled')",
            name="ck_travel_trips_settlement_status",
        ),
        CheckConstraint(
            "advance_status IN ('none', 'requested', 'approved', 'rejected', 'paid')",
            name="ck_travel_trips_advance_status",
        ),
    )


class TravelMember(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "travel_members"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("travel_trips.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    trip_role: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="participant", default="participant"
    )
    participation_status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="confirmed", default="confirmed"
    )
    individual_departure_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    individual_return_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship("Organization")
    trip: Mapped["TravelTrip"] = relationship("TravelTrip", back_populates="members")
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])

    __table_args__ = (
        UniqueConstraint("trip_id", "employee_id", name="uq_travel_members_trip_emp"),
        UniqueConstraint("organization_id", "id", name="uq_travel_members_org_id"),
    )


class TravelItinerary(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "travel_itineraries"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("travel_trips.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("travel_members.id", ondelete="SET NULL"),
        nullable=True,
    )
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="flight", default="flight"
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    departure_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    arrival_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    departure_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    arrival_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    booking_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    provider_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    booking_status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="confirmed", default="confirmed"
    )
    estimated_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    attachment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    organization: Mapped["Organization"] = relationship("Organization")
    trip: Mapped["TravelTrip"] = relationship("TravelTrip", back_populates="itineraries")
    member: Mapped["TravelMember | None"] = relationship("TravelMember", foreign_keys=[member_id])

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_travel_itineraries_org_id"),
    )


class TravelExpense(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "travel_expenses"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("travel_trips.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    category: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="miscellaneous", default="miscellaneous"
    )
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    currency: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="USD", default="USD"
    )
    receipt_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    receipt_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_method: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="employee_paid", default="employee_paid"
    )
    is_reimbursable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true", default=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="draft", default="draft", index=True
    )

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
    trip: Mapped["TravelTrip"] = relationship("TravelTrip", back_populates="expenses")
    employee: Mapped["Employee"] = relationship("Employee", foreign_keys=[employee_id])
    reviewer: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[reviewer_id])

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_travel_expenses_org_id"),
        CheckConstraint("amount >= 0", name="ck_travel_expenses_amount_non_negative"),
        CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'paid', 'cancelled')",
            name="ck_travel_expenses_status",
        ),
    )


class TravelSettlement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "travel_settlements"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("travel_trips.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    settlement_type: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="final_balance", default="final_balance"
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    currency: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="USD", default="USD"
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="completed", default="completed"
    )
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    settled_by_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship("Organization")
    trip: Mapped["TravelTrip"] = relationship("TravelTrip", back_populates="settlements")
    employee: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[employee_id])
    settled_by: Mapped["Profile | None"] = relationship("Profile", foreign_keys=[settled_by_profile_id])

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_travel_settlements_org_id"),
        CheckConstraint(
            "status IN ('pending', 'completed', 'cancelled')",
            name="ck_travel_settlements_status",
        ),
    )


class TravelActivityLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "travel_activity_logs"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("travel_trips.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default="{}", default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
        default=datetime.utcnow,
    )

    organization: Mapped["Organization"] = relationship("Organization")
    trip: Mapped["TravelTrip"] = relationship("TravelTrip", back_populates="activity_logs")
    actor: Mapped["Profile | None"] = relationship("Profile", foreign_keys=[actor_id])

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_travel_activity_logs_org_id"),
    )


class TravelPayment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "travel_payments"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("travel_trips.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    payer_type: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default="company", default="company"
    )
    payer_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, server_default="0.00", default=Decimal("0.00")
    )
    currency: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="USD", default="USD"
    )
    payment_method: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="corporate_card", default="corporate_card"
    )
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    transaction_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship("Organization")
    trip: Mapped["TravelTrip"] = relationship("TravelTrip", back_populates="payments")

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_travel_payments_org_id"),
    )

