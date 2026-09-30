"""Unit tests for AI Assistant API endpoints and service methods.

Uses mocked AsyncSession and service methods — no live DB required.
"""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import AuthenticatedUser
from app.dependencies.auth import get_current_user
from app.dependencies.tenant import get_tenant_session
from app.main import app
from app.schemas.ai import (
    AIConfigurationResponse,
    AIConversationDetailResponse,
    AIConversationResponse,
    AIMessageResponse,
    AIQueryResponse,
)
from app.services.ai import AIService


@pytest.fixture
def mock_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(uuid4()),
        email="developer@example.com",
        claims={},
    )


@pytest.fixture
def org_id() -> UUID:
    return uuid4()


@pytest.fixture
def sample_config(org_id: UUID) -> AIConfigurationResponse:
    return AIConfigurationResponse(
        id=uuid4(),
        organization_id=org_id,
        is_enabled=True,
        provider="system_gemini",
        model_name="gemini-1.5-flash",
        temperature=Decimal("0.70"),
        max_tokens_per_response=2048,
        allowed_capabilities=["workforce", "attendance", "leave", "projects"],
        daily_request_limit=1000,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def sample_conversation(org_id: UUID) -> AIConversationResponse:
    return AIConversationResponse(
        id=uuid4(),
        organization_id=org_id,
        user_id=uuid4(),
        title="Planning Discussion",
        is_archived=False,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        message_count=2,
        last_message="Here is the workforce status.",
    )


@pytest.fixture
def sample_conversation_detail(org_id: UUID) -> AIConversationDetailResponse:
    conv_id = uuid4()
    u_id = uuid4()
    msg1 = AIMessageResponse(
        id=uuid4(),
        conversation_id=conv_id,
        sender_role="user",
        content="What is our workforce status?",
        capability_used=None,
        tokens_used=6,
        metadata_json={},
        created_at=datetime.now(UTC),
    )
    msg2 = AIMessageResponse(
        id=uuid4(),
        conversation_id=conv_id,
        sender_role="assistant",
        content="We currently have 42 active employees.",
        capability_used="workforce",
        tokens_used=8,
        metadata_json={"capability_context": ["workforce"]},
        created_at=datetime.now(UTC),
    )
    return AIConversationDetailResponse(
        id=conv_id,
        organization_id=org_id,
        user_id=u_id,
        title="Planning Discussion",
        is_archived=False,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        messages=[msg1, msg2],
    )


# ---------------------------------------------------------------------------
# API Route Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_ai_configuration_authorized(
    mock_user: AuthenticatedUser, org_id: UUID, sample_config: AIConfigurationResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["ai.view"])),
            patch.object(AIService, "get_or_create_configuration", new=AsyncMock(return_value=sample_config)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    "/api/v1/ai/configuration",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["provider"] == "system_gemini"
            assert data["is_enabled"] is True
            assert "workforce" in data["allowed_capabilities"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_ai_configuration_forbidden_lacks_permission(mock_user: AuthenticatedUser, org_id: UUID):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=[])):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    "/api/v1/ai/configuration",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 403
            err_msg = res.json().get("detail") or res.json().get("error", {}).get("message", "")
            assert "ai.view" in err_msg
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_ai_configuration_admin_success(
    mock_user: AuthenticatedUser, org_id: UUID, sample_config: AIConfigurationResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["ai.manage"])),
            patch.object(AIService, "update_configuration", new=AsyncMock(return_value=sample_config)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.patch(
                    "/api/v1/ai/configuration",
                    headers={"X-Organization-Id": str(org_id)},
                    json={"is_enabled": True, "daily_request_limit": 500},
                )

            assert res.status_code == 200
            assert res.json()["data"]["daily_request_limit"] == 1000
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_conversations_authorized(
    mock_user: AuthenticatedUser, org_id: UUID, sample_conversation: AIConversationResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["ai.view"])),
            patch.object(AIService, "list_conversations", new=AsyncMock(return_value=[sample_conversation])),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    "/api/v1/ai/conversations",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 200
            data = res.json()["data"]
            assert len(data) == 1
            assert data[0]["title"] == "Planning Discussion"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_conversation_authorized(
    mock_user: AuthenticatedUser, org_id: UUID, sample_conversation_detail: AIConversationDetailResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["ai.use"])),
            patch.object(AIService, "create_conversation", new=AsyncMock(return_value=sample_conversation_detail)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.post(
                    "/api/v1/ai/conversations",
                    headers={"X-Organization-Id": str(org_id)},
                    json={"title": "Planning Discussion", "initial_message": "What is our workforce status?"},
                )

            assert res.status_code == 201
            data = res.json()["data"]
            assert data["title"] == "Planning Discussion"
            assert len(data["messages"]) == 2
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_conversation_detail(
    mock_user: AuthenticatedUser, org_id: UUID, sample_conversation_detail: AIConversationDetailResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["ai.view"])),
            patch.object(AIService, "get_conversation", new=AsyncMock(return_value=sample_conversation_detail)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get(
                    f"/api/v1/ai/conversations/{sample_conversation_detail.id}",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["id"] == str(sample_conversation_detail.id)
            assert len(data["messages"]) == 2
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_send_message_in_conversation(
    mock_user: AuthenticatedUser, org_id: UUID, sample_conversation_detail: AIConversationDetailResponse
):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["ai.use"])),
            patch.object(AIService, "send_message", new=AsyncMock(return_value=sample_conversation_detail)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.post(
                    f"/api/v1/ai/conversations/{sample_conversation_detail.id}/messages",
                    headers={"X-Organization-Id": str(org_id)},
                    json={"content": "Please break down headcount by department."},
                )

            assert res.status_code == 200
            data = res.json()["data"]
            assert len(data["messages"]) == 2
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_direct_query_endpoint(mock_user: AuthenticatedUser, org_id: UUID):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    mock_resp = AIQueryResponse(
        response="Here is the attendance report: 96.5% attendance rate.",
        capability_used="attendance",
        tokens_used=12,
        data_context_summary={"attendance": {"attendance_rate": "96.5"}},
    )

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["ai.use"])),
            patch.object(AIService, "direct_query", new=AsyncMock(return_value=mock_resp)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.post(
                    "/api/v1/ai/query",
                    headers={"X-Organization-Id": str(org_id)},
                    json={"prompt": "How is our attendance this month?"},
                )

            assert res.status_code == 200
            data = res.json()["data"]
            assert data["capability_used"] == "attendance"
            assert "96.5%" in data["response"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_conversation(mock_user: AuthenticatedUser, org_id: UUID):
    dummy_session = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_tenant_session] = lambda: dummy_session

    try:
        with (
            patch("app.dependencies.tenant.get_user_permissions", new=AsyncMock(return_value=["ai.view"])),
            patch.object(AIService, "delete_conversation", new=AsyncMock(return_value=None)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.delete(
                    f"/api/v1/ai/conversations/{uuid4()}",
                    headers={"X-Organization-Id": str(org_id)},
                )

            assert res.status_code == 200
            assert res.json()["success"] is True
    finally:
        app.dependency_overrides.clear()
