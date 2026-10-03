"""PostgreSQL Row Level Security (RLS) integration tests for Training Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Training programs, sessions, and enrollments are strictly isolated by organization_id
2. Cross-tenant mutations (update/delete) are blocked by RLS
3. Missing user/org context denies access (fail-closed)
4. Database-level composite foreign keys prevent cross-tenant program/session/employee association
5. Database-level unique constraint prevents duplicate active enrollments per program
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
    prog_a = uuid.uuid4()
    prog_b = uuid.uuid4()
    sess_a = uuid.uuid4()
    sess_b = uuid.uuid4()
    enr_a = uuid.uuid4()
    enr_b = uuid.uuid4()

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
                "VALUES (:e_a, :o_a, 'EMP-A', 'Emp', 'A', 'Engineer', '2025-01-01'), "
                "       (:e_b, :o_b, 'EMP-B', 'Emp', 'B', 'Engineer', '2025-01-01')"
            ),
            {"e_a": emp_a, "o_a": org_a_id, "e_b": emp_b, "o_b": org_b_id},
        )
        # 5. Seed Training Programs
        await conn.execute(
            text(
                "INSERT INTO training_programs (id, organization_id, code, title, category, delivery_mode, duration_hours, capacity, status) "
                "VALUES (:pr_a, :o_a, 'TRN-A', 'Security Awareness', 'security', 'online', 4.0, 30, 'published'), "
                "       (:pr_b, :o_b, 'TRN-B', 'Leadership Bootcamp', 'leadership', 'in_person', 16.0, 15, 'published')"
            ),
            {"pr_a": prog_a, "o_a": org_a_id, "pr_b": prog_b, "o_b": org_b_id},
        )
        # 6. Seed Training Sessions
        await conn.execute(
            text(
                "INSERT INTO training_sessions (id, organization_id, training_program_id, session_number, title, session_date, start_time, end_time, capacity, status) "
                "VALUES (:s_a, :o_a, :pr_a, 'SES-A1', 'Security Module 1', '2025-03-01', '09:00:00', '13:00:00', 30, 'scheduled'), "
                "       (:s_b, :o_b, :pr_b, 'SES-B1', 'Leadership Module 1', '2025-04-01', '10:00:00', '18:00:00', 15, 'scheduled')"
            ),
            {"s_a": sess_a, "o_a": org_a_id, "pr_a": prog_a, "s_b": sess_b, "o_b": org_b_id, "pr_b": prog_b},
        )
        # 7. Seed Training Enrollments
        await conn.execute(
            text(
                "INSERT INTO training_enrollments (id, organization_id, training_program_id, training_session_id, employee_id, enrollment_date, status) "
                "VALUES (:en_a, :o_a, :pr_a, :s_a, :e_a, CURRENT_DATE, 'enrolled'), "
                "       (:en_b, :o_b, :pr_b, :s_b, :e_b, CURRENT_DATE, 'enrolled')"
            ),
            {
                "en_a": enr_a,
                "o_a": org_a_id,
                "pr_a": prog_a,
                "s_a": sess_a,
                "e_a": emp_a,
                "en_b": enr_b,
                "o_b": org_b_id,
                "pr_b": prog_b,
                "s_b": sess_b,
                "e_b": emp_b,
            },
        )

    yield {
        "org_a": org_a_id,
        "org_b": org_b_id,
        "user_a": auth_user_a,
        "user_b": auth_user_b,
        "emp_a": emp_a,
        "emp_b": emp_b,
        "prog_a": prog_a,
        "prog_b": prog_b,
        "sess_a": sess_a,
        "sess_b": sess_b,
        "enr_a": enr_a,
        "enr_b": enr_b,
    }

    # Teardown
    async with rls_engine.begin() as conn:
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:a, :b)"), {"a": org_a_id, "b": org_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:a, :b)"), {"a": prof_a, "b": prof_b})


@pytest.mark.asyncio
async def test_training_rls_tenant_isolation(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    async with rls_engine.connect() as conn:
        # Set Tenant A context
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text(f"SET LOCAL app.user_id = '{ctx['user_a']}'"))
        await conn.execute(text(f"SET LOCAL app.organization_id = '{ctx['org_a']}'"))

        # Verify Tenant A can only read Tenant A programs
        res_prog = await conn.execute(text("SELECT id FROM training_programs"))
        prog_ids = [r[0] for r in res_prog.fetchall()]
        assert ctx["prog_a"] in prog_ids
        assert ctx["prog_b"] not in prog_ids

        # Verify Tenant A can only read Tenant A sessions
        res_sess = await conn.execute(text("SELECT id FROM training_sessions"))
        sess_ids = [r[0] for r in res_sess.fetchall()]
        assert ctx["sess_a"] in sess_ids
        assert ctx["sess_b"] not in sess_ids

        # Verify Tenant A can only read Tenant A enrollments
        res_enr = await conn.execute(text("SELECT id FROM training_enrollments"))
        enr_ids = [r[0] for r in res_enr.fetchall()]
        assert ctx["enr_a"] in enr_ids
        assert ctx["enr_b"] not in enr_ids

        # Verify Tenant A cannot update Tenant B program
        res_up_prog = await conn.execute(
            text("UPDATE training_programs SET title = 'Hacked Program' WHERE id = :id"),
            {"id": ctx["prog_b"]},
        )
        assert res_up_prog.rowcount == 0

        # Verify Tenant A cannot update Tenant B session
        res_up_sess = await conn.execute(
            text("UPDATE training_sessions SET title = 'Hacked Session' WHERE id = :id"),
            {"id": ctx["sess_b"]},
        )
        assert res_up_sess.rowcount == 0

        # Verify Tenant A cannot update Tenant B enrollment
        res_up_enr = await conn.execute(
            text("UPDATE training_enrollments SET notes = 'Hacked Enrollment' WHERE id = :id"),
            {"id": ctx["enr_b"]},
        )
        assert res_up_enr.rowcount == 0

        # Verify Tenant A cannot delete Tenant B enrollment or program
        res_del_enr = await conn.execute(
            text("DELETE FROM training_enrollments WHERE id = :id"),
            {"id": ctx["enr_b"]},
        )
        assert res_del_enr.rowcount == 0


@pytest.mark.asyncio
async def test_training_rls_missing_context_fails(rls_engine, multi_tenant_fixture):
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # Reset context
        await conn.execute(text("RESET app.user_id"))
        await conn.execute(text("RESET app.organization_id"))

        res_prog = await conn.execute(text("SELECT id FROM training_programs"))
        assert len(res_prog.fetchall()) == 0

        res_sess = await conn.execute(text("SELECT id FROM training_sessions"))
        assert len(res_sess.fetchall()) == 0

        res_enr = await conn.execute(text("SELECT id FROM training_enrollments"))
        assert len(res_enr.fetchall()) == 0


@pytest.mark.asyncio
async def test_training_composite_foreign_keys_cross_tenant_prevention(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    # 1. Attempt to create a session in Org A referencing Program from Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO training_sessions (id, organization_id, training_program_id, session_number, title, session_date, start_time, end_time, capacity, status) "
                    "VALUES (gen_random_uuid(), :o_a, :pr_b, 'SES-X', 'Invalid Session', '2025-03-01', '09:00:00', '13:00:00', 10, 'scheduled')"
                ),
                {"o_a": ctx["org_a"], "pr_b": ctx["prog_b"]},
            )

    # 2. Attempt to create an enrollment in Org A referencing Program from Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO training_enrollments (id, organization_id, training_program_id, employee_id, enrollment_date, status) "
                    "VALUES (gen_random_uuid(), :o_a, :pr_b, :e_a, CURRENT_DATE, 'enrolled')"
                ),
                {"o_a": ctx["org_a"], "pr_b": ctx["prog_b"], "e_a": ctx["emp_a"]},
            )

    # 3. Attempt to create an enrollment in Org A referencing Session from Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO training_enrollments (id, organization_id, training_program_id, training_session_id, employee_id, enrollment_date, status) "
                    "VALUES (gen_random_uuid(), :o_a, :pr_a, :s_b, :e_a, CURRENT_DATE, 'enrolled')"
                ),
                {"o_a": ctx["org_a"], "pr_a": ctx["prog_a"], "s_b": ctx["sess_b"], "e_a": ctx["emp_a"]},
            )


@pytest.mark.asyncio
async def test_training_duplicate_enrollment_unique_constraint(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    # Attempt to insert a second active enrollment for same employee and program
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO training_enrollments (id, organization_id, training_program_id, employee_id, enrollment_date, status) "
                    "VALUES (gen_random_uuid(), :o_a, :pr_a, :e_a, CURRENT_DATE, 'enrolled')"
                ),
                {"o_a": ctx["org_a"], "pr_a": ctx["prog_a"], "e_a": ctx["emp_a"]},
            )
