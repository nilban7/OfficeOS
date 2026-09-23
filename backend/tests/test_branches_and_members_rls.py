"""PostgreSQL Row Level Security (RLS) integration tests for Organization module and Audit Logs.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Audit logs are strictly isolated by organization_id
2. Missing user/org context denies access to audit logs (fail-closed)
3. Active tenant members can view coworker profiles and membership lists within their tenant
4. Users cannot view coworker profiles or memberships of other tenants
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
async def rls_org_db():
    db_url = os.environ["RLS_TEST_DATABASE_URL"]
    engine = create_async_engine(db_url)

    user_a_id = str(uuid.uuid4())
    user_b_id = str(uuid.uuid4())
    user_c_id = str(uuid.uuid4())  # Coworker in Org A

    org_a_id = str(uuid.uuid4())
    org_b_id = str(uuid.uuid4())

    profile_a_id = str(uuid.uuid4())
    profile_b_id = str(uuid.uuid4())
    profile_c_id = str(uuid.uuid4())

    membership_a_id = str(uuid.uuid4())
    membership_b_id = str(uuid.uuid4())
    membership_c_id = str(uuid.uuid4())

    audit_a_id = str(uuid.uuid4())
    audit_b_id = str(uuid.uuid4())

    async with engine.begin() as conn:
        # Seed Organizations
        await conn.execute(
            text(
                "INSERT INTO organizations (id, name, slug, is_active) VALUES "
                "(:org_a, 'Org A', :slug_a, true), "
                "(:org_b, 'Org B', :slug_b, true)"
            ),
            {
                "org_a": org_a_id,
                "slug_a": f"org-a-{org_a_id[:8]}",
                "org_b": org_b_id,
                "slug_b": f"org-b-{org_b_id[:8]}",
            },
        )
        # Seed Profiles
        await conn.execute(
            text(
                "INSERT INTO profiles (id, auth_user_id, email, first_name, last_name, is_active) VALUES "
                "(:p_a, :u_a, 'user_a@example.com', 'User', 'A', true), "
                "(:p_b, :u_b, 'user_b@example.com', 'User', 'B', true), "
                "(:p_c, :u_c, 'user_c@example.com', 'User', 'C', true)"
            ),
            {
                "p_a": profile_a_id,
                "u_a": user_a_id,
                "p_b": profile_b_id,
                "u_b": user_b_id,
                "p_c": profile_c_id,
                "u_c": user_c_id,
            },
        )
        # Seed Memberships: User A & User C in Org A; User B in Org B
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) VALUES "
                "(:m_a, :org_a, :p_a, 'active'), "
                "(:m_c, :org_a, :p_c, 'active'), "
                "(:m_b, :org_b, :p_b, 'active')"
            ),
            {
                "m_a": membership_a_id,
                "m_c": membership_c_id,
                "m_b": membership_b_id,
                "org_a": org_a_id,
                "org_b": org_b_id,
                "p_a": profile_a_id,
                "p_c": profile_c_id,
                "p_b": profile_b_id,
            },
        )
        # Seed Branches
        branch_a_id = str(uuid.uuid4())
        branch_b_id = str(uuid.uuid4())
        await conn.execute(
            text(
                "INSERT INTO branches (id, organization_id, name, code, is_active) VALUES "
                "(:b_a, :org_a, 'Branch Org A', 'BOA01', true), "
                "(:b_b, :org_b, 'Branch Org B', 'BOB01', true)"
            ),
            {
                "b_a": branch_a_id,
                "b_b": branch_b_id,
                "org_a": org_a_id,
                "org_b": org_b_id,
            },
        )
        # Seed Audit Logs
        await conn.execute(
            text(
                "INSERT INTO audit_logs (id, organization_id, actor_id, action, entity_type) VALUES "
                "(:a_a, :org_a, :p_a, 'organizations.update', 'organization'), "
                "(:a_b, :org_b, :p_b, 'organizations.update', 'organization')"
            ),
            {
                "a_a": audit_a_id,
                "a_b": audit_b_id,
                "org_a": org_a_id,
                "org_b": org_b_id,
                "p_a": profile_a_id,
                "p_b": profile_b_id,
            },
        )

    context = {
        "engine": engine,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "user_c_id": user_c_id,
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "profile_a_id": profile_a_id,
        "profile_b_id": profile_b_id,
        "profile_c_id": profile_c_id,
        "branch_a_id": branch_a_id,
        "branch_b_id": branch_b_id,
        "audit_a_id": audit_a_id,
        "audit_b_id": audit_b_id,
    }

    yield context

    # Cleanup test fixtures
    async with engine.begin() as conn:
        await conn.execute(
            text("DELETE FROM organizations WHERE id IN (:org_a, :org_b)"),
            {"org_a": org_a_id, "org_b": org_b_id},
        )
        await conn.execute(
            text("DELETE FROM profiles WHERE id IN (:p_a, :p_b, :p_c)"),
            {"p_a": profile_a_id, "p_b": profile_b_id, "p_c": profile_c_id},
        )

    await engine.dispose()


@pytest.mark.asyncio
async def test_audit_logs_cross_tenant_isolation(rls_org_db) -> None:
    engine = rls_org_db["engine"]
    user_a = rls_org_db["user_a_id"]
    org_a = rls_org_db["org_a_id"]
    audit_a = rls_org_db["audit_a_id"]
    audit_b = rls_org_db["audit_b_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_a})

        # Can see Org A audit log
        res_a = await conn.execute(
            text("SELECT id FROM audit_logs WHERE id = :audit_a"),
            {"audit_a": audit_a},
        )
        assert res_a.first() is not None

        # CANNOT see Org B audit log
        res_b = await conn.execute(
            text("SELECT id FROM audit_logs WHERE id = :audit_b"),
            {"audit_b": audit_b},
        )
        assert res_b.first() is None


@pytest.mark.asyncio
async def test_coworker_profile_visibility_in_tenant(rls_org_db) -> None:
    engine = rls_org_db["engine"]
    user_a = rls_org_db["user_a_id"]
    org_a = rls_org_db["org_a_id"]
    profile_c = rls_org_db["profile_c_id"]
    profile_b = rls_org_db["profile_b_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_a})

        # User A CAN see coworker User C profile (both in Org A)
        res_c = await conn.execute(
            text("SELECT id FROM profiles WHERE id = :p_c"),
            {"p_c": profile_c},
        )
        assert res_c.first() is not None

        # User A CANNOT see User B profile (User B is in Org B)
        res_b = await conn.execute(
            text("SELECT id FROM profiles WHERE id = :p_b"),
            {"p_b": profile_b},
        )
        assert res_b.first() is None


@pytest.mark.asyncio
async def test_tenant_memberships_view(rls_org_db) -> None:
    engine = rls_org_db["engine"]
    user_a = rls_org_db["user_a_id"]
    org_a = rls_org_db["org_a_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_a})

        # User A can see all memberships in Org A (User A and User C)
        res = await conn.execute(
            text("SELECT profile_id FROM organization_memberships WHERE organization_id = :org_a"),
            {"org_a": org_a},
        )
        profile_ids = [str(r[0]) for r in res.fetchall()]
        assert rls_org_db["profile_a_id"] in profile_ids
        assert rls_org_db["profile_c_id"] in profile_ids
        assert rls_org_db["profile_b_id"] not in profile_ids


@pytest.mark.asyncio
async def test_branches_cross_tenant_isolation(rls_org_db) -> None:
    engine = rls_org_db["engine"]
    user_a = rls_org_db["user_a_id"]
    org_a = rls_org_db["org_a_id"]
    branch_a = rls_org_db["branch_a_id"]
    branch_b = rls_org_db["branch_b_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_a})

        # User A can see Org A branch
        res_a = await conn.execute(
            text("SELECT id FROM branches WHERE id = :b_a"),
            {"b_a": branch_a},
        )
        assert res_a.first() is not None

        # User A CANNOT see Org B branch
        res_b = await conn.execute(
            text("SELECT id FROM branches WHERE id = :b_b"),
            {"b_b": branch_b},
        )
        assert res_b.first() is None


@pytest.mark.asyncio
async def test_fail_closed_without_user_or_org_context(rls_org_db) -> None:
    engine = rls_org_db["engine"]
    user_a = rls_org_db["user_a_id"]
    org_a = rls_org_db["org_a_id"]
    audit_a = rls_org_db["audit_a_id"]
    branch_a = rls_org_db["branch_a_id"]

    # 1. No context at all
    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        res_audit = await conn.execute(text("SELECT id FROM audit_logs WHERE id = :audit_a"), {"audit_a": audit_a})
        assert res_audit.first() is None

        res_branch = await conn.execute(text("SELECT id FROM branches WHERE id = :b_a"), {"b_a": branch_a})
        assert res_branch.first() is None

    # 2. Missing org_id context
    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        res_audit = await conn.execute(text("SELECT id FROM audit_logs WHERE id = :audit_a"), {"audit_a": audit_a})
        assert res_audit.first() is None

        res_branch = await conn.execute(text("SELECT id FROM branches WHERE id = :b_a"), {"b_a": branch_a})
        assert res_branch.first() is None

    # 3. Missing user_id context
    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_a})
        res_audit = await conn.execute(text("SELECT id FROM audit_logs WHERE id = :audit_a"), {"audit_a": audit_a})
        assert res_audit.first() is None

        res_branch = await conn.execute(text("SELECT id FROM branches WHERE id = :b_a"), {"b_a": branch_a})
        assert res_branch.first() is None
