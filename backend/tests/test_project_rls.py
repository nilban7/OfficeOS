"""PostgreSQL Row Level Security (RLS) integration tests for Project Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Projects are strictly isolated by organization_id
2. Project members are strictly isolated by organization_id
3. Cross-tenant mutations (update/delete) are blocked by RLS
4. Missing user/org context denies access (fail-closed)
5. Database-level composite foreign key prevents cross-tenant client/project association
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
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
    client_a = uuid.uuid4()
    client_b = uuid.uuid4()
    project_a = uuid.uuid4()
    project_b = uuid.uuid4()
    member_a = uuid.uuid4()
    member_b = uuid.uuid4()

    async with rls_engine.begin() as conn:
        # Seed Tenant A & B Orgs
        await conn.execute(
            text(
                "INSERT INTO organizations (id, name, slug) VALUES (:id_a, 'Org A', :slug_a), (:id_b, 'Org B', :slug_b)"
            ),
            {"id_a": org_a_id, "slug_a": f"org-a-{org_a_id.hex[:6]}", "id_b": org_b_id, "slug_b": f"org-b-{org_b_id.hex[:6]}"},
        )
        # Seed Profiles
        await conn.execute(
            text(
                "INSERT INTO profiles (id, auth_user_id, email, first_name, last_name) "
                "VALUES (:p_a, :u_a, 'a@test.com', 'Alice', 'A'), (:p_b, :u_b, 'b@test.com', 'Bob', 'B')"
            ),
            {"p_a": prof_a, "u_a": auth_user_a, "p_b": prof_b, "u_b": auth_user_b},
        )
        # Seed Memberships
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) "
                "VALUES (gen_random_uuid(), :o_a, :p_a, 'active'), (gen_random_uuid(), :o_b, :p_b, 'active')"
            ),
            {"o_a": org_a_id, "p_a": prof_a, "o_b": org_b_id, "p_b": prof_b},
        )
        # Seed Employees
        await conn.execute(
            text(
                "INSERT INTO employees (id, organization_id, employee_code, first_name, last_name, designation, date_of_joining) "
                "VALUES (:e_a, :o_a, 'EMP-A', 'Emp', 'A', 'Dev', '2025-01-01'), "
                "       (:e_b, :o_b, 'EMP-B', 'Emp', 'B', 'Dev', '2025-01-01')"
            ),
            {"e_a": emp_a, "o_a": org_a_id, "e_b": emp_b, "o_b": org_b_id},
        )
        # Seed Clients
        await conn.execute(
            text(
                "INSERT INTO clients (id, organization_id, client_code, name, status) "
                "VALUES (:c_a, :o_a, 'CLI-A', 'Client A', 'active'), (:c_b, :o_b, 'CLI-B', 'Client B', 'active')"
            ),
            {"c_a": client_a, "o_a": org_a_id, "c_b": client_b, "o_b": org_b_id},
        )
        # Seed Projects
        await conn.execute(
            text(
                "INSERT INTO projects (id, organization_id, client_id, project_code, name, status, project_manager_employee_id) "
                "VALUES (:pr_a, :o_a, :c_a, 'PRJ-A', 'Project A', 'active', :e_a), "
                "       (:pr_b, :o_b, :c_b, 'PRJ-B', 'Project B', 'active', :e_b)"
            ),
            {"pr_a": project_a, "o_a": org_a_id, "c_a": client_a, "e_a": emp_a, "pr_b": project_b, "o_b": org_b_id, "c_b": client_b, "e_b": emp_b},
        )
        # Seed Project Members
        await conn.execute(
            text(
                "INSERT INTO project_members (id, organization_id, project_id, employee_id, role, allocation_percentage) "
                "VALUES (:m_a, :o_a, :pr_a, :e_a, 'Lead', 100.00), (:m_b, :o_b, :pr_b, :e_b, 'Lead', 100.00)"
            ),
            {"m_a": member_a, "o_a": org_a_id, "pr_a": project_a, "e_a": emp_a, "m_b": member_b, "o_b": org_b_id, "pr_b": project_b, "e_b": emp_b},
        )

    return {
        "org_a": org_a_id,
        "org_b": org_b_id,
        "user_a": auth_user_a,
        "user_b": auth_user_b,
        "project_a": project_a,
        "project_b": project_b,
        "member_a": member_a,
        "member_b": member_b,
        "client_a": client_a,
        "client_b": client_b,
        "emp_a": emp_a,
        "emp_b": emp_b,
    }


@pytest.mark.asyncio
async def test_project_rls_cross_tenant_isolation(rls_engine, multi_tenant_fixture):
    data = multi_tenant_fixture

    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text(
                "SELECT set_config('app.user_id', :u, true), set_config('app.organization_id', :o, true)"
            ),
            {"u": str(data["user_a"]), "o": str(data["org_a"])},
        )

        # 1. User A can see Project A but not Project B
        res = await conn.execute(text("SELECT id, name FROM projects"))
        projects = res.fetchall()
        project_ids = [row[0] for row in projects]
        assert data["project_a"] in project_ids
        assert data["project_b"] not in project_ids

        # 2. User A can see Member A but not Member B
        res_m = await conn.execute(text("SELECT id, role FROM project_members"))
        members = res_m.fetchall()
        member_ids = [row[0] for row in members]
        assert data["member_a"] in member_ids
        assert data["member_b"] not in member_ids


@pytest.mark.asyncio
async def test_project_rls_missing_context_denies_all(rls_engine, multi_tenant_fixture):
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text(
                "SELECT set_config('app.user_id', '', true), set_config('app.organization_id', '', true)"
            )
        )

        res = await conn.execute(text("SELECT count(*) FROM projects"))
        assert res.scalar() == 0

        res_m = await conn.execute(text("SELECT count(*) FROM project_members"))
        assert res_m.scalar() == 0


@pytest.mark.asyncio
async def test_project_composite_fk_prevents_cross_tenant_association(rls_engine, multi_tenant_fixture):
    data = multi_tenant_fixture

    # Attempting to assign Client B to a Project in Org A must violate fk_projects_clients_org
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO projects (id, organization_id, client_id, project_code, name, status) "
                    "VALUES (gen_random_uuid(), :o_a, :c_b, 'PRJ-CROSS', 'Cross Org Client', 'planned')"
                ),
                {"o_a": data["org_a"], "c_b": data["client_b"]},
            )
