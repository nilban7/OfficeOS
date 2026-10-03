import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
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
    from app.models.identity import Organization


class TrainingProgram(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "training_programs"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    provider: Mapped[str | None] = mapped_column(String(200), nullable=True)
    trainer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    delivery_mode: Mapped[str] = mapped_column(
        String(50), server_default="in_person", default="in_person", nullable=False
    )
    duration_hours: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    capacity: Mapped[int] = mapped_column(
        Integer, server_default="0", default=0, nullable=False
    )
    cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), server_default="draft", default="draft", nullable=False, index=True
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    sessions: Mapped[list["TrainingSession"]] = relationship(
        "TrainingSession",
        back_populates="training_program",
        cascade="all, delete-orphan",
        foreign_keys="[TrainingSession.training_program_id]",
    )
    enrollments: Mapped[list["TrainingEnrollment"]] = relationship(
        "TrainingEnrollment",
        back_populates="training_program",
        cascade="all, delete-orphan",
        foreign_keys="[TrainingEnrollment.training_program_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_training_programs_org_code"),
        UniqueConstraint("organization_id", "id", name="uq_training_programs_org_id"),
        CheckConstraint(
            "delivery_mode IN ('in_person', 'online', 'hybrid', 'self_paced')",
            name="ck_training_programs_delivery_mode",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'completed', 'cancelled')",
            name="ck_training_programs_status",
        ),
        CheckConstraint(
            "duration_hours >= 0",
            name="ck_training_programs_duration",
        ),
        CheckConstraint(
            "capacity >= 0",
            name="ck_training_programs_capacity",
        ),
        CheckConstraint(
            "cost >= 0",
            name="ck_training_programs_cost",
        ),
        CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
            name="ck_training_programs_dates",
        ),
    )


class TrainingSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "training_sessions"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    training_program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_programs.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    session_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    session_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[str | None] = mapped_column(String(20), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(20), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    trainer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    capacity: Mapped[int] = mapped_column(
        Integer, server_default="0", default=0, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), server_default="scheduled", default="scheduled", nullable=False, index=True
    )

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    training_program: Mapped["TrainingProgram"] = relationship(
        "TrainingProgram", foreign_keys=[training_program_id], back_populates="sessions"
    )
    enrollments: Mapped[list["TrainingEnrollment"]] = relationship(
        "TrainingEnrollment",
        back_populates="training_session",
        foreign_keys="[TrainingEnrollment.training_session_id]",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "session_number", name="uq_training_sessions_org_number"),
        UniqueConstraint("organization_id", "id", name="uq_training_sessions_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "training_program_id"],
            ["training_programs.organization_id", "training_programs.id"],
            ondelete="CASCADE",
            name="fk_training_sessions_program_org",
        ),
        CheckConstraint(
            "status IN ('scheduled', 'in_progress', 'completed', 'cancelled')",
            name="ck_training_sessions_status",
        ),
        CheckConstraint(
            "capacity >= 0",
            name="ck_training_sessions_capacity",
        ),
    )


class TrainingEnrollment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "training_enrollments"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    training_program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_programs.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    training_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_sessions.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    enrollment_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), server_default="enrolled", default="enrolled", nullable=False, index=True
    )
    completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    result: Mapped[str | None] = mapped_column(String(30), nullable=True)
    certificate_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship(
        "Organization", foreign_keys=[organization_id]
    )
    training_program: Mapped["TrainingProgram"] = relationship(
        "TrainingProgram", foreign_keys=[training_program_id], back_populates="enrollments"
    )
    training_session: Mapped["TrainingSession | None"] = relationship(
        "TrainingSession", foreign_keys=[training_session_id], back_populates="enrollments"
    )
    employee: Mapped["Employee"] = relationship(
        "Employee", foreign_keys=[employee_id]
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "id", name="uq_training_enrollments_org_id"),
        ForeignKeyConstraint(
            ["organization_id", "training_program_id"],
            ["training_programs.organization_id", "training_programs.id"],
            ondelete="CASCADE",
            name="fk_training_enrollments_program_org",
        ),
        ForeignKeyConstraint(
            ["organization_id", "training_session_id"],
            ["training_sessions.organization_id", "training_sessions.id"],
            ondelete="SET NULL",
            name="fk_training_enrollments_session_org",
        ),
        CheckConstraint(
            "status IN ('enrolled', 'attended', 'completed', 'cancelled', 'no_show')",
            name="ck_training_enrollments_status",
        ),
        CheckConstraint(
            "result IS NULL OR result IN ('passed', 'failed', 'attended')",
            name="ck_training_enrollments_result",
        ),
        CheckConstraint(
            "score IS NULL OR (score >= 0 AND score <= 100)",
            name="ck_training_enrollments_score",
        ),
    )
