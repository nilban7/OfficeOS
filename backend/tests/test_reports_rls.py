"""Live PostgreSQL Row Level Security (RLS) integration tests for Reports & Dashboards module.

Validates against real Supabase/PostgreSQL database:
1. Tenant A report queries see Tenant A data.
2. Tenant A report queries cannot see Tenant B data.
3. Tenant A aggregate queries cannot leak Tenant B counts or sums.
4. Missing or invalid tenant context fails closed (0 rows returned / denied).
5. Cross-tenant filter injection (e.g. Org B branch_id) cannot escape tenant scope.
"""

import os
import uuid
from datetime import UTC, datetime

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
async def reports_rls_fixture(rls_engine):
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()

    user_a_id = uuid.uuid4()
    user_b_id = uuid.uuid4()

    prof_a_id = uuid.uuid4()
    prof_b_id = uuid.uuid4()

    branch_a_id = uuid.uuid4()
    branch_b_id = uuid.uuid4()

    emp_a_id = uuid.uuid4()
    emp_b_id = uuid.uuid4()

    today = datetime.now(UTC).date()

    async with rls_engine.begin() as conn:
        # 1. Organizations
        await conn.execute(
            text(
                "INSERT INTO organizations (id, name, slug) VALUES "
                "(:id_a, 'Reports Org A', :slug_a), (:id_b, 'Reports Org B', :slug_b)"
            ),
            {
                "id_a": org_a_id,
                "slug_a": f"rep-a-{org_a_id.hex[:6]}",
                "id_b": org_b_id,
                "slug_b": f"rep-b-{org_b_id.hex[:6]}",
            },
        )

        # 2. Profiles
        await conn.execute(
            text(
                "INSERT INTO profiles (id, auth_user_id, email, first_name, last_name) VALUES "
                "(:p_a, :u_a, 'user_a@reports.local', 'User', 'A'), "
                "(:p_b, :u_b, 'user_b@reports.local', 'User', 'B')"
            ),
            {
                "p_a": prof_a_id,
                "u_a": user_a_id,
                "p_b": prof_b_id,
                "u_b": user_b_id,
            },
        )

        # 3. Memberships
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) VALUES "
                "(gen_random_uuid(), :o_a, :p_a, 'active'), "
                "(gen_random_uuid(), :o_b, :p_b, 'active')"
            ),
            {
                "o_a": org_a_id,
                "p_a": prof_a_id,
                "o_b": org_b_id,
                "p_b": prof_b_id,
            },
        )

        # 4. Branches
        await conn.execute(
            text(
                "INSERT INTO branches (id, organization_id, name, code) VALUES "
                "(:b_a, :o_a, 'Branch A', 'BR-A'), "
                "(:b_b, :o_b, 'Branch B', 'BR-B')"
            ),
            {
                "b_a": branch_a_id,
                "o_a": org_a_id,
                "b_b": branch_b_id,
                "o_b": org_b_id,
            },
        )

        # 5. Employees
        await conn.execute(
            text(
                "INSERT INTO employees (id, organization_id, employee_code, first_name, last_name, designation, date_of_joining, status, branch_id) VALUES "
                "(:e_a, :o_a, 'EMP-A1', 'Alice', 'OrgA', 'Developer', :doj, 'active', :b_a), "
                "(:e_b, :o_b, 'EMP-B1', 'Bob', 'OrgB', 'Analyst', :doj, 'active', :b_b)"
            ),
            {
                "e_a": emp_a_id,
                "o_a": org_a_id,
                "e_b": emp_b_id,
                "o_b": org_b_id,
                "doj": today,
                "b_a": branch_a_id,
                "b_b": branch_b_id,
            },
        )

        # 6. Projects
        await conn.execute(
            text(
                "INSERT INTO projects (id, organization_id, project_code, name, status, budget) VALUES "
                "(gen_random_uuid(), :o_a, 'PRJ-A', 'Project Alpha', 'active', 50000.00), "
                "(gen_random_uuid(), :o_b, 'PRJ-B', 'Project Beta', 'active', 90000.00)"
            ),
            {"o_a": org_a_id, "o_b": org_b_id},
        )

    yield {
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "branch_a_id": branch_a_id,
        "branch_b_id": branch_b_id,
        "emp_a_id": emp_a_id,
        "emp_b_id": emp_b_id,
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
async def test_reports_rls_tenant_a_aggregate_isolation(rls_engine, reports_rls_fixture):
    """Verify tenant A user cannot count or aggregate tenant B employees or projects under RLS."""
    f = reports_rls_fixture

    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # Context set for Tenant A
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["user_a_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_a_id"])})

        # Count active employees
        emp_count = (await conn.execute(text("SELECT count(*) FROM employees"))).scalar_one()
        assert emp_count == 1  # Only EMP-A1, Bob from Org B is blocked by RLS

        # Sum project budget
        budget_sum = (await conn.execute(text("SELECT sum(budget) FROM projects"))).scalar_one()
        assert float(budget_sum) == 50000.00  # Only Project Alpha


@pytest.mark.asyncio
async def test_reports_rls_cross_tenant_filter_injection_blocked(rls_engine, reports_rls_fixture):
    """Verify passing Tenant B branch_id when executing as Tenant A yields 0 rows under RLS."""
    f = reports_rls_fixture

    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["user_a_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_a_id"])})

        # Query with branch_id = branch_b_id
        res = (
            await conn.execute(
                text("SELECT count(*) FROM employees WHERE branch_id = :bid"),
                {"bid": f["branch_b_id"]},
            )
        ).scalar_one()
        assert res == 0


@pytest.mark.asyncio
async def test_reports_rls_missing_context_fails_closed(rls_engine, reports_rls_fixture):
    """Verify query with missing user/org context fails closed under RLS (0 rows returned)."""
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # Missing context
        await conn.execute(text("SELECT set_config('app.user_id', '', true)"))
        await conn.execute(text("SELECT set_config('app.organization_id', '', true)"))

        emp_count = (await conn.execute(text("SELECT count(*) FROM employees"))).scalar_one()
        assert emp_count == 0

        prj_count = (await conn.execute(text("SELECT count(*) FROM projects"))).scalar_one()
        assert prj_count == 0


@pytest.mark.asyncio
async def test_reports_rls_tenant_b_isolated(rls_engine, reports_rls_fixture):
    """Verify Tenant B sees only Tenant B records and not Tenant A."""
    f = reports_rls_fixture

    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["user_b_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_b_id"])})

        emp_count = (await conn.execute(text("SELECT count(*) FROM employees"))).scalar_one()
        assert emp_count == 1

        budget_sum = (await conn.execute(text("SELECT sum(budget) FROM projects"))).scalar_one()
        assert float(budget_sum) == 90000.00
