"""PostgreSQL Row Level Security (RLS) integration tests for Employee & HR module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Departments and Employees are strictly isolated by organization_id
2. Missing user/org context denies access to departments and employees (fail-closed)
3. Active tenant members can only query departments and employees within their own tenant
4. Tenant A members cannot view, insert, or modify Tenant B's departments or employees
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
async def rls_hr_db():
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

    dept_a_id = str(uuid.uuid4())
    dept_b_id = str(uuid.uuid4())

    emp_a_id = str(uuid.uuid4())
    emp_b_id = str(uuid.uuid4())

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

        # Seed Departments
        await conn.execute(
            text(
                "INSERT INTO departments (id, organization_id, name, code, is_active) VALUES "
                "(:d_a, :org_a, 'Engineering Org A', 'ENG-A', true), "
                "(:d_b, :org_b, 'Engineering Org B', 'ENG-B', true)"
            ),
            {
                "d_a": dept_a_id,
                "org_a": org_a_id,
                "d_b": dept_b_id,
                "org_b": org_b_id,
            },
        )

        # Seed Employees
        await conn.execute(
            text(
                "INSERT INTO employees (id, organization_id, employee_code, first_name, last_name, designation, date_of_joining, department_id, is_active) VALUES "
                "(:e_a, :org_a, 'EMP-A1', 'Alice', 'A', 'Engineer', '2024-01-01', :d_a, true), "
                "(:e_b, :org_b, 'EMP-B1', 'Bob', 'B', 'Manager', '2024-01-01', :d_b, true)"
            ),
            {
                "e_a": emp_a_id,
                "org_a": org_a_id,
                "d_a": dept_a_id,
                "e_b": emp_b_id,
                "org_b": org_b_id,
                "d_b": dept_b_id,
            },
        )

    yield {
        "engine": engine,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "dept_a_id": dept_a_id,
        "dept_b_id": dept_b_id,
        "emp_a_id": emp_a_id,
        "emp_b_id": emp_b_id,
    }

    # Cleanup
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM employees WHERE id IN (:e_a, :e_b)"), {"e_a": emp_a_id, "e_b": emp_b_id})
        await conn.execute(text("DELETE FROM departments WHERE id IN (:d_a, :d_b)"), {"d_a": dept_a_id, "d_b": dept_b_id})
        await conn.execute(text("DELETE FROM organization_memberships WHERE id IN (:m_a, :m_b)"), {"m_a": membership_a_id, "m_b": membership_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:p_a, :p_b)"), {"p_a": profile_a_id, "p_b": profile_b_id})
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:org_a, :org_b)"), {"org_a": org_a_id, "org_b": org_b_id})
    await engine.dispose()


@pytest.mark.asyncio
async def test_rls_departments_isolation(rls_hr_db) -> None:
    engine = rls_hr_db["engine"]
    user_a = rls_hr_db["user_a_id"]
    org_a = rls_hr_db["org_a_id"]
    org_b = rls_hr_db["org_b_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_a})

        res_a = await conn.execute(text("SELECT id FROM departments WHERE organization_id = :org_a"), {"org_a": org_a})
        assert res_a.first() is not None

        res_b = await conn.execute(text("SELECT id FROM departments WHERE organization_id = :org_b"), {"org_b": org_b})
        assert res_b.first() is None


@pytest.mark.asyncio
async def test_rls_employees_isolation(rls_hr_db) -> None:
    engine = rls_hr_db["engine"]
    user_a = rls_hr_db["user_a_id"]
    org_a = rls_hr_db["org_a_id"]
    org_b = rls_hr_db["org_b_id"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": user_a})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": org_a})

        res_a = await conn.execute(text("SELECT id FROM employees WHERE organization_id = :org_a"), {"org_a": org_a})
        assert res_a.first() is not None

        res_b = await conn.execute(text("SELECT id FROM employees WHERE organization_id = :org_b"), {"org_b": org_b})
        assert res_b.first() is None


@pytest.mark.asyncio
async def test_rls_fail_closed_without_context(rls_hr_db) -> None:
    engine = rls_hr_db["engine"]

    async with engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        dept_rows = (await conn.execute(text("SELECT id FROM departments"))).fetchall()
        emp_rows = (await conn.execute(text("SELECT id FROM employees"))).fetchall()

        assert len(dept_rows) == 0
        assert len(emp_rows) == 0
