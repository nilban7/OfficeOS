"""PostgreSQL Row Level Security (RLS) integration tests for Audit Logs Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Cross-tenant isolation (Tenant A user cannot see Tenant B audit logs).
2. Missing or invalid context fails closed (0 rows returned).
3. Immutability: UPDATE on audit_logs is rejected and raises an exception.
4. Immutability: DELETE on audit_logs is rejected and raises an exception.
5. Authorized INSERT under valid tenant context succeeds.
6. Cross-tenant INSERT is blocked by RLS.
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
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
async def audit_logs_rls_fixture(rls_engine):
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()

    auth_user_a1 = uuid.uuid4()
    auth_user_a2 = uuid.uuid4()
    auth_user_b = uuid.uuid4()

    prof_a1 = uuid.uuid4()
    prof_a2 = uuid.uuid4()
    prof_b = uuid.uuid4()

    log_a1 = uuid.uuid4()
    log_b1 = uuid.uuid4()

    async with rls_engine.begin() as conn:
        # 1. Seed Orgs
        await conn.execute(
            text(
                "INSERT INTO organizations (id, name, slug) VALUES (:id_a, 'Org A', :slug_a), (:id_b, 'Org B', :slug_b)"
            ),
            {
                "id_a": org_a_id,
                "slug_a": f"org-a-{org_a_id.hex[:6]}",
                "id_b": org_b_id,
                "slug_b": f"org-b-{org_b_id.hex[:6]}",
            },
        )
        # 2. Seed Profiles
        await conn.execute(
            text(
                "INSERT INTO profiles (id, auth_user_id, email, first_name, last_name) "
                "VALUES (:p_a1, :u_a1, 'a1@test.com', 'Alice', 'One'), "
                "       (:p_a2, :u_a2, 'a2@test.com', 'Aaron', 'Two'), "
                "       (:p_b, :u_b, 'b@test.com', 'Bob', 'Three')"
            ),
            {
                "p_a1": prof_a1,
                "u_a1": auth_user_a1,
                "p_a2": prof_a2,
                "u_a2": auth_user_a2,
                "p_b": prof_b,
                "u_b": auth_user_b,
            },
        )
        # 3. Seed Memberships
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) "
                "VALUES (gen_random_uuid(), :o_a, :p_a1, 'active'), "
                "       (gen_random_uuid(), :o_a, :p_a2, 'active'), "
                "       (gen_random_uuid(), :o_b, :p_b, 'active')"
            ),
            {
                "o_a": org_a_id,
                "p_a1": prof_a1,
                "p_a2": prof_a2,
                "o_b": org_b_id,
                "p_b": prof_b,
            },
        )
        # 4. Seed Audit Logs
        await conn.execute(
            text(
                "INSERT INTO audit_logs (id, organization_id, actor_id, action, entity_type, entity_id, details) "
                "VALUES (:log_a, :o_a, :p_a1, 'org.created', 'organization', :o_a, '{\"name\": \"Org A\"}'::jsonb), "
                "       (:log_b, :o_b, :p_b, 'org.created', 'organization', :o_b, '{\"name\": \"Org B\"}'::jsonb)"
            ),
            {
                "log_a": log_a1,
                "o_a": org_a_id,
                "p_a1": prof_a1,
                "log_b": log_b1,
                "o_b": org_b_id,
                "p_b": prof_b,
            },
        )

    yield {
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "auth_user_a1": auth_user_a1,
        "auth_user_a2": auth_user_a2,
        "auth_user_b": auth_user_b,
        "prof_a1": prof_a1,
        "prof_a2": prof_a2,
        "prof_b": prof_b,
        "log_a1": log_a1,
        "log_b1": log_b1,
    }

    # Teardown
    async with rls_engine.begin() as conn:
        await conn.execute(text("SELECT set_config('app.allow_audit_log_cleanup', 'true', true)"))
        await conn.execute(
            text("DELETE FROM audit_logs WHERE organization_id IN (:o_a, :o_b)"),
            {"o_a": org_a_id, "o_b": org_b_id},
        )
        await conn.execute(
            text("DELETE FROM organization_memberships WHERE organization_id IN (:o_a, :o_b)"),
            {"o_a": org_a_id, "o_b": org_b_id},
        )
        await conn.execute(
            text("DELETE FROM organizations WHERE id IN (:o_a, :o_b)"),
            {"o_a": org_a_id, "o_b": org_b_id},
        )
        await conn.execute(
            text("DELETE FROM profiles WHERE id IN (:p_a1, :p_a2, :p_b)"),
            {"p_a1": prof_a1, "p_a2": prof_a2, "p_b": prof_b},
        )


@pytest.mark.asyncio
async def test_audit_logs_rls_tenant_isolation(rls_engine, audit_logs_rls_fixture):
    """Verify Tenant A user can see Tenant A logs but never Tenant B logs."""
    f = audit_logs_rls_fixture

    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text("SELECT set_config('app.user_id', :uid, true)"),
            {"uid": str(f["auth_user_a1"])},
        )
        await conn.execute(
            text("SELECT set_config('app.organization_id', :oid, true)"),
            {"oid": str(f["org_a_id"])},
        )

        # 1. Query Tenant A log -> Visible
        res_a = await conn.execute(
            text("SELECT id, action FROM audit_logs WHERE id = :id"),
            {"id": f["log_a1"]},
        )
        row_a = res_a.fetchone()
        assert row_a is not None
        assert row_a[0] == f["log_a1"]

        # 2. Query Tenant B log -> Hidden (RLS filtering)
        res_b = await conn.execute(
            text("SELECT id, action FROM audit_logs WHERE id = :id"),
            {"id": f["log_b1"]},
        )
        assert res_b.fetchone() is None

        # 3. Listing audit logs returns only Tenant A logs
        res_all = await conn.execute(text("SELECT id FROM audit_logs"))
        ids = [r[0] for r in res_all.fetchall()]
        assert f["log_a1"] in ids
        assert f["log_b1"] not in ids


@pytest.mark.asyncio
async def test_audit_logs_rls_missing_context_fails(rls_engine, audit_logs_rls_fixture):
    """Verify querying audit_logs with missing user/tenant context returns 0 rows (fail closed)."""
    f = audit_logs_rls_fixture

    # Case 1: No context set at all
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        res = await conn.execute(text("SELECT id FROM audit_logs"))
        assert res.fetchall() == []

    # Case 2: Only user context, no org context
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text("SELECT set_config('app.user_id', :uid, true)"),
            {"uid": str(f["auth_user_a1"])},
        )
        res = await conn.execute(text("SELECT id FROM audit_logs"))
        assert res.fetchall() == []

    # Case 3: Only org context, no user context
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text("SELECT set_config('app.organization_id', :oid, true)"),
            {"oid": str(f["org_a_id"])},
        )
        res = await conn.execute(text("SELECT id FROM audit_logs"))
        assert res.fetchall() == []


@pytest.mark.asyncio
async def test_audit_logs_immutability_prevents_updates_and_deletes(
    rls_engine, audit_logs_rls_fixture
):
    """Verify that UPDATE and DELETE on audit_logs are rejected at both RLS and trigger levels."""
    f = audit_logs_rls_fixture

    # Layer 1: Normal authenticated user under RLS cannot mutate or delete (0 rows affected)
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text("SELECT set_config('app.user_id', :uid, true)"),
            {"uid": str(f["auth_user_a1"])},
        )
        await conn.execute(
            text("SELECT set_config('app.organization_id', :oid, true)"),
            {"oid": str(f["org_a_id"])},
        )

        res_update = await conn.execute(
            text("UPDATE audit_logs SET action = 'tampered' WHERE id = :id"),
            {"id": f["log_a1"]},
        )
        assert res_update.rowcount == 0

        res_delete = await conn.execute(
            text("DELETE FROM audit_logs WHERE id = :id"),
            {"id": f["log_a1"]},
        )
        assert res_delete.rowcount == 0

        # Row remains untouched
        res_check = await conn.execute(
            text("SELECT action FROM audit_logs WHERE id = :id"),
            {"id": f["log_a1"]},
        )
        assert res_check.scalar_one() == "org.created"

    # Layer 2: Even direct DB user without RLS is blocked by trigger unless cleanup flag is set
    async with rls_engine.connect() as conn:
        with pytest.raises(DBAPIError) as exc_update:
            await conn.execute(
                text("UPDATE audit_logs SET action = 'tampered' WHERE id = :id"),
                {"id": f["log_a1"]},
            )
        assert "immutable" in str(exc_update.value).lower()

        # Rollback aborted transaction before testing DELETE
        await conn.rollback()

        with pytest.raises(DBAPIError) as exc_delete:
            await conn.execute(
                text("DELETE FROM audit_logs WHERE id = :id"),
                {"id": f["log_a1"]},
            )
        assert "immutable" in str(exc_delete.value).lower()


@pytest.mark.asyncio
async def test_audit_logs_insert_and_cross_tenant_blocked(
    rls_engine, audit_logs_rls_fixture
):
    """Verify authorized INSERT succeeds for own tenant, but cross-tenant INSERT fails."""
    f = audit_logs_rls_fixture
    new_log_id = uuid.uuid4()
    cross_log_id = uuid.uuid4()

    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text("SELECT set_config('app.user_id', :uid, true)"),
            {"uid": str(f["auth_user_a1"])},
        )
        await conn.execute(
            text("SELECT set_config('app.organization_id', :oid, true)"),
            {"oid": str(f["org_a_id"])},
        )

        # 1. Valid insert for own tenant -> Succeeds
        await conn.execute(
            text(
                "INSERT INTO audit_logs (id, organization_id, actor_id, action, entity_type) "
                "VALUES (:id, :oid, :actor, 'document.view', 'document')"
            ),
            {
                "id": new_log_id,
                "oid": f["org_a_id"],
                "actor": f["prof_a1"],
            },
        )

        # Verify it was inserted
        check_res = await conn.execute(
            text("SELECT id FROM audit_logs WHERE id = :id"),
            {"id": new_log_id},
        )
        assert check_res.fetchone() is not None

        # 2. Cross-tenant insert attempt into Tenant B -> Blocked by RLS with_check
        with pytest.raises(DBAPIError):
            await conn.execute(
                text(
                    "INSERT INTO audit_logs (id, organization_id, actor_id, action, entity_type) "
                    "VALUES (:id, :oid, :actor, 'document.view', 'document')"
                ),
                {
                    "id": cross_log_id,
                    "oid": f["org_b_id"],
                    "actor": f["prof_a1"],
                },
            )
