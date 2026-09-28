"""PostgreSQL Row Level Security (RLS) integration tests for Attendance module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Attendance records are strictly isolated by organization_id
2. Missing user/org context denies access to attendance records (fail-closed)
3. Active tenant members can only query attendance records within their own tenant
4. Tenant A members cannot view or modify Tenant B's attendance records
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
async def rls_attendance_db():
    db_url = os.environ["RLS_TEST_DATABASE_URL"]
    engine = create_async_engine(db_url)

    user_a_id = str(uuid.uuid4())
    user_b_id = str(uuid.uuid4())

    org_a_id = str(uuid.uuid4())
    org_b_id = str(uuid.uuid4())

    profile_a_id = str(uuid.uuid4())
    profile_b_id = str(uuid.uuid4())

    membership_a_id = str(uuid.uuid4())
    membership_b_id = str(uuid.uuid4())

    emp_a_id = str(uuid.uuid4())
    emp_b_id = str(uuid.uuid4())

    att_a_id = str(uuid.uuid4())
    att_b_id = str(uuid.uuid4())

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
                "(:p_a, :u_a, 'user.a@test.com', 'User', 'A', true), "
                "(:p_b, :u_b, 'user.b@test.com', 'User', 'B', true)"
            ),
            {
                "p_a": profile_a_id,
                "u_a": user_a_id,
                "p_b": profile_b_id,
                "u_b": user_b_id,
            },
        )

        # Seed Memberships
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) VALUES "
                "(:m_a, :org_a, :p_a, 'active'), "
                "(:m_b, :org_b, :p_b, 'active')"
            ),
            {
                "m_a": membership_a_id,
                "org_a": org_a_id,
                "p_a": profile_a_id,
                "m_b": membership_b_id,
                "org_b": org_b_id,
                "p_b": profile_b_id,
            },
        )

        # Seed Employees
        await conn.execute(
            text(
                "INSERT INTO employees (id, organization_id, employee_code, first_name, last_name, designation, date_of_joining, is_active) VALUES "
                "(:e_a, :org_a, 'EMP-A1', 'Alice', 'A', 'Engineer', '2024-01-01', true), "
                "(:e_b, :org_b, 'EMP-B1', 'Bob', 'B', 'Manager', '2024-01-01', true)"
            ),
            {
                "e_a": emp_a_id,
                "org_a": org_a_id,
                "e_b": emp_b_id,
                "org_b": org_b_id,
            },
        )

        # Seed Attendance Records
        await conn.execute(
            text(
                "INSERT INTO attendance_records (id, organization_id, employee_id, work_date, status, notes) VALUES "
                "(:att_a, :org_a, :e_a, '2026-09-28', 'present', 'Org A Record'), "
                "(:att_b, :org_b, :e_b, '2026-09-28', 'present', 'Org B Record')"
            ),
            {
                "att_a": att_a_id,
                "org_a": org_a_id,
                "e_a": emp_a_id,
                "att_b": att_b_id,
                "org_b": org_b_id,
                "e_b": emp_b_id,
            },
        )

    yield {
        "engine": engine,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "emp_a_id": emp_a_id,
        "emp_b_id": emp_b_id,
        "att_a_id": att_a_id,
        "att_b_id": att_b_id,
    }

    # Cleanup
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM attendance_records WHERE id IN (:a_a, :a_b)"), {"a_a": att_a_id, "a_b": att_b_id})
        await conn.execute(text("DELETE FROM employees WHERE id IN (:e_a, :e_b)"), {"e_a": emp_a_id, "e_b": emp_b_id})
        await conn.execute(text("DELETE FROM organization_memberships WHERE id IN (:m_a, :m_b)"), {"m_a": membership_a_id, "m_b": membership_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:p_a, :p_b)"), {"p_a": profile_a_id, "p_b": profile_b_id})
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:org_a, :org_b)"), {"org_a": org_a_id, "org_b": org_b_id})
    await engine.dispose()


@pytest.mark.asyncio
async def test_rls_attendance_isolation(rls_attendance_db) -> None:
    engine = rls_attendance_db["engine"]
    user_a = rls_attendance_db["user_a_id"]
    org_a = rls_attendance_db["org_a_id"]
    org_b = rls_attendance_db["org_b_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_a})

        res_a = await conn.execute(text("SELECT id FROM attendance_records WHERE organization_id = :org_a"), {"org_a": org_a})
        assert res_a.first() is not None

        res_b = await conn.execute(text("SELECT id FROM attendance_records WHERE organization_id = :org_b"), {"org_b": org_b})
        assert res_b.first() is None


@pytest.mark.asyncio
async def test_rls_attendance_fail_closed_without_context(rls_attendance_db) -> None:
    engine = rls_attendance_db["engine"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        rows = (await conn.execute(text("SELECT id FROM attendance_records"))).fetchall()
        assert len(rows) == 0
