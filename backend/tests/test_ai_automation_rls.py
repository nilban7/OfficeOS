"""Live PostgreSQL Row Level Security (RLS) integration tests for AI & Automation module.

Validates against real Supabase/PostgreSQL database:
1. Tenant A AI conversations and messages are strictly isolated from Tenant B.
2. Tenant A automations and execution logs cannot be viewed or triggered by Tenant B.
3. Missing or invalid tenant context fails closed (0 rows returned).
4. Tenant B operates cleanly in its own isolated scope.
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

pytestmark = pytest.mark.skipif(
    not os.getenv("RLS_TEST_DATABASE_URL"),
    reason="Set RLS_TEST_DATABASE_URL to run PostgreSQL cross-tenant integration tests",
)


@pytest.fixture
async def rls_engine():
    db_url = os.environ["RLS_TEST_DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    yield engine
    await engine.dispose()


@pytest.fixture
async def ai_auto_rls_fixture(rls_engine):
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()

    user_a_id = uuid.uuid4()
    user_b_id = uuid.uuid4()

    prof_a_id = uuid.uuid4()
    prof_b_id = uuid.uuid4()

    conv_a_id = uuid.uuid4()
    conv_b_id = uuid.uuid4()

    msg_a_id = uuid.uuid4()
    msg_b_id = uuid.uuid4()

    auto_a_id = uuid.uuid4()
    auto_b_id = uuid.uuid4()

    exec_a_id = uuid.uuid4()
    exec_b_id = uuid.uuid4()

    async with rls_engine.begin() as conn:
        # 1. Organizations
        await conn.execute(
            text(
                "INSERT INTO organizations (id, name, slug) VALUES "
                "(:id_a, 'AI Org A', :slug_a), (:id_b, 'AI Org B', :slug_b)"
            ),
            {
                "id_a": org_a_id,
                "slug_a": f"ai-org-a-{org_a_id.hex[:6]}",
                "id_b": org_b_id,
                "slug_b": f"ai-org-b-{org_b_id.hex[:6]}",
            },
        )

        # 2. Profiles
        await conn.execute(
            text(
                "INSERT INTO profiles (id, auth_user_id, email, first_name, last_name) VALUES "
                "(:p_a, :u_a, :email_a, 'Alice', 'AI'), (:p_b, :u_b, :email_b, 'Bob', 'Auto')"
            ),
            {
                "p_a": prof_a_id,
                "u_a": user_a_id,
                "email_a": f"alice-{user_a_id.hex[:6]}@example.com",
                "p_b": prof_b_id,
                "u_b": user_b_id,
                "email_b": f"bob-{user_b_id.hex[:6]}@example.com",
            },
        )

        # 3. Memberships
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) VALUES "
                "(gen_random_uuid(), :org_a, :prof_a, 'active'), "
                "(gen_random_uuid(), :org_b, :prof_b, 'active')"
            ),
            {
                "org_a": org_a_id,
                "prof_a": prof_a_id,
                "org_b": org_b_id,
                "prof_b": prof_b_id,
            },
        )

        # 4. AI Configurations
        await conn.execute(
            text(
                "INSERT INTO ai_configurations (id, organization_id, is_enabled, provider, model_name) VALUES "
                "(gen_random_uuid(), :org_a, true, 'system_gemini', 'gemini-1.5-flash'), "
                "(gen_random_uuid(), :org_b, true, 'system_gemini', 'gemini-1.5-flash')"
            ),
            {"org_a": org_a_id, "org_b": org_b_id},
        )

        # 5. AI Conversations
        await conn.execute(
            text(
                "INSERT INTO ai_conversations (id, organization_id, user_id, title) VALUES "
                "(:conv_a, :org_a, :prof_a, 'Alice Conv A'), "
                "(:conv_b, :org_b, :prof_b, 'Bob Conv B')"
            ),
            {
                "conv_a": conv_a_id,
                "org_a": org_a_id,
                "prof_a": prof_a_id,
                "conv_b": conv_b_id,
                "org_b": org_b_id,
                "prof_b": prof_b_id,
            },
        )

        # 6. AI Messages
        await conn.execute(
            text(
                "INSERT INTO ai_messages (id, organization_id, conversation_id, sender_role, content) VALUES "
                "(:msg_a, :org_a, :conv_a, 'user', 'Hello from Alice Org A'), "
                "(:msg_b, :org_b, :conv_b, 'user', 'Hello from Bob Org B')"
            ),
            {
                "msg_a": msg_a_id,
                "org_a": org_a_id,
                "conv_a": conv_a_id,
                "msg_b": msg_b_id,
                "org_b": org_b_id,
                "conv_b": conv_b_id,
            },
        )

        # 7. Automations
        await conn.execute(
            text(
                "INSERT INTO automations (id, organization_id, name, trigger_type, action_type, created_by_id) VALUES "
                "(:auto_a, :org_a, 'Workflow Org A', 'event', 'notification', :prof_a), "
                "(:auto_b, :org_b, 'Workflow Org B', 'schedule', 'audit_log', :prof_b)"
            ),
            {
                "auto_a": auto_a_id,
                "org_a": org_a_id,
                "prof_a": prof_a_id,
                "auto_b": auto_b_id,
                "org_b": org_b_id,
                "prof_b": prof_b_id,
            },
        )

        # 8. Automation Executions
        await conn.execute(
            text(
                "INSERT INTO automation_executions (id, organization_id, automation_id, triggered_by_id, trigger_source, status) VALUES "
                "(:exec_a, :org_a, :auto_a, :prof_a, 'manual', 'success'), "
                "(:exec_b, :org_b, :auto_b, :prof_b, 'schedule', 'success')"
            ),
            {
                "exec_a": exec_a_id,
                "org_a": org_a_id,
                "auto_a": auto_a_id,
                "prof_a": prof_a_id,
                "exec_b": exec_b_id,
                "org_b": org_b_id,
                "auto_b": auto_b_id,
                "prof_b": prof_b_id,
            },
        )

    yield {
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "prof_a_id": prof_a_id,
        "prof_b_id": prof_b_id,
        "conv_a_id": conv_a_id,
        "conv_b_id": conv_b_id,
        "auto_a_id": auto_a_id,
        "auto_b_id": auto_b_id,
    }

    # Teardown
    async with rls_engine.begin() as conn:
        await conn.execute(text("SELECT set_config('app.allow_audit_log_cleanup', 'true', true)"))
        await conn.execute(
            text("DELETE FROM organizations WHERE id IN (:id_a, :id_b)"),
            {"id_a": org_a_id, "id_b": org_b_id},
        )
        await conn.execute(
            text("DELETE FROM profiles WHERE id IN (:p_a, :p_b)"),
            {"p_a": prof_a_id, "p_b": prof_b_id},
        )


@pytest.mark.asyncio
async def test_ai_rls_tenant_a_isolation(rls_engine, ai_auto_rls_fixture):
    """Verify tenant A user sees only tenant A conversations and messages under RLS."""
    f = ai_auto_rls_fixture

    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["user_a_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_a_id"])})

        # Conversations count
        conv_count = (await conn.execute(text("SELECT count(*) FROM ai_conversations"))).scalar_one()
        assert conv_count == 1

        conv_title = (await conn.execute(text("SELECT title FROM ai_conversations"))).scalar_one()
        assert conv_title == "Alice Conv A"

        # Messages count
        msg_count = (await conn.execute(text("SELECT count(*) FROM ai_messages"))).scalar_one()
        assert msg_count == 1


@pytest.mark.asyncio
async def test_automation_rls_tenant_a_isolation(rls_engine, ai_auto_rls_fixture):
    """Verify tenant A user sees only tenant A automations and executions under RLS."""
    f = ai_auto_rls_fixture

    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["user_a_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_a_id"])})

        # Automations count
        auto_count = (await conn.execute(text("SELECT count(*) FROM automations"))).scalar_one()
        assert auto_count == 1

        auto_name = (await conn.execute(text("SELECT name FROM automations"))).scalar_one()
        assert auto_name == "Workflow Org A"

        # Executions count
        exec_count = (await conn.execute(text("SELECT count(*) FROM automation_executions"))).scalar_one()
        assert exec_count == 1


@pytest.mark.asyncio
async def test_ai_automation_rls_missing_context_fails_closed(rls_engine, ai_auto_rls_fixture):
    """Verify missing tenant context fails closed under RLS (0 rows returned)."""
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', '', true)"))
        await conn.execute(text("SELECT set_config('app.organization_id', '', true)"))

        conv_count = (await conn.execute(text("SELECT count(*) FROM ai_conversations"))).scalar_one()
        assert conv_count == 0

        auto_count = (await conn.execute(text("SELECT count(*) FROM automations"))).scalar_one()
        assert auto_count == 0

        exec_count = (await conn.execute(text("SELECT count(*) FROM automation_executions"))).scalar_one()
        assert exec_count == 0


@pytest.mark.asyncio
async def test_ai_automation_rls_tenant_b_isolated(rls_engine, ai_auto_rls_fixture):
    """Verify tenant B operates in its own isolated scope under RLS."""
    f = ai_auto_rls_fixture

    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["user_b_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_b_id"])})

        conv_title = (await conn.execute(text("SELECT title FROM ai_conversations"))).scalar_one()
        assert conv_title == "Bob Conv B"

        auto_name = (await conn.execute(text("SELECT name FROM automations"))).scalar_one()
        assert auto_name == "Workflow Org B"
