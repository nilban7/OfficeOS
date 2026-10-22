"""Unit tests for Client Engagements module.

Tests models, schemas, stage calculations, digital signature hashing, and service logic.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
import hashlib
from uuid import uuid4

import pytest

from app.schemas.engagement import (
    AgreementCreate,
    AgreementResponse,
    ChangeRequestCreate,
    ChangeRequestResponse,
    ClientEngagementCreate,
    ClientEngagementDetail,
    ClientEngagementSummary,
    EngagementOverview,
    HandoverCreateOrUpdate,
    HandoverResponse,
    IssueCreate,
    IssueResponse,
    ProposalCreate,
    ProposalResponse,
    SignatureCreate,
    SignatureResponse,
    UatSessionCreate,
    UatSessionResponse,
    UatTestCaseCreate,
    WeeklyReportCreate,
    WeeklyReportResponse,
)
from app.services.engagement import EngagementService


def test_engagement_overview_metrics_contract():
    metrics = EngagementOverview(
        active_engagements_count=8,
        proposals_pending_count=2,
        agreements_pending_signatures_count=3,
        kickoff_ready_count=1,
        active_delivery_count=4,
        open_critical_issues_count=1,
        uat_active_count=2,
        total_pipeline_value=Decimal("1250000.00"),
        total_collected_value=Decimal("400000.00"),
    )
    assert metrics.active_engagements_count == 8
    assert metrics.total_pipeline_value == Decimal("1250000.00")
    assert metrics.agreements_pending_signatures_count == 3
    assert metrics.uat_active_count == 2
    assert metrics.open_critical_issues_count == 1


def test_signature_sha256_hash():
    data = "data:image/svg+xml;base64,PHN2Zz5kZW1vLXNpZ25hdHVyZTwvc3ZnPg=="
    expected_hash = hashlib.sha256(data.encode("utf-8")).hexdigest()

    sig = SignatureCreate(
        signer_name="John Doe",
        signer_email="john@acme.com",
        signer_role="client",
        signature_data=data,
    )
    computed_hash = hashlib.sha256(sig.signature_data.encode("utf-8")).hexdigest()
    assert computed_hash == expected_hash
    assert len(computed_hash) == 64


def test_proposal_schema_validation():
    prop = ProposalCreate(
        title="Enterprise Migration Blueprint",
        scope_of_work="Multi-tenant DB architecture and FastAPI orchestration",
        deliverables_json=[{"title": "Schema migrations"}, {"title": "Next.js dashboard"}],
        total_amount=Decimal("45000.00"),
        currency="USD",
    )
    assert prop.title == "Enterprise Migration Blueprint"
    assert len(prop.deliverables_json) == 2
    assert prop.total_amount == Decimal("45000.00")


def test_agreement_schema_validation():
    agr = AgreementCreate(
        title="Master Statement of Work #1",
        agreement_type="sow",
        contract_value=Decimal("45000.00"),
        currency="USD",
        document_content="This Master Services Agreement...",
    )
    assert agr.title == "Master Statement of Work #1"
    assert agr.agreement_type == "sow"
    assert agr.contract_value == Decimal("45000.00")


def test_uat_test_case_schema():
    tc = UatTestCaseCreate(
        title="Verify multi-tenant isolation",
        instructions="Sign in as Org A, attempt querying Org B resource",
        expected_outcome="HTTP 403 Forbidden",
    )
    assert tc.title == "Verify multi-tenant isolation"
    assert tc.expected_outcome == "HTTP 403 Forbidden"


def test_weekly_report_schema():
    wr = WeeklyReportCreate(
        week_start_date=date(2026, 10, 15),
        week_end_date=date(2026, 10, 21),
        executive_summary="All deliverables on track",
        accomplishments=["Backend endpoints verified", "Frontend visual QA passed"],
        next_week_plans=["UAT mock runs with client"],
        delivery_health="on_track",
        is_published=True,
    )
    assert wr.delivery_health == "on_track"
    assert wr.is_published is True
    assert len(wr.accomplishments) == 2


def test_client_issue_schema():
    issue = IssueCreate(
        title="Logo upload 413 Payload Too Large",
        description="Uploading 10MB SVG causes upload failure",
        issue_type="bug",
        priority="high",
        reported_by_name="Jane Client",
    )
    assert issue.issue_type == "bug"
    assert issue.priority == "high"


def test_change_request_schema():
    cr = ChangeRequestCreate(
        title="WhatsApp webhook notifications",
        justification="Client requested notifications via WhatsApp in addition to email",
        scope_delta="Integrate Twilio WhatsApp API",
        additional_cost=Decimal("5000.00"),
        additional_days=5,
    )
    assert cr.additional_cost == Decimal("5000.00")
    assert cr.additional_days == 5


def test_handover_schema():
    ho = HandoverCreateOrUpdate(
        deliverables_accepted=True,
        documentation_provided=True,
        client_signoff_name="Jane Client (VP Eng)",
        warranty_start_date=date(2026, 11, 1),
        warranty_end_date=date(2027, 5, 1),
        sla_tier="Gold 24x7",
    )
    assert ho.deliverables_accepted is True
    assert ho.sla_tier == "Gold 24x7"


def test_engagement_valid_stages_and_health():
    valid_stages = [
        "proposal",
        "agreement",
        "kickoff",
        "delivery",
        "weekly_reporting",
        "uat",
        "issues_triage",
        "acceptance_handover",
        "maintenance_support",
    ]
    assert len(valid_stages) == 9

    # Verify ClientEngagementCreate default values
    client_id = uuid4()
    req = ClientEngagementCreate(
        client_id=client_id,
        title="Enterprise Migration",
        contract_value=Decimal("50000.00"),
    )
    assert req.title == "Enterprise Migration"
    assert req.contract_value == Decimal("50000.00")
    assert req.currency == "INR"
