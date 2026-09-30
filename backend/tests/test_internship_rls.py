"""PostgreSQL Row Level Security (RLS) integration tests for Internship Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Internships, supervisors, and reviews are strictly isolated by organization_id
2. Cross-tenant mutations (update/delete) are blocked by RLS
3. Missing user/org context denies access (fail-closed)
4. Composite foreign keys prevent cross-tenant internship/supervisor association
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
    intern_a = uuid.uuid4()
    intern_b = uuid.uuid4()
    sup_a = uuid.uuid4()
    rev_a = uuid.uuid4()
    rev_b = uuid.uuid4()

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
        # 5. Seed Internships
        await conn.execute(
            text(
                "INSERT INTO internships (id, organization_id, title, code, intern_name, start_date, end_date, status) "
                "VALUES (:i_a, :o_a, 'Dev Intern', 'INT-A', 'Alice Intern', '2025-06-01', '2025-08-31', 'active'), "
                "       (:i_b, :o_b, 'QA Intern', 'INT-B', 'Bob Intern', '2025-06-01', '2025-08-31', 'planned')"
            ),
            {"i_a": intern_a, "o_a": org_a_id, "i_b": intern_b, "o_b": org_b_id},
        )
        # 6. Seed internship_supervisors (only for Org A)
        await conn.execute(
            text(
                "INSERT INTO internship_supervisors (id, organization_id, internship_id, employee_id, role) "
                "VALUES (:s_a, :o_a, :i_a, :e_a, 'primary')"
            ),
            {"s_a": sup_a, "o_a": org_a_id, "i_a": intern_a, "e_a": emp_a},
        )
        # 7. Seed internship_reviews
        await conn.execute(
            text(
                "INSERT INTO internship_reviews (id, organization_id, internship_id, review_date, rating, status) "
                "VALUES (:r_a, :o_a, :i_a, '2025-07-15', 4, 'submitted'), "
                "       (:r_b, :o_b, :i_b, '2025-07-20', 3, 'draft')"
            ),
            {
                "r_a": rev_a,
                "o_a": org_a_id,
                "i_a": intern_a,
                "r_b": rev_b,
                "o_b": org_b_id,
                "i_b": intern_b,
            },
        )

    yield {
        "org_a": org_a_id,
        "org_b": org_b_id,
        "user_a": auth_user_a,
        "user_b": auth_user_b,
        "emp_a": emp_a,
        "emp_b": emp_b,
        "intern_a": intern_a,
        "intern_b": intern_b,
        "sup_a": sup_a,
        "rev_a": rev_a,
        "rev_b": rev_b,
    }

    # Teardown
    async with rls_engine.begin() as conn:
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:a, :b)"), {"a": org_a_id, "b": org_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:a, :b)"), {"a": prof_a, "b": prof_b})


@pytest.mark.asyncio
async def test_internship_rls_tenant_isolation(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    async with rls_engine.connect() as conn:
        # Set Tenant A context
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text(f"SET LOCAL app.user_id = '{ctx['user_a']}'"))
        await conn.execute(text(f"SET LOCAL app.organization_id = '{ctx['org_a']}'"))

        # Verify Tenant A can only read Tenant A internships
        res_int = await conn.execute(text("SELECT id FROM internships"))
        int_ids = [r[0] for r in res_int.fetchall()]
        assert ctx["intern_a"] in int_ids
        assert ctx["intern_b"] not in int_ids

        # Verify Tenant A can only read Tenant A supervisors
        res_sup = await conn.execute(text("SELECT id FROM internship_supervisors"))
        sup_ids = [r[0] for r in res_sup.fetchall()]
        assert ctx["sup_a"] in sup_ids

        # Verify Tenant A can only read Tenant A reviews
        res_rev = await conn.execute(text("SELECT id FROM internship_reviews"))
        rev_ids = [r[0] for r in res_rev.fetchall()]
        assert ctx["rev_a"] in rev_ids
        assert ctx["rev_b"] not in rev_ids

        # Verify Tenant A cannot update Tenant B internship
        res_up_int = await conn.execute(
            text("UPDATE internships SET title = 'Hacked Internship' WHERE id = :id"),
            {"id": ctx["intern_b"]},
        )
        assert res_up_int.rowcount == 0

        # Verify Tenant A cannot update Tenant B review
        res_up_rev = await conn.execute(
            text("UPDATE internship_reviews SET feedback = 'Hacked Review' WHERE id = :id"),
            {"id": ctx["rev_b"]},
        )
        assert res_up_rev.rowcount == 0

        # Verify Tenant A cannot delete Tenant B review
        res_del_rev = await conn.execute(
            text("DELETE FROM internship_reviews WHERE id = :id"),
            {"id": ctx["rev_b"]},
        )
        assert res_del_rev.rowcount == 0


@pytest.mark.asyncio
async def test_internship_rls_missing_context_fails(rls_engine, multi_tenant_fixture):
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # Reset context
        await conn.execute(text("RESET app.user_id"))
        await conn.execute(text("RESET app.organization_id"))

        res_int = await conn.execute(text("SELECT id FROM internships"))
        assert len(res_int.fetchall()) == 0

        res_sup = await conn.execute(text("SELECT id FROM internship_supervisors"))
        assert len(res_sup.fetchall()) == 0

        res_rev = await conn.execute(text("SELECT id FROM internship_reviews"))
        assert len(res_rev.fetchall()) == 0


@pytest.mark.asyncio
async def test_internship_composite_fk_cross_tenant_prevention(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    # Attempt to create a supervisor in Org A referencing internship from Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO internship_supervisors (id, organization_id, internship_id, employee_id, role) "
                    "VALUES (gen_random_uuid(), :o_a, :i_b, :e_a, 'supervisor')"
                ),
                {"o_a": ctx["org_a"], "i_b": ctx["intern_b"], "e_a": ctx["emp_a"]},
            )


@pytest.mark.asyncio
async def test_internship_review_composite_fk_cross_tenant(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    # Attempt to create a review in Org A referencing internship from Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO internship_reviews (id, organization_id, internship_id, review_date, status) "
                    "VALUES (gen_random_uuid(), :o_a, :i_b, CURRENT_DATE, 'draft')"
                ),
                {"o_a": ctx["org_a"], "i_b": ctx["intern_b"]},
            )
