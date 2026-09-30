import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

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
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.employee import Employee
    from app.models.identity import Organization


class Internship(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "internships"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    supervisor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    intern_name: Mapped[str] = mapped_column(String(200), nullable=False)
    intern_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    institution: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), server_default="planned", default="planned", nullable=False, index=True
    )
    stipend: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    employee: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[employee_id]
    )
    supervisor: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[supervisor_id]
    )
    supervisors: Mapped[list["InternshipSupervisor"]] = relationship(
        "InternshipSupervisor",
        back_populates="internship",
        cascade="all, delete-orphan",
        foreign_keys="[InternshipSupervisor.internship_id]",
    )
    reviews: Mapped[list["InternshipReview"]] = relationship(
        "InternshipReview",
        back_populates="internship",
        cascade="all, delete-orphan",
        foreign_keys="[InternshipReview.internship_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_internships_org_code"),
        UniqueConstraint("organization_id", "id", name="uq_internships_org_id"),
        CheckConstraint(
            "status IN ('planned', 'active', 'completed', 'extended', 'terminated', 'cancelled')",
            name="ck_internships_status",
        ),
        CheckConstraint("end_date >= start_date", name="ck_internships_dates"),
    )


class InternshipSupervisor(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "internship_supervisors"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    internship_id: Mapped[uuid.UUID] = mapped_column(
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
        String(100), server_default="supervisor", default="supervisor", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    internship: Mapped["Internship"] = relationship(
        "Internship", foreign_keys=[internship_id], back_populates="supervisors"
    )
    employee: Mapped["Employee"] = relationship(
        "Employee", foreign_keys=[employee_id]
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_internship_supervisors_org_id"),
        UniqueConstraint(
            "organization_id", "internship_id", "employee_id", name="uq_internship_supervisor"
        ),
        ForeignKeyConstraint(
            ["organization_id", "internship_id"],
            ["internships.organization_id", "internships.id"],
            ondelete="CASCADE",
            name="fk_internship_supervisors_internship_org",
        ),
    )


class InternshipReview(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "internship_reviews"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    internship_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        index=True,
        nullable=False,
    )
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    review_date: Mapped[date] = mapped_column(Date, nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), server_default="draft", default="draft", nullable=False, index=True
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    internship: Mapped["Internship"] = relationship(
        "Internship", foreign_keys=[internship_id], back_populates="reviews"
    )
    reviewer: Mapped["Employee | None"] = relationship(
        "Employee", foreign_keys=[reviewer_id]
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_internship_reviews_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "internship_id"],
            ["internships.organization_id", "internships.id"],
            ondelete="CASCADE",
            name="fk_internship_reviews_internship_org",
        ),
        CheckConstraint(
            "rating IS NULL OR (rating >= 1 AND rating <= 5)",
            name="ck_internship_reviews_rating",
        ),
        CheckConstraint(
            "status IN ('draft', 'submitted', 'acknowledged')",
            name="ck_internship_reviews_status",
        ),
    )
