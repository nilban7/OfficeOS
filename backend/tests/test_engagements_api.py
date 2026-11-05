import pytest
"""Unit tests for Client Engagements module.

Tests models, schemas, stage calculations, digital signature hashing, and service logic.
"""

import hashlib
from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.schemas.engagement import (
    AgreementCreate,
    ChangeRequestCreate,
    ChatMessageCreate,
    ChatParticipant,
    ChatParticipantsResponse,
    ClientEngagementCreate,
    EngagementOverview,
    HandoverCreateOrUpdate,
    IssueCreate,
    ProposalCreate,
    SignatureCreate,
    UatTestCaseCreate,
    WeeklyReportCreate,
)


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
    assert req.project_id is None


def test_client_engagement_create_with_project_id():
    client_id = uuid4()
    project_id = uuid4()
    req = ClientEngagementCreate(
        client_id=client_id,
        project_id=project_id,
        title="Web Platform Overhaul",
        contract_value=Decimal("75000.00"),
    )
    assert req.title == "Web Platform Overhaul"
    assert req.project_id == project_id
    assert req.client_id == client_id

def test_chat_message_schema_validation_proposal_channel():
    prop_id = uuid4()
    msg = ChatMessageCreate(
        message="Client agreed to revised payment milestones in Proposal v2.",
        sender_name="Alice Smith",
        sender_role="Project Manager",
        sender_type="member",
        channel="proposal",
        proposal_id=prop_id,
    )
    assert msg.channel == "proposal"
    assert msg.proposal_id == prop_id
    assert msg.sender_type == "member"
    assert "payment milestones" in msg.message


def test_chat_message_schema_validation_dispute_channel():
    issue_id = uuid4()
    msg = ChatMessageCreate(
        message="Clarification on scope dispute: Bug fix has been deployed to staging environment for signoff.",
        sender_name="John Doe",
        sender_role="Client Representative",
        sender_type="client",
        channel="disputes",
        issue_id=issue_id,
    )
    assert msg.channel == "disputes"
    assert msg.issue_id == issue_id
    assert msg.sender_type == "client"


def test_chat_participants_response_schema():
    p1 = ChatParticipant(
        id=uuid4(),
        name="Aritra Das",
        role="Lead Engineer",
        participant_type="member",
        designation="Software Engineer",
    )
    p2 = ChatParticipant(
        id=uuid4(),
        name="Jane Client",
        role="Product Director",
        participant_type="client",
        email="jane@acme.com",
    )
    resp = ChatParticipantsResponse(
        project_id=uuid4(),
        project_name="OfficeOS SaaS Overhaul",
        client_id=uuid4(),
        client_name="Acme International",
        members=[p1, p2],
    )
    assert len(resp.members) == 2
    assert resp.members[0].participant_type == "member"
    assert resp.members[1].participant_type == "client"



@pytest.mark.asyncio
async def test_chat_ticket_store_issuance_and_single_use():
    from app.services.chat_ws import ChatTicketStore

    store = ChatTicketStore()
    eng_id = uuid4()
    org_id = uuid4()
    user_id = str(uuid4())

    ticket = await store.issue_ticket(
        user_id=user_id,
        org_id=org_id,
        engagement_id=eng_id,
        profile_id=uuid4(),
        user_name="Niladri Banerjee",
        user_role="Lead Architect",
        is_internal=True,
        ttl_seconds=60,
    )
    assert ticket is not None
    assert len(ticket) >= 32

    # 1. First redemption succeeds
    redeemed = await store.redeem_ticket(ticket, eng_id)
    assert redeemed is not None
    assert redeemed.user_id == user_id
    assert redeemed.user_name == "Niladri Banerjee"
    assert redeemed.is_internal is True

    # 2. Second redemption fails (single-use enforcement)
    second_attempt = await store.redeem_ticket(ticket, eng_id)
    assert second_attempt is None


@pytest.mark.asyncio
async def test_chat_connection_manager_serialization_and_multiuser():
    from datetime import datetime, timezone
    from unittest.mock import AsyncMock
    from app.services.chat_ws import ChatTicket, EngagementConnectionManager

    manager = EngagementConnectionManager()
    eng_id_1 = uuid4()
    eng_id_2 = uuid4()

    mock_ws_user_a = AsyncMock()
    mock_ws_user_b = AsyncMock()
    mock_ws_other_room = AsyncMock()

    ticket_user_a = ChatTicket(
        ticket="ticket-a",
        user_id="user-a",
        org_id=uuid4(),
        engagement_id=eng_id_1,
        profile_id=uuid4(),
        user_name="User A",
        user_role="Lead Engineer",
        is_internal=True,
    )

    ticket_user_b = ChatTicket(
        ticket="ticket-b",
        user_id="user-b",
        org_id=uuid4(),
        engagement_id=eng_id_1,
        profile_id=None,
        user_name="User B (Client)",
        user_role="Client Representative",
        is_internal=False,
    )

    ticket_other = ChatTicket(
        ticket="ticket-other",
        user_id="user-other",
        org_id=uuid4(),
        engagement_id=eng_id_2,
        profile_id=uuid4(),
        user_name="Other User",
        user_role="Manager",
        is_internal=True,
    )

    await manager.connect(eng_id_1, mock_ws_user_a, ticket_user_a)
    await manager.connect(eng_id_1, mock_ws_user_b, ticket_user_b)
    await manager.connect(eng_id_2, mock_ws_other_room, ticket_other)

    assert manager.get_active_count(eng_id_1) == 2
    assert manager.get_active_count(eng_id_2) == 1

    # Broadcast message containing real UUID and datetime objects to eng_id_1
    real_db_message = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "engagement_id": eng_id_1,
        "sender_name": "User A",
        "sender_role": "Lead Engineer",
        "sender_type": "member",
        "channel": "general",
        "visibility": "client",
        "message": "Real-time delivery works!",
        "client_msg_id": uuid4(),
        "created_at": datetime.now(timezone.utc),
    }

    delivered = await manager.broadcast_message(eng_id_1, real_db_message, visibility="client")
    assert delivered == 2

    # Both User A and User B received the broadcast
    assert mock_ws_user_a.send_json.call_count == 1
    assert mock_ws_user_b.send_json.call_count == 1
    # User in other room did NOT receive it (cross-engagement isolation)
    assert mock_ws_other_room.send_json.call_count == 0

    # Payload verified: UUID and datetime converted to JSON strings
    sent_payload = mock_ws_user_a.send_json.call_args[0][0]
    assert sent_payload["type"] == "chat_message"
    assert isinstance(sent_payload["data"]["id"], str)
    assert isinstance(sent_payload["data"]["created_at"], str)

    # Connect an internal socket to the Team Chat room
    mock_ws_internal = AsyncMock()
    ticket_internal = ChatTicket(
        ticket="ticket-internal",
        user_id="user-internal",
        org_id=uuid4(),
        engagement_id=eng_id_1,
        profile_id=uuid4(),
        user_name="Internal User",
        user_role="Lead Engineer",
        is_internal=True,
        conversation="internal",
    )
    await manager.connect(eng_id_1, mock_ws_internal, ticket_internal, conversation="internal")

    # Internal message broadcast: only connected internal user in internal room receives it
    internal_message = {
        "id": uuid4(),
        "engagement_id": eng_id_1,
        "message": "Internal budget planning",
        "visibility": "internal",
    }
    delivered_internal = await manager.broadcast_message(eng_id_1, internal_message, visibility="internal")
    assert delivered_internal == 1
    assert mock_ws_internal.send_json.call_count == 1
    assert mock_ws_user_b.send_json.call_count == 1  # Client socket in client room was NOT called

    # Cleanup
    await manager.disconnect(eng_id_1, mock_ws_user_a)
    await manager.disconnect(eng_id_1, mock_ws_user_b)
    await manager.disconnect(eng_id_1, mock_ws_internal, conversation="internal")
    await manager.disconnect(eng_id_2, mock_ws_other_room)

    assert manager.get_active_count(eng_id_1) == 0
    assert manager.get_active_count(eng_id_2) == 0


# ============================================================================
# Participant Verification & Authorization Tests
# ============================================================================

def _create_mock_engagement(
    org_id,
    eng_id,
    lead_id=None,
    pm_id=None,
    member_ids=None,
    has_project=True,
    client_id=None,
    client_email=None,
):
    from unittest.mock import MagicMock
    eng = MagicMock()
    eng.id = eng_id
    eng.organization_id = org_id
    eng.engagement_lead_id = lead_id
    eng.client_id = client_id or uuid4()
    eng.client = MagicMock()
    eng.client.email = client_email or "client@example.com"
    if has_project:
        proj = MagicMock()
        proj.project_manager_employee_id = pm_id
        members = []
        for mid in (member_ids or []):
            m = MagicMock()
            m.employee_id = mid
            members.append(m)
        proj.members = members
        eng.project = proj
    else:
        eng.project = None
    return eng


@pytest.mark.asyncio
async def test_verify_engagement_participant_lead_access():
    from unittest.mock import AsyncMock, MagicMock, patch
    from app.services.engagement import EngagementService

    org_id = uuid4()
    eng_id = uuid4()
    lead_emp_id = uuid4()
    auth_user_id = uuid4()
    profile_id = uuid4()

    eng = _create_mock_engagement(org_id, eng_id, lead_id=lead_emp_id)

    profile = MagicMock()
    profile.id = profile_id
    profile.auth_user_id = auth_user_id
    profile.email = "lead@officeos.com"

    employee = MagicMock()
    employee.id = lead_emp_id
    employee.profile_id = profile_id

    db = AsyncMock()
    db.scalar.side_effect = [eng, profile, employee]

    with patch("app.services.engagement.get_user_permissions", return_value=[]), \
         patch("app.services.engagement.get_user_roles", return_value=[]):
        res = await EngagementService.verify_engagement_participant(
            db, org_id, eng_id, str(auth_user_id)
        )
        assert res == eng


@pytest.mark.asyncio
async def test_verify_engagement_participant_project_manager_access():
    from unittest.mock import AsyncMock, MagicMock, patch
    from app.services.engagement import EngagementService

    org_id = uuid4()
    eng_id = uuid4()
    pm_emp_id = uuid4()
    auth_user_id = uuid4()
    profile_id = uuid4()

    eng = _create_mock_engagement(org_id, eng_id, pm_id=pm_emp_id)

    profile = MagicMock()
    profile.id = profile_id
    profile.auth_user_id = auth_user_id
    profile.email = "pm@officeos.com"

    employee = MagicMock()
    employee.id = pm_emp_id
    employee.profile_id = profile_id

    db = AsyncMock()
    db.scalar.side_effect = [eng, profile, employee]

    with patch("app.services.engagement.get_user_permissions", return_value=[]), \
         patch("app.services.engagement.get_user_roles", return_value=[]):
        res = await EngagementService.verify_engagement_participant(
            db, org_id, eng_id, str(auth_user_id)
        )
        assert res == eng


@pytest.mark.asyncio
async def test_verify_engagement_participant_member_access():
    from unittest.mock import AsyncMock, MagicMock, patch
    from app.services.engagement import EngagementService

    org_id = uuid4()
    eng_id = uuid4()
    member_emp_id = uuid4()
    auth_user_id = uuid4()
    profile_id = uuid4()

    eng = _create_mock_engagement(org_id, eng_id, member_ids=[member_emp_id, uuid4()])

    profile = MagicMock()
    profile.id = profile_id
    profile.auth_user_id = auth_user_id
    profile.email = "dev@officeos.com"

    employee = MagicMock()
    employee.id = member_emp_id
    employee.profile_id = profile_id

    db = AsyncMock()
    db.scalar.side_effect = [eng, profile, employee]

    with patch("app.services.engagement.get_user_permissions", return_value=[]), \
         patch("app.services.engagement.get_user_roles", return_value=[]):
        res = await EngagementService.verify_engagement_participant(
            db, org_id, eng_id, str(auth_user_id)
        )
        assert res == eng


@pytest.mark.asyncio
async def test_verify_engagement_participant_admin_access():
    from unittest.mock import AsyncMock, MagicMock, patch
    from app.services.engagement import EngagementService

    org_id = uuid4()
    eng_id = uuid4()
    auth_user_id = uuid4()
    profile_id = uuid4()

    eng = _create_mock_engagement(org_id, eng_id)

    profile = MagicMock()
    profile.id = profile_id
    profile.auth_user_id = auth_user_id
    profile.email = "admin@officeos.com"

    employee = MagicMock()
    employee.id = uuid4()
    employee.profile_id = profile_id

    db = AsyncMock()
    db.scalar.side_effect = [eng, profile, employee]

    with patch("app.services.engagement.get_user_permissions", return_value=["engagements.manage"]), \
         patch("app.services.engagement.get_user_roles", return_value=[]):
        res = await EngagementService.verify_engagement_participant(
            db, org_id, eng_id, str(auth_user_id)
        )
        assert res == eng


@pytest.mark.asyncio
async def test_verify_engagement_participant_unrelated_forbidden():
    from unittest.mock import AsyncMock, MagicMock, patch
    from fastapi import HTTPException
    from app.services.engagement import EngagementService

    org_id = uuid4()
    eng_id = uuid4()
    auth_user_id = uuid4()
    profile_id = uuid4()

    eng = _create_mock_engagement(org_id, eng_id, lead_id=uuid4(), pm_id=uuid4(), member_ids=[uuid4()])

    profile = MagicMock()
    profile.id = profile_id
    profile.auth_user_id = auth_user_id
    profile.email = "unrelated@officeos.com"

    employee = MagicMock()
    employee.id = uuid4()
    employee.profile_id = profile_id

    db = AsyncMock()
    db.scalar.side_effect = [eng, profile, employee, None]

    with patch("app.services.engagement.get_user_permissions", return_value=[]), \
         patch("app.services.engagement.get_user_roles", return_value=[]):
        with pytest.raises(HTTPException) as exc_info:
            await EngagementService.verify_engagement_participant(
                db, org_id, eng_id, str(auth_user_id)
            )
        assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_verify_engagement_participant_no_project_handled_safely():
    from unittest.mock import AsyncMock, MagicMock, patch
    from fastapi import HTTPException
    from app.services.engagement import EngagementService

    org_id = uuid4()
    eng_id = uuid4()
    auth_user_id = uuid4()
    profile_id = uuid4()

    eng = _create_mock_engagement(org_id, eng_id, has_project=False)

    profile = MagicMock()
    profile.id = profile_id
    profile.auth_user_id = auth_user_id
    profile.email = "random@officeos.com"

    employee = MagicMock()
    employee.id = uuid4()
    employee.profile_id = profile_id

    db = AsyncMock()
    db.scalar.side_effect = [eng, profile, employee, None]

    with patch("app.services.engagement.get_user_permissions", return_value=[]), \
         patch("app.services.engagement.get_user_roles", return_value=[]):
        with pytest.raises(HTTPException) as exc_info:
            await EngagementService.verify_engagement_participant(
                db, org_id, eng_id, str(auth_user_id)
            )
        assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_verify_engagement_participant_client_contact_access():
    from unittest.mock import AsyncMock, MagicMock, patch
    from app.services.engagement import EngagementService

    org_id = uuid4()
    eng_id = uuid4()
    auth_user_id = uuid4()
    profile_id = uuid4()
    client_id = uuid4()

    eng = _create_mock_engagement(org_id, eng_id, client_id=client_id, client_email="client@horizon.com")

    profile = MagicMock()
    profile.id = profile_id
    profile.auth_user_id = auth_user_id
    profile.email = "client@horizon.com"

    mock_client_contact = MagicMock()

    db = AsyncMock()
    # scalar side_effects: 1) eng, 2) profile, 3) employee (None for external client), 4) client_contact
    db.scalar.side_effect = [eng, profile, None, mock_client_contact]

    with patch("app.services.engagement.get_user_permissions", return_value=[]), \
         patch("app.services.engagement.get_user_roles", return_value=[]):
        res = await EngagementService.verify_engagement_participant(
            db, org_id, eng_id, str(auth_user_id)
        )
        assert res == eng


# --- Tests for Two Separate Conversation Windows (Client Chat vs Team Chat) ---

@pytest.mark.asyncio
async def test_chat_message_conversation_schemas():
    """ChatMessageCreate and WsTicketResponse properly handle conversation field."""
    from app.schemas.engagement import ChatMessageCreate, WsTicketResponse

    msg_client = ChatMessageCreate(
        message="Hello client!",
        conversation="client",
    )
    assert msg_client.conversation == "client"

    msg_internal = ChatMessageCreate(
        message="Team internal discussion",
        conversation="internal",
    )
    assert msg_internal.conversation == "internal"

    ticket = WsTicketResponse(
        ticket="test-ticket",
        expires_in=60,
        engagement_id=uuid4(),
        conversation="internal",
    )
    assert ticket.conversation == "internal"


@pytest.mark.asyncio
async def test_team_chat_non_internal_forbidden_listing():
    """Non-internal client users are strictly forbidden (HTTP 403) from listing Team Chat."""
    from unittest.mock import AsyncMock, MagicMock
    from fastapi import HTTPException
    from app.services.engagement import EngagementService
    from app.models.engagement import ClientEngagement

    org_id = uuid4()
    eng_id = uuid4()

    mock_eng = MagicMock(spec=ClientEngagement)
    mock_eng.id = eng_id
    mock_eng.organization_id = org_id

    db = AsyncMock()
    db.get.return_value = mock_eng

    # Attempt to list internal team conversation as non-internal user
    with pytest.raises(HTTPException) as exc_info:
        await EngagementService.list_chat_messages(
            db=db,
            organization_id=org_id,
            engagement_id=eng_id,
            is_internal=False,
            conversation="internal",
        )
    assert exc_info.value.status_code == 403
    assert "Client contacts cannot view internal team conversations" in exc_info.value.detail


@pytest.mark.asyncio
async def test_team_chat_non_internal_forbidden_post():
    """Non-internal client users are strictly forbidden (HTTP 403) from posting to Team Chat."""
    from unittest.mock import AsyncMock, MagicMock
    from fastapi import HTTPException
    from app.services.engagement import EngagementService
    from app.models.engagement import ClientEngagement
    from app.schemas.engagement import ChatMessageCreate

    org_id = uuid4()
    eng_id = uuid4()

    mock_eng = MagicMock(spec=ClientEngagement)
    mock_eng.id = eng_id
    mock_eng.organization_id = org_id

    db = AsyncMock()
    db.get.return_value = mock_eng

    payload = ChatMessageCreate(
        message="Client trying to breach internal team chat",
        conversation="internal",
    )

    # Mock sender identity returning is_internal=False
    sender_identity = (uuid4(), None, "Client Contact", "Representative", False)

    with pytest.raises(HTTPException) as exc_info:
        from unittest.mock import patch
        with patch.object(EngagementService, "resolve_sender_identity", return_value=sender_identity):
            await EngagementService.create_chat_message(
                db=db,
                organization_id=org_id,
                engagement_id=eng_id,
                payload=payload,
                current_user_id="client-auth-uuid",
            )
    assert exc_info.value.status_code == 403
    assert "Client contacts cannot post to internal team conversations" in exc_info.value.detail


@pytest.mark.asyncio
async def test_chat_ticket_store_conversation_separation():
    """ChatTicketStore stores and verifies conversation attribute on tickets."""
    from app.services.chat_ws import ChatTicketStore

    store = ChatTicketStore()
    org_id = uuid4()
    eng_id = uuid4()
    user_id = str(uuid4())

    # Issue ticket for Team Chat
    ticket_internal = await store.issue_ticket(
        user_id=user_id,
        org_id=org_id,
        engagement_id=eng_id,
        profile_id=None,
        user_name="Niladri Banerjee",
        user_role="CEO",
        is_internal=True,
        conversation="internal",
    )
    redeemed_internal = await store.redeem_ticket(ticket_internal, eng_id)
    assert redeemed_internal is not None
    assert redeemed_internal.conversation == "internal"
    assert redeemed_internal.is_internal is True

    # Issue ticket for Client Chat
    ticket_client = await store.issue_ticket(
        user_id="client-user-123",
        org_id=org_id,
        engagement_id=eng_id,
        profile_id=None,
        user_name="Client Partner",
        user_role="Client",
        is_internal=False,
        conversation="client",
    )
    redeemed_client = await store.redeem_ticket(ticket_client, eng_id)
    assert redeemed_client is not None
    assert redeemed_client.conversation == "client"
    assert redeemed_client.is_internal is False


@pytest.mark.asyncio
async def test_websocket_room_isolation_client_vs_team():
    """Messages broadcast to Client Chat never reach Team Chat connections, and vice versa."""
    from unittest.mock import AsyncMock, MagicMock
    from app.services.chat_ws import ChatTicket, EngagementConnectionManager

    manager = EngagementConnectionManager()
    eng_id = uuid4()
    org_id = uuid4()

    # 1. Connected client socket in Client Chat room
    ws_client = AsyncMock()
    ticket_client = ChatTicket(
        ticket="tk-client",
        user_id="client-1",
        org_id=org_id,
        engagement_id=eng_id,
        profile_id=None,
        user_name="Client User",
        user_role="Client",
        is_internal=False,
        conversation="client",
    )
    await manager.connect(eng_id, ws_client, ticket_client, conversation="client")

    # 2. Connected internal socket in Team Chat room
    ws_team = AsyncMock()
    ticket_team = ChatTicket(
        ticket="tk-team",
        user_id="member-1",
        org_id=org_id,
        engagement_id=eng_id,
        profile_id=None,
        user_name="Team Dev",
        user_role="Developer",
        is_internal=True,
        conversation="internal",
    )
    await manager.connect(eng_id, ws_team, ticket_team, conversation="internal")

    # Broadcast a Team Chat message
    team_msg = {
        "id": uuid4(),
        "visibility": "internal",
        "message": "Top secret internal roadmap discussion",
    }
    delivered_team = await manager.broadcast_message(eng_id, team_msg, conversation="internal")
    assert delivered_team == 1
    assert ws_team.send_text.called or ws_team.send_json.called
    assert not ws_client.send_text.called and not ws_client.send_json.called

    # Reset mocks
    ws_team.reset_mock()
    ws_client.reset_mock()

    # Broadcast a Client Chat message
    client_msg = {
        "id": uuid4(),
        "visibility": "client",
        "message": "Welcome everyone to Client Chat!",
    }
    delivered_client = await manager.broadcast_message(eng_id, client_msg, conversation="client")
    assert delivered_client == 1
    assert ws_client.send_text.called or ws_client.send_json.called
    assert not ws_team.send_text.called and not ws_team.send_json.called
