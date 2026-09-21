"""Cross-tenant PostgreSQL Row Level Security (RLS) integration tests.

These tests execute against a real PostgreSQL instance (e.g. Supabase or a local/ephemeral PostgreSQL)
with the OfficeOS foundation migration applied.

They verify:
1. Cross-tenant isolation (User A / Org A cannot access Org B branches, settings, or roles)
2. Missing user context fails closed (default deny on all protected tables)
3. Missing organization context denies tenant-owned business data
4. Invalid membership denies tenant-scoped access
5. Discovery exception allows only the authenticated user's active organizations and memberships
6. System roles are accessible within tenant context, but tenant-custom roles remain isolated
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
async def rls_db():
    db_url = os.environ["RLS_TEST_DATABASE_URL"]
    engine = create_async_engine(db_url)

    # Set up test data fixtures using a privileged session or standard insert
    user_a_id = str(uuid.uuid4())
    user_b_id = str(uuid.uuid4())
    org_a_id = str(uuid.uuid4())
    org_b_id = str(uuid.uuid4())
    branch_a_id = str(uuid.uuid4())
    branch_b_id = str(uuid.uuid4())
    profile_a_id = str(uuid.uuid4())
    profile_b_id = str(uuid.uuid4())
    membership_a_id = str(uuid.uuid4())
    membership_b_id = str(uuid.uuid4())
    role_a_id = str(uuid.uuid4())
    role_b_id = str(uuid.uuid4())

    async with engine.begin() as conn:
        # Seed test fixtures
        await conn.execute(
            text(
                "INSERT INTO organizations (id, name, slug, is_active) VALUES "
                "(:org_a, 'Org A', :slug_a, true), "
                "(:org_b, 'Org B', :slug_b, true)"
            ),
            {"org_a": org_a_id, "slug_a": f"org-a-{org_a_id[:8]}", "org_b": org_b_id, "slug_b": f"org-b-{org_b_id[:8]}"},
        )
        await conn.execute(
            text(
                "INSERT INTO profiles (id, auth_user_id, email, is_active) VALUES "
                "(:p_a, :u_a, 'user_a@example.com', true), "
                "(:p_b, :u_b, 'user_b@example.com', true)"
            ),
            {"p_a": profile_a_id, "u_a": user_a_id, "p_b": profile_b_id, "u_b": user_b_id},
        )
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) VALUES "
                "(:m_a, :org_a, :p_a, 'active'), "
                "(:m_b, :org_b, :p_b, 'active')"
            ),
            {"m_a": membership_a_id, "org_a": org_a_id, "p_a": profile_a_id, "m_b": membership_b_id, "org_b": org_b_id, "p_b": profile_b_id},
        )
        await conn.execute(
            text(
                "INSERT INTO branches (id, organization_id, name, code, is_active) VALUES "
                "(:b_a, :org_a, 'Branch Alpha', 'BRA', true), "
                "(:b_b, :org_b, 'Branch Beta', 'BRB', true)"
            ),
            {"b_a": branch_a_id, "org_a": org_a_id, "b_b": branch_b_id, "org_b": org_b_id},
        )
        await conn.execute(
            text(
                "INSERT INTO roles (id, organization_id, name, is_system) VALUES "
                "(:r_a, :org_a, 'Custom Role A', false), "
                "(:r_b, :org_b, 'Custom Role B', false)"
            ),
            {"r_a": role_a_id, "org_a": org_a_id, "r_b": role_b_id, "org_b": org_b_id},
        )

    context = {
        "engine": engine,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "branch_a_id": branch_a_id,
        "branch_b_id": branch_b_id,
        "role_a_id": role_a_id,
        "role_b_id": role_b_id,
    }

    yield context

    # Cleanup test fixtures
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:org_a, :org_b)"), {"org_a": org_a_id, "org_b": org_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:p_a, :p_b)"), {"p_a": profile_a_id, "p_b": profile_b_id})

    await engine.dispose()


@pytest.mark.asyncio
async def test_cross_tenant_branches_are_isolated(rls_db) -> None:
    engine = rls_db["engine"]
    user_a = rls_db["user_a_id"]
    org_a = rls_db["org_a_id"]
    org_b = rls_db["org_b_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # Set User A and Org A context
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_a})

        # Can access Org A's branch
        res_a = await conn.execute(text("SELECT id FROM branches WHERE organization_id = :org_a"), {"org_a": org_a})
        assert res_a.first() is not None

        # CANNOT access Org B's branch
        res_b = await conn.execute(text("SELECT id FROM branches WHERE organization_id = :org_b"), {"org_b": org_b})
        assert res_b.first() is None


@pytest.mark.asyncio
async def test_missing_user_context_fails_closed(rls_db) -> None:
    engine = rls_db["engine"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # No user_id or organization_id set
        res_profiles = await conn.execute(text("SELECT id FROM profiles"))
        assert res_profiles.first() is None

        res_orgs = await conn.execute(text("SELECT id FROM organizations"))
        assert res_orgs.first() is None

        res_branches = await conn.execute(text("SELECT id FROM branches"))
        assert res_branches.first() is None

        res_memberships = await conn.execute(text("SELECT id FROM organization_memberships"))
        assert res_memberships.first() is None


@pytest.mark.asyncio
async def test_missing_organization_context_denies_tenant_data(rls_db) -> None:
    engine = rls_db["engine"]
    user_a = rls_db["user_a_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # Only set user context (discovery mode)
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})

        # Tenant-scoped data must be denied
        res_branches = await conn.execute(text("SELECT id FROM branches"))
        assert res_branches.first() is None

        res_settings = await conn.execute(text("SELECT id FROM organization_settings"))
        assert res_settings.first() is None


@pytest.mark.asyncio
async def test_discovery_exception_scopes_to_own_memberships_and_orgs(rls_db) -> None:
    engine = rls_db["engine"]
    user_a = rls_db["user_a_id"]
    org_a = rls_db["org_a_id"]
    org_b = rls_db["org_b_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # Set only user context (discovery mode)
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})

        # Can see own organization
        res_org = await conn.execute(text("SELECT id FROM organizations WHERE id = :org_a"), {"org_a": org_a})
        assert res_org.first() is not None

        # Cannot see Org B
        res_other_org = await conn.execute(text("SELECT id FROM organizations WHERE id = :org_b"), {"org_b": org_b})
        assert res_other_org.first() is None

        # Memberships query returns only User A's membership
        res_m = await conn.execute(text("SELECT organization_id FROM organization_memberships"))
        rows = [str(r[0]) for r in res_m.fetchall()]
        assert org_a in rows
        assert org_b not in rows


@pytest.mark.asyncio
async def test_invalid_membership_selection_denies_tenant_access(rls_db) -> None:
    engine = rls_db["engine"]
    user_a = rls_db["user_a_id"]
    org_b = rls_db["org_b_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # User A tries to set Org B context without membership
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_b})

        # RLS must fail closed because User A has no active membership in Org B
        res_org = await conn.execute(text("SELECT id FROM organizations WHERE id = :org_b"), {"org_b": org_b})
        assert res_org.first() is None

        res_branch = await conn.execute(text("SELECT id FROM branches WHERE organization_id = :org_b"), {"org_b": org_b})
        assert res_branch.first() is None


@pytest.mark.asyncio
async def test_role_isolation_and_system_role_access(rls_db) -> None:
    engine = rls_db["engine"]
    user_a = rls_db["user_a_id"]
    org_a = rls_db["org_a_id"]
    role_a = rls_db["role_a_id"]
    role_b = rls_db["role_b_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_a})

        # System roles (organization_id IS NULL) are visible
        res_sys = await conn.execute(text("SELECT name FROM roles WHERE is_system = true"))
        assert len(res_sys.fetchall()) > 0

        # Own custom role is visible
        res_own = await conn.execute(text("SELECT id FROM roles WHERE id = :r_a"), {"r_a": role_a})
        assert res_own.first() is not None

        # Other organization's custom role is NOT visible
        res_other = await conn.execute(text("SELECT id FROM roles WHERE id = :r_b"), {"r_b": role_b})
        assert res_other.first() is None