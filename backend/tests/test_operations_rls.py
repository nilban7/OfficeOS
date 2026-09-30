"""PostgreSQL Row Level Security (RLS) integration tests for Operations Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Operation tasks, checklists, and assignees are strictly isolated by organization_id
2. Cross-tenant mutations (update/delete/insert) are blocked by RLS
3. Missing user/org context denies access (fail-closed)
4. Composite foreign keys prevent cross-tenant task/checklist/assignee association
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
    task_a = uuid.uuid4()
    task_b = uuid.uuid4()
    chk_a = uuid.uuid4()
    chk_b = uuid.uuid4()
    asg_a = uuid.uuid4()

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
                "VALUES (:p_a, :u_a, 'a@test.com', 'Alice', 'A'), (:p_b, :u_b, 'b@test.com', 'Bob', 'B')"
            ),
            {"p_a": prof_a, "u_a": auth_user_a, "p_b": prof_b, "u_b": auth_user_b},
        )
        # 3. Seed Memberships
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) "
                "VALUES (gen_random_uuid(), :o_a, :p_a, 'active'), (gen_random_uuid(), :o_b, :p_b, 'active')"
            ),
            {"o_a": org_a_id, "p_a": prof_a, "o_b": org_b_id, "p_b": prof_b},
        )
        # 4. Seed Employees
        await conn.execute(
            text(
                "INSERT INTO employees (id, organization_id, employee_code, first_name, last_name, designation, date_of_joining) "
                "VALUES (:e_a, :o_a, 'EMP-A', 'Emp', 'A', 'Operator', '2025-01-01'), "
                "       (:e_b, :o_b, 'EMP-B', 'Emp', 'B', 'Operator', '2025-01-01')"
            ),
            {"e_a": emp_a, "o_a": org_a_id, "e_b": emp_b, "o_b": org_b_id},
        )
        # 5. Seed Operation Tasks
        await conn.execute(
            text(
                "INSERT INTO operation_tasks (id, organization_id, task_number, title, priority, status) "
                "VALUES (:t_a, :o_a, 'OPT-A', 'Task A', 'medium', 'open'), "
                "       (:t_b, :o_b, 'OPT-B', 'Task B', 'high', 'in_progress')"
            ),
            {"t_a": task_a, "o_a": org_a_id, "t_b": task_b, "o_b": org_b_id},
        )
        # 6. Seed Checklists
        await conn.execute(
            text(
                "INSERT INTO operation_checklists (id, organization_id, task_id, title, is_required) "
                "VALUES (:c_a, :o_a, :t_a, 'Check A', true), "
                "       (:c_b, :o_b, :t_b, 'Check B', false)"
            ),
            {"c_a": chk_a, "o_a": org_a_id, "t_a": task_a, "c_b": chk_b, "o_b": org_b_id, "t_b": task_b},
        )
        # 7. Seed Task Assignee (Org A)
        await conn.execute(
            text(
                "INSERT INTO operation_task_assignees (id, organization_id, task_id, employee_id, role) "
                "VALUES (:a_a, :o_a, :t_a, :e_a, 'primary')"
            ),
            {"a_a": asg_a, "o_a": org_a_id, "t_a": task_a, "e_a": emp_a},
        )

    yield {
        "org_a": org_a_id,
        "org_b": org_b_id,
        "user_a": auth_user_a,
        "user_b": auth_user_b,
        "emp_a": emp_a,
        "emp_b": emp_b,
        "task_a": task_a,
        "task_b": task_b,
        "chk_a": chk_a,
        "chk_b": chk_b,
        "asg_a": asg_a,
    }

    # Teardown
    async with rls_engine.begin() as conn:
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:a, :b)"), {"a": org_a_id, "b": org_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:a, :b)"), {"a": prof_a, "b": prof_b})


@pytest.mark.asyncio
async def test_operations_rls_tenant_isolation(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    async with rls_engine.connect() as conn:
        # Set Tenant A context
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text(f"SET LOCAL app.user_id = '{ctx['user_a']}'"))
        await conn.execute(text(f"SET LOCAL app.organization_id = '{ctx['org_a']}'"))

        # Verify Tenant A can only read Tenant A tasks
        res_tasks = await conn.execute(text("SELECT id FROM operation_tasks"))
        task_ids = [r[0] for r in res_tasks.fetchall()]
        assert ctx["task_a"] in task_ids
        assert ctx["task_b"] not in task_ids

        # Verify Tenant A can only read Tenant A checklists
        res_chk = await conn.execute(text("SELECT id FROM operation_checklists"))
        chk_ids = [r[0] for r in res_chk.fetchall()]
        assert ctx["chk_a"] in chk_ids
        assert ctx["chk_b"] not in chk_ids

        # Verify Tenant A can only read Tenant A assignees
        res_asg = await conn.execute(text("SELECT id FROM operation_task_assignees"))
        asg_ids = [r[0] for r in res_asg.fetchall()]
        assert ctx["asg_a"] in asg_ids

        # Verify Tenant A cannot update Tenant B task
        res_up = await conn.execute(
            text("UPDATE operation_tasks SET title = 'Hacked Task' WHERE id = :id"),
            {"id": ctx["task_b"]},
        )
        assert res_up.rowcount == 0

        # Verify Tenant A cannot delete Tenant B task
        res_del = await conn.execute(
            text("DELETE FROM operation_tasks WHERE id = :id"),
            {"id": ctx["task_b"]},
        )
        assert res_del.rowcount == 0


@pytest.mark.asyncio
async def test_operations_rls_missing_context_fails(rls_engine, multi_tenant_fixture):
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("RESET app.user_id"))
        await conn.execute(text("RESET app.organization_id"))

        res_tasks = await conn.execute(text("SELECT id FROM operation_tasks"))
        assert len(res_tasks.fetchall()) == 0

        res_chk = await conn.execute(text("SELECT id FROM operation_checklists"))
        assert len(res_chk.fetchall()) == 0

        res_asg = await conn.execute(text("SELECT id FROM operation_task_assignees"))
        assert len(res_asg.fetchall()) == 0


@pytest.mark.asyncio
async def test_operations_composite_foreign_keys_cross_tenant_prevention(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    # Attempt to create checklist in Org A referencing Task in Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO operation_checklists (id, organization_id, task_id, title) "
                    "VALUES (gen_random_uuid(), :o_a, :t_b, 'Cross Tenant Checklist')"
                ),
                {"o_a": ctx["org_a"], "t_b": ctx["task_b"]},
            )

    # Attempt to create assignee in Org A referencing Task in Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO operation_task_assignees (id, organization_id, task_id, employee_id, role) "
                    "VALUES (gen_random_uuid(), :o_a, :t_b, :e_a, 'assignee')"
                ),
                {"o_a": ctx["org_a"], "t_b": ctx["task_b"], "e_a": ctx["emp_a"]},
            )
