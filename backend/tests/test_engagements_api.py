import pytest
from decimal import Decimal
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_engagement_overview_endpoint(async_client: AsyncClient, auth_headers: dict):
    response = await async_client.get("/api/v1/engagements/overview", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "active_engagements_count" in data
    assert "total_pipeline_value" in data
    assert "agreements_pending_signatures_count" in data


@pytest.mark.asyncio
async def test_engagement_lifecycle_flow(async_client: AsyncClient, auth_headers: dict):
    # 1. Create a client first to link
    client_res = await async_client.post(
        "/api/v1/clients",
        json={"name": "Acme Enterprise Corp", "client_code": "ACME-LIFECYCLE-1"},
        headers=auth_headers,
    )
    assert client_res.status_code == 201
    client_id = client_res.json()["id"]

    # 2. Create an Engagement
    eng_res = await async_client.post(
        "/api/v1/engagements",
        json={
            "client_id": client_id,
            "title": "Core ERP Cloud Migration",
            "contract_value": 450000.00,
            "currency": "INR",
        },
        headers=auth_headers,
    )
    assert eng_res.status_code == 201
    eng_data = eng_res.json()
    eng_id = eng_data["id"]
    assert eng_data["current_stage"] == "proposal"

    # 3. Create a Proposal
    prop_res = await async_client.post(
        f"/api/v1/engagements/{eng_id}/proposals",
        json={
            "title": "Phase 1 Scoping & Architectural Blueprint",
            "total_amount": 450000.00,
            "currency": "INR",
            "scope_of_work": "Full cloud modernization and Postgres multi-tenant setup",
        },
        headers=auth_headers,
    )
    assert prop_res.status_code == 201
    prop_id = prop_res.json()["id"]

    # 4. Create an Agreement (SOW)
    agr_res = await async_client.post(
        f"/api/v1/engagements/{eng_id}/agreements",
        json={
            "title": "Master Statement of Work #1",
            "agreement_type": "sow",
            "contract_value": 450000.00,
            "currency": "INR",
            "proposal_id": prop_id,
            "document_content": "This Agreement binds Acme Corp and OfficeOS...",
        },
        headers=auth_headers,
    )
    assert agr_res.status_code == 201
    agr_id = agr_res.json()["id"]
    assert agr_res.json()["status"] == "pending_signatures"

    # 5. Sign the Agreement (Internal Signer)
    sig_res = await async_client.post(
        f"/api/v1/engagements/agreements/{agr_id}/signatures",
        json={
            "signer_name": "Niladri (Director)",
            "signer_email": "director@officeos.local",
            "signer_role": "internal",
            "signature_data": "data:image/svg+xml;base64,PHN2Zz5zaWduYXR1cmU8L3N2Zz4=",
        },
        headers=auth_headers,
    )
    assert sig_res.status_code == 200
    assert sig_res.json()["status"] == "signed"

    # 6. Sign the Agreement (Client Signer) -> Unlocks Active Agreement
    client_sig_res = await async_client.post(
        f"/api/v1/engagements/agreements/{agr_id}/signatures",
        json={
            "signer_name": "John Doe (VP Tech)",
            "signer_email": "vp@acme.com",
            "signer_role": "client",
            "signature_data": "data:image/svg+xml;base64,PHN2Zz5jbGllbnRzaWduYXR1cmU8L3N2Zz4=",
        },
        headers=auth_headers,
    )
    assert client_sig_res.status_code == 200

    # 7. Kickoff Project Integration
    kickoff_res = await async_client.post(f"/api/v1/engagements/{eng_id}/kickoff", headers=auth_headers)
    assert kickoff_res.status_code == 200
    assert "project_id" in kickoff_res.json()

    # 8. Create a Weekly Status Report
    wr_res = await async_client.post(
        f"/api/v1/engagements/{eng_id}/weekly-reports",
        json={
            "week_start_date": "2026-10-15",
            "week_end_date": "2026-10-21",
            "executive_summary": "Architecture verified, core schemas provisioned on staging.",
            "accomplishments": ["Database migration completed", "FastAPI endpoints verified"],
            "next_week_plans": ["Deploy UAT test suite"],
            "delivery_health": "on_track",
            "is_published": True,
        },
        headers=auth_headers,
    )
    assert wr_res.status_code == 201

    # 9. Create a UAT Session & Test Case
    uat_res = await async_client.post(
        f"/api/v1/engagements/{eng_id}/uat-sessions",
        json={
            "session_title": "Sprint 1 Release Candidate",
            "build_version": "v1.0.0-rc1",
            "staging_url": "https://staging.officeos.app",
            "test_cases": [
                {
                    "title": "Verify Multi-tenant Login",
                    "instructions": "Navigate to login, enter credentials, verify org switcher",
                    "expected_outcome": "Redirects to dashboard with active org",
                }
            ],
        },
        headers=auth_headers,
    )
    assert uat_res.status_code == 201

    # 10. Report a Client Defect/Issue
    issue_res = await async_client.post(
        f"/api/v1/engagements/{eng_id}/issues",
        json={
            "title": "Custom logo upload fails on safari",
            "description": "Clicking upload logo results in 413 error",
            "issue_type": "bug",
            "priority": "high",
            "reported_by_name": "Jane Tester",
        },
        headers=auth_headers,
    )
    assert issue_res.status_code == 201

    # 11. Create a Scope Change Request
    cr_res = await async_client.post(
        f"/api/v1/engagements/{eng_id}/change-requests",
        json={
            "title": "Add WhatsApp notifications integration",
            "justification": "Client requested real-time WhatsApp alerts in addition to email",
            "scope_delta": "Provision Twilio WhatsApp sandbox and webhook handlers",
            "additional_cost": 45000.00,
            "additional_days": 5,
        },
        headers=auth_headers,
    )
    assert cr_res.status_code == 201

    # 12. Final Handover & Acceptance Sign-off
    handover_res = await async_client.post(
        f"/api/v1/engagements/{eng_id}/handover",
        json={
            "deliverables_accepted": True,
            "documentation_provided": True,
            "client_signoff_name": "John Doe (VP Tech)",
            "warranty_start_date": "2026-11-01",
            "warranty_end_date": "2027-05-01",
            "sla_tier": "Gold 24x7",
        },
        headers=auth_headers,
    )
    assert handover_res.status_code == 200
    assert handover_res.json()["deliverables_accepted"] is True

    # 13. Fetch Final Detail Workspace
    detail_res = await async_client.get(f"/api/v1/engagements/{eng_id}", headers=auth_headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["current_stage"] == "maintenance_support"
    assert detail["progress_percentage"] == 100
    assert len(detail["proposals"]) == 1
    assert len(detail["agreements"]) == 1
    assert len(detail["weekly_reports"]) == 1
    assert len(detail["uat_sessions"]) == 1
    assert len(detail["issues"]) == 1
    assert len(detail["change_requests"]) == 1
    assert detail["handover"] is not None
