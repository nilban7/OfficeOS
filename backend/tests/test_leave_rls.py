"""PostgreSQL Row Level Security (RLS) integration tests for Leave & Holidays module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Leave types are strictly isolated by organization_id
2. Leave requests are strictly isolated by organization_id
3. Holidays are strictly isolated by organization_id
4. Missing user/org context denies access (fail-closed)
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
async def multi_tenant_fixture(rls_engine):
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()
    auth_user_a = uuid.uuid4()
    auth_user_b = uuid.uuid4()
    prof_a = uuid.uuid4()
    prof_b = uuid.uuid4()
    emp_a = uuid.uuid4()
    emp_b = uuid.uuid4()
    lt_a = uuid.uuid4()
    lt_b = uuid.uuid4()
    req_a = uuid.uuid4()
    req_b = uuid.uuid4()
    hol_a = uuid.uuid4()
    hol_b = uuid.uuid4()

    async with rls_engine.begin() as conn:
        # Seed Tenant A & B Orgs
        await conn.execute(
            text("INSERT INTO organizations (id, name, slug) VALUES (:id_a, 'Org A', :slug_a), (:id_b, 'Org B', :slug_b)"),
            {"id_a": org_a_id, "slug_a": f"org-a-{org_a_id.hex[:6]}", "id_b": org_b_id, "slug_b": f"org-b-{org_b_id.hex[:6]}"},
        )
        # Seed Profiles
        await conn.execute(
            text("INSERT INTO profiles (id, auth_user_id, email, first_name, last_name) VALUES (:p_a, :u_a, 'a@test.com', 'Alice', 'A'), (:p_b, :u_b, 'b@test.com', 'Bob', 'B')"),
            {"p_a": prof_a, "u_a": auth_user_a, "p_b": prof_b, "u_b": auth_user_b},
        )
        # Seed Memberships
        await conn.execute(
            text("INSERT INTO organization_memberships (id, organization_id, profile_id, status) VALUES (gen_random_uuid(), :o_a, :p_a, 'active'), (gen_random_uuid(), :o_b, :p_b, 'active')"),
            {"o_a": org_a_id, "p_a": prof_a, "o_b": org_b_id, "p_b": prof_b},
        )
        # Seed Employees
        await conn.execute(
            text("INSERT INTO employees (id, organization_id, employee_code, first_name, last_name, designation, date_of_joining) VALUES (:e_a, :o_a, 'EMP-A', 'Alice', 'A', 'Eng', '2025-01-01'), (:e_b, :o_b, 'EMP-B', 'Bob', 'B', 'Eng', '2025-01-01')"),
            {"e_a": emp_a, "o_a": org_a_id, "e_b": emp_b, "o_b": org_b_id},
        )
        # Seed Leave Types
        await conn.execute(
            text("INSERT INTO leave_types (id, organization_id, name, code, annual_allocation) VALUES (:lt_a, :o_a, 'Vacation A', 'VAC-A', 20), (:lt_b, :o_b, 'Vacation B', 'VAC-B', 15)"),
            {"lt_a": lt_a, "o_a": org_a_id, "lt_b": lt_b, "o_b": org_b_id},
        )
        # Seed Leave Requests
        await conn.execute(
            text("INSERT INTO leave_requests (id, organization_id, employee_id, leave_type_id, start_date, end_date, total_days, status) VALUES (:r_a, :o_a, :e_a, :lt_a, '2026-10-01', '2026-10-03', 3, 'pending'), (:r_b, :o_b, :e_b, :lt_b, '2026-10-05', '2026-10-08', 4, 'pending')"),
            {"r_a": req_a, "o_a": org_a_id, "e_a": emp_a, "lt_a": lt_a, "r_b": req_b, "o_b": org_b_id, "e_b": emp_b, "lt_b": lt_b},
        )
        # Seed Holidays
        await conn.execute(
            text("INSERT INTO holidays (id, organization_id, name, holiday_date) VALUES (:h_a, :o_a, 'Holiday A', '2026-12-25'), (:h_b, :o_b, 'Holiday B', '2026-12-25')"),
            {"h_a": hol_a, "o_a": org_a_id, "h_b": hol_b, "o_b": org_b_id},
        )

    yield {
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "auth_user_a": auth_user_a,
        "auth_user_b": auth_user_b,
        "lt_a": lt_a,
        "lt_b": lt_b,
        "req_a": req_a,
        "req_b": req_b,
        "hol_a": hol_a,
        "hol_b": hol_b,
    }

    # Cleanup
    async with rls_engine.begin() as conn:
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:o_a, :o_b)"), {"o_a": org_a_id, "o_b": org_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:p_a, :p_b)"), {"p_a": prof_a, "p_b": prof_b})


@pytest.mark.asyncio
async def test_rls_leave_and_holidays_isolation(rls_engine, multi_tenant_fixture):
    data = multi_tenant_fixture

    # Test as User A in Org A
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": str(data["auth_user_a"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": str(data["org_a_id"])})

        # Leave Types
        lt_res = await conn.execute(text("SELECT id FROM leave_types"))
        lt_ids = [r[0] for r in lt_res.fetchall()]
        assert data["lt_a"] in lt_ids
        assert data["lt_b"] not in lt_ids

        # Leave Requests
        req_res = await conn.execute(text("SELECT id FROM leave_requests"))
        req_ids = [r[0] for r in req_res.fetchall()]
        assert data["req_a"] in req_ids
        assert data["req_b"] not in req_ids

        # Holidays
        hol_res = await conn.execute(text("SELECT id FROM holidays"))
        hol_ids = [r[0] for r in hol_res.fetchall()]
        assert data["hol_a"] in hol_ids
        assert data["hol_b"] not in hol_ids


@pytest.mark.asyncio
async def test_rls_leave_fail_closed_without_context(rls_engine, multi_tenant_fixture):
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        lt_res = await conn.execute(text("SELECT id FROM leave_types"))
        assert len(lt_res.fetchall()) == 0

        req_res = await conn.execute(text("SELECT id FROM leave_requests"))
        assert len(req_res.fetchall()) == 0

        hol_res = await conn.execute(text("SELECT id FROM holidays"))
        assert len(hol_res.fetchall()) == 0

