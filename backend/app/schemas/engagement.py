import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from pydantic import BaseModel, Field


# --- Overview Metrics ---
class EngagementOverview(BaseModel):
    active_engagements_count: int = 0
    proposals_pending_count: int = 0
    agreements_pending_signatures_count: int = 0
    kickoff_ready_count: int = 0
    active_delivery_count: int = 0
    open_critical_issues_count: int = 0
    uat_active_count: int = 0
    total_pipeline_value: Decimal = Decimal("0.00")
    total_collected_value: Decimal = Decimal("0.00")


# --- Proposal Schemas ---
class ProposalCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    total_amount: Decimal = Decimal("0.00")
    currency: str = "INR"
    valid_until: date | None = None
    scope_of_work: str | None = None
    deliverables_json: list[dict[str, Any]] | None = None
    line_items_json: list[dict[str, Any]] | None = None
    payment_terms: str | None = None


class ProposalResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    engagement_id: uuid.UUID
    proposal_number: str
    title: str
    version: int
    status: str
    total_amount: Decimal
    currency: str
    valid_until: date | None
    scope_of_work: str | None
    deliverables_json: Any | None
    line_items_json: Any | None
    payment_terms: str | None
    sent_at: datetime | None
    accepted_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Agreement & Signature Schemas ---
class SignatureCreate(BaseModel):
    signer_name: str
    signer_email: str
    signer_role: str = "internal"  # internal, client
    signer_title: str | None = None
    signature_data: str  # base64 or SVG stroke


class SignatureResponse(BaseModel):
    id: uuid.UUID
    signer_name: str
    signer_email: str
    signer_role: str
    signer_title: str | None
    status: str
    signed_at: datetime | None
    signature_checksum: str | None

    class Config:
        from_attributes = True


class AgreementCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    agreement_type: str = "sow"  # sow, msa, nda, sla, amendment
    contract_value: Decimal
    currency: str = "INR"
    effective_date: date | None = None
    expiry_date: date | None = None
    proposal_id: uuid.UUID | None = None
    document_content: str | None = None


class AgreementResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    engagement_id: uuid.UUID
    agreement_number: str
    title: str
    agreement_type: str
    status: str
    contract_value: Decimal
    currency: str
    effective_date: date | None
    expiry_date: date | None
    document_sha256: str | None
    created_at: datetime
    signatures: list[SignatureResponse] = []

    class Config:
        from_attributes = True


# --- Weekly Report Schemas ---
class WeeklyReportCreate(BaseModel):
    week_start_date: date
    week_end_date: date
    executive_summary: str
    accomplishments: list[str] | None = None
    next_week_plans: list[str] | None = None
    risks_and_blockers: list[str] | None = None
    delivery_health: str = "on_track"
    client_action_items: str | None = None
    is_published: bool = False


class WeeklyReportResponse(BaseModel):
    id: uuid.UUID
    engagement_id: uuid.UUID
    report_number: str
    week_start_date: date
    week_end_date: date
    executive_summary: str
    accomplishments: Any | None
    next_week_plans: Any | None
    risks_and_blockers: Any | None
    delivery_health: str
    client_action_items: str | None
    is_published: bool
    published_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


# --- UAT Schemas ---
class UatTestCaseCreate(BaseModel):
    title: str
    instructions: str
    expected_outcome: str


class UatTestCaseUpdate(BaseModel):
    status: str  # pending, pass, fail, blocked
    actual_outcome: str | None = None
    tested_by_name: str | None = None


class UatTestCaseResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    title: str
    instructions: str
    expected_outcome: str
    status: str
    actual_outcome: str | None
    tested_by_name: str | None
    tested_at: datetime | None

    class Config:
        from_attributes = True


class UatSessionCreate(BaseModel):
    session_title: str
    build_version: str
    staging_url: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    test_cases: list[UatTestCaseCreate] = []


class UatSessionResponse(BaseModel):
    id: uuid.UUID
    engagement_id: uuid.UUID
    session_title: str
    build_version: str
    staging_url: str | None
    status: str
    start_date: date | None
    end_date: date | None
    created_at: datetime
    test_cases: list[UatTestCaseResponse] = []

    class Config:
        from_attributes = True


# --- Client Issues & Queries Schemas ---
class IssueCreate(BaseModel):
    title: str
    description: str
    issue_type: str = "bug"  # clarification, bug, enhancement, access, scope_change
    priority: str = "medium"  # low, medium, high, critical
    reported_by_name: str
    assigned_employee_id: uuid.UUID | None = None


class IssueUpdate(BaseModel):
    status: str | None = None  # open, in_progress, resolved, closed
    priority: str | None = None
    assigned_employee_id: uuid.UUID | None = None
    resolution_notes: str | None = None


class IssueResponse(BaseModel):
    id: uuid.UUID
    engagement_id: uuid.UUID
    issue_number: str
    title: str
    description: str
    issue_type: str
    priority: str
    status: str
    reported_by_name: str
    assigned_employee_id: uuid.UUID | None
    resolution_notes: str | None
    resolved_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Scope Change Request Schemas ---
class ChangeRequestCreate(BaseModel):
    title: str
    justification: str
    scope_delta: str
    additional_cost: Decimal = Decimal("0.00")
    additional_days: int = 0


class ChangeRequestResponse(BaseModel):
    id: uuid.UUID
    engagement_id: uuid.UUID
    cr_number: str
    title: str
    justification: str
    scope_delta: str
    additional_cost: Decimal
    additional_days: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Handover Schemas ---
class HandoverCreateOrUpdate(BaseModel):
    deliverables_accepted: bool = False
    documentation_provided: bool = False
    client_signoff_name: str | None = None
    warranty_start_date: date | None = None
    warranty_end_date: date | None = None
    sla_tier: str | None = None
    notes: str | None = None


class HandoverResponse(BaseModel):
    id: uuid.UUID
    engagement_id: uuid.UUID
    handover_number: str
    deliverables_accepted: bool
    documentation_provided: bool
    client_signoff_name: str | None
    client_signoff_at: datetime | None
    warranty_start_date: date | None
    warranty_end_date: date | None
    sla_tier: str | None
    notes: str | None

    class Config:
        from_attributes = True


# --- Engagement Schemas ---
class ClientEngagementCreate(BaseModel):
    client_id: uuid.UUID
    title: str = Field(..., min_length=3, max_length=255)
    description: str | None = None
    contract_value: Decimal | None = None
    currency: str = "INR"
    target_completion_date: date | None = None
    engagement_lead_id: uuid.UUID | None = None


class ClientEngagementUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    current_stage: str | None = None
    delivery_health: str | None = None
    progress_percentage: int | None = Field(None, ge=0, le=100)
    contract_value: Decimal | None = None
    target_completion_date: date | None = None
    actual_completion_date: date | None = None
    engagement_lead_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None


class ClientEngagementSummary(BaseModel):
    id: uuid.UUID
    engagement_code: str
    title: str
    client_id: uuid.UUID
    client_name: str | None = None
    project_id: uuid.UUID | None = None
    current_stage: str
    delivery_health: str
    progress_percentage: int
    contract_value: Decimal | None
    currency: str
    target_completion_date: date | None
    created_at: datetime

    class Config:
        from_attributes = True


class ClientEngagementDetail(ClientEngagementSummary):
    description: str | None = None
    invoiced_amount: Decimal = Decimal("0.00")
    collected_amount: Decimal = Decimal("0.00")
    actual_completion_date: date | None = None
    engagement_lead_id: uuid.UUID | None = None
    proposals: list[ProposalResponse] = []
    agreements: list[AgreementResponse] = []
    weekly_reports: list[WeeklyReportResponse] = []
    uat_sessions: list[UatSessionResponse] = []
    issues: list[IssueResponse] = []
    change_requests: list[ChangeRequestResponse] = []
    handover: HandoverResponse | None = None

    class Config:
        from_attributes = True
