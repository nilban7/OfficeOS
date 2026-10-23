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
    from app.models.client import Client
    from app.models.employee import Employee
    from app.models.identity import Organization
    from app.models.project import Project


class ClientEngagement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "client_engagements"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True, nullable=True
    )
    engagement_code: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    current_stage: Mapped[str] = mapped_column(
        String(40), server_default="proposal", default="proposal", nullable=False, index=True
    )
    delivery_health: Mapped[str] = mapped_column(
        String(20), server_default="on_track", default="on_track", nullable=False, index=True
    )
    progress_percentage: Mapped[int] = mapped_column(Integer, server_default="0", default=0, nullable=False)
    
    contract_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    invoiced_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False)
    collected_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), server_default="INR", default="INR", nullable=False)

    target_completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    engagement_lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), index=True, nullable=True
    )

    organization: Mapped["Organization"] = relationship("Organization", foreign_keys=[organization_id])
    client: Mapped["Client"] = relationship("Client", foreign_keys=[client_id])
    project: Mapped["Project | None"] = relationship("Project", back_populates="engagement", foreign_keys=[project_id])
    engagement_lead: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[engagement_lead_id])

    proposals: Mapped[list["EngagementProposal"]] = relationship(
        "EngagementProposal", back_populates="engagement", cascade="all, delete-orphan", order_by="desc(EngagementProposal.created_at)"
    )
    agreements: Mapped[list["EngagementAgreement"]] = relationship(
        "EngagementAgreement", back_populates="engagement", cascade="all, delete-orphan", order_by="desc(EngagementAgreement.created_at)"
    )
    weekly_reports: Mapped[list["EngagementWeeklyReport"]] = relationship(
        "EngagementWeeklyReport", back_populates="engagement", cascade="all, delete-orphan", order_by="desc(EngagementWeeklyReport.week_start_date)"
    )
    uat_sessions: Mapped[list["EngagementUatSession"]] = relationship(
        "EngagementUatSession", back_populates="engagement", cascade="all, delete-orphan", order_by="desc(EngagementUatSession.created_at)"
    )
    issues: Mapped[list["EngagementIssue"]] = relationship(
        "EngagementIssue", back_populates="engagement", cascade="all, delete-orphan", order_by="desc(EngagementIssue.created_at)"
    )
    change_requests: Mapped[list["EngagementChangeRequest"]] = relationship(
        "EngagementChangeRequest", back_populates="engagement", cascade="all, delete-orphan", order_by="desc(EngagementChangeRequest.created_at)"
    )
    handover: Mapped["EngagementHandover | None"] = relationship(
        "EngagementHandover", back_populates="engagement", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "engagement_code", name="uq_client_engagements_code"),
        UniqueConstraint("organization_id", "id", name="uq_client_engagements_org_id"),
        CheckConstraint("progress_percentage >= 0 AND progress_percentage <= 100", name="ck_engagement_progress"),
        CheckConstraint(
            "current_stage IN ('proposal', 'agreement', 'kickoff', 'delivery', 'weekly_reporting', 'uat', 'issues_triage', 'acceptance_handover', 'maintenance_support')",
            name="ck_engagement_stage",
        ),
        CheckConstraint(
            "delivery_health IN ('on_track', 'at_risk', 'blocked', 'completed')",
            name="ck_engagement_health",
        ),
    )


class EngagementProposal(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "engagement_proposals"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_engagements.id", ondelete="CASCADE"), index=True, nullable=False
    )
    proposal_number: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[int] = mapped_column(Integer, server_default="1", default=1, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), server_default="draft", default="draft", nullable=False, index=True
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), server_default="INR", default="INR", nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    
    scope_of_work: Mapped[str | None] = mapped_column(Text, nullable=True)
    deliverables_json: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSONB, nullable=True)
    line_items_json: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSONB, nullable=True)
    payment_terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )

    engagement: Mapped["ClientEngagement"] = relationship("ClientEngagement", back_populates="proposals")
    created_by: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[created_by_employee_id])

    __table_args__ = (
        UniqueConstraint("organization_id", "proposal_number", name="uq_proposals_number"),
        CheckConstraint(
            "status IN ('draft', 'in_review', 'sent', 'accepted', 'declined', 'expired')",
            name="ck_proposal_status",
        ),
    )


class EngagementAgreement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "engagement_agreements"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_engagements.id", ondelete="CASCADE"), index=True, nullable=False
    )
    proposal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagement_proposals.id", ondelete="SET NULL"), nullable=True
    )
    agreement_number: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    agreement_type: Mapped[str] = mapped_column(
        String(32), server_default="sow", default="sow", nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), server_default="draft", default="draft", nullable=False, index=True
    )
    contract_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), server_default="INR", default="INR", nullable=False)
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    document_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    document_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    engagement: Mapped["ClientEngagement"] = relationship("ClientEngagement", back_populates="agreements")
    signatures: Mapped[list["AgreementSignature"]] = relationship(
        "AgreementSignature", back_populates="agreement", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "agreement_number", name="uq_agreements_number"),
        CheckConstraint(
            "agreement_type IN ('sow', 'msa', 'nda', 'sla', 'amendment')",
            name="ck_agreement_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'under_review', 'pending_signatures', 'partially_signed', 'active', 'terminated', 'expired')",
            name="ck_agreement_status",
        ),
    )


class AgreementSignature(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "agreement_signatures"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    agreement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagement_agreements.id", ondelete="CASCADE"), index=True, nullable=False
    )
    signer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    signer_email: Mapped[str] = mapped_column(String(320), nullable=False)
    signer_role: Mapped[str] = mapped_column(String(32), nullable=False)  # internal, client
    signer_title: Mapped[str | None] = mapped_column(String(100), nullable=True)

    status: Mapped[str] = mapped_column(
        String(32), server_default="pending", default="pending", nullable=False
    )
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature_data: Mapped[str | None] = mapped_column(Text, nullable=True)  # base64 stroke or typed representation
    signature_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)

    agreement: Mapped["EngagementAgreement"] = relationship("EngagementAgreement", back_populates="signatures")

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'signed', 'declined')", name="ck_signature_status"),
        CheckConstraint("signer_role IN ('internal', 'client')", name="ck_signature_role"),
    )


class EngagementWeeklyReport(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "engagement_weekly_reports"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_engagements.id", ondelete="CASCADE"), index=True, nullable=False
    )
    report_number: Mapped[str] = mapped_column(String(50), nullable=False)
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    week_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    
    executive_summary: Mapped[str] = mapped_column(Text, nullable=False)
    accomplishments: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSONB, nullable=True)
    next_week_plans: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSONB, nullable=True)
    risks_and_blockers: Mapped[dict[str, Any] | list[Any] | None] = mapped_column(JSONB, nullable=True)
    delivery_health: Mapped[str] = mapped_column(
        String(20), server_default="on_track", default="on_track", nullable=False
    )
    client_action_items: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, server_default="false", default=False, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    engagement: Mapped["ClientEngagement"] = relationship("ClientEngagement", back_populates="weekly_reports")


class EngagementUatSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "engagement_uat_sessions"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_engagements.id", ondelete="CASCADE"), index=True, nullable=False
    )
    session_title: Mapped[str] = mapped_column(String(255), nullable=False)
    build_version: Mapped[str] = mapped_column(String(50), nullable=False)
    staging_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), server_default="active", default="active", nullable=False
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    engagement: Mapped["ClientEngagement"] = relationship("ClientEngagement", back_populates="uat_sessions")
    test_cases: Mapped[list["EngagementUatTestCase"]] = relationship(
        "EngagementUatTestCase", back_populates="session", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("status IN ('draft', 'active', 'completed', 'approved', 'rejected')", name="ck_uat_session_status"),
    )


class EngagementUatTestCase(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "engagement_uat_test_cases"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engagement_uat_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    instructions: Mapped[str] = mapped_column(Text, nullable=False)
    expected_outcome: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), server_default="pending", default="pending", nullable=False
    )  # pending, pass, fail, blocked
    actual_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    tested_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session: Mapped["EngagementUatSession"] = relationship("EngagementUatSession", back_populates="test_cases")


class EngagementIssue(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "engagement_issues"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_engagements.id", ondelete="CASCADE"), index=True, nullable=False
    )
    issue_number: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    issue_type: Mapped[str] = mapped_column(
        String(32), server_default="bug", default="bug", nullable=False
    )  # clarification, bug, enhancement, access, scope_change
    priority: Mapped[str] = mapped_column(
        String(20), server_default="medium", default="medium", nullable=False
    )  # low, medium, high, critical
    status: Mapped[str] = mapped_column(
        String(32), server_default="open", default="open", nullable=False
    )  # open, in_progress, resolved, closed
    
    assigned_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )
    reported_by_name: Mapped[str] = mapped_column(String(255), nullable=False)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    engagement: Mapped["ClientEngagement"] = relationship("ClientEngagement", back_populates="issues")
    assigned_employee: Mapped["Employee | None"] = relationship("Employee", foreign_keys=[assigned_employee_id])


class EngagementChangeRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "engagement_change_requests"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_engagements.id", ondelete="CASCADE"), index=True, nullable=False
    )
    cr_number: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    scope_delta: Mapped[str] = mapped_column(Text, nullable=False)
    additional_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), server_default="0.00", default=Decimal("0.00"), nullable=False)
    additional_days: Mapped[int] = mapped_column(Integer, server_default="0", default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), server_default="draft", default="draft", nullable=False
    )  # draft, under_review, approved, rejected

    engagement: Mapped["ClientEngagement"] = relationship("ClientEngagement", back_populates="change_requests")


class EngagementHandover(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "engagement_handovers"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    engagement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_engagements.id", ondelete="CASCADE"), index=True, nullable=False
    )
    handover_number: Mapped[str] = mapped_column(String(50), nullable=False)
    deliverables_accepted: Mapped[bool] = mapped_column(Boolean, server_default="false", default=False, nullable=False)
    documentation_provided: Mapped[bool] = mapped_column(Boolean, server_default="false", default=False, nullable=False)
    client_signoff_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    client_signoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    warranty_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    warranty_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sla_tier: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Standard, Gold, 24x7 Enterprise
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    engagement: Mapped["ClientEngagement"] = relationship("ClientEngagement", back_populates="handover")
