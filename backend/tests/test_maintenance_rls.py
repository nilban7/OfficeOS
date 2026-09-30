"""PostgreSQL Row Level Security (RLS) integration tests for Maintenance Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Maintenance requests and records are strictly isolated by organization_id
2. Cross-tenant mutations (update/delete) are blocked by RLS
3. Missing user/org context denies access (fail-closed)
4. Database-level composite foreign keys prevent cross-tenant asset/request/vendor association
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
    vendor_a = uuid.uuid4()
    vendor_b = uuid.uuid4()
    asset_a = uuid.uuid4()
    asset_b = uuid.uuid4()
    req_a = uuid.uuid4()
    req_b = uuid.uuid4()
    rec_a = uuid.uuid4()
    rec_b = uuid.uuid4()

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
                "VALUES (:e_a, :o_a, 'EMP-A', 'Emp', 'A', 'Tech', '2025-01-01'), "
                "       (:e_b, :o_b, 'EMP-B', 'Emp', 'B', 'Tech', '2025-01-01')"
            ),
            {"e_a": emp_a, "o_a": org_a_id, "e_b": emp_b, "o_b": org_b_id},
        )
        # 5. Seed Vendors
        await conn.execute(
            text(
                "INSERT INTO vendors (id, organization_id, vendor_code, name, is_active) "
                "VALUES (:v_a, :o_a, 'VND-A', 'Vendor A', true), (:v_b, :o_b, 'VND-B', 'Vendor B', true)"
            ),
            {"v_a": vendor_a, "o_a": org_a_id, "v_b": vendor_b, "o_b": org_b_id},
        )
        # 6. Seed Assets
        await conn.execute(
            text(
                "INSERT INTO assets (id, organization_id, asset_code, name, category, vendor_id, status, condition) "
                "VALUES (:a_a, :o_a, 'AST-A', 'Asset A', 'facility', :v_a, 'available', 'good'), "
                "       (:a_b, :o_b, 'AST-B', 'Asset B', 'facility', :v_b, 'available', 'good')"
            ),
            {"a_a": asset_a, "o_a": org_a_id, "v_a": vendor_a, "a_b": asset_b, "o_b": org_b_id, "v_b": vendor_b},
        )
        # 7. Seed Maintenance Requests
        await conn.execute(
            text(
                "INSERT INTO maintenance_requests (id, organization_id, request_number, asset_id, requester_id, issue_title, priority, requested_date, status) "
                "VALUES (:r_a, :o_a, 'MR-001', :a_a, :e_a, 'AC Leak', 'high', CURRENT_DATE, 'submitted'), "
                "       (:r_b, :o_b, 'MR-002', :a_b, :e_b, 'Heater Issue', 'medium', CURRENT_DATE, 'submitted')"
            ),
            {"r_a": req_a, "o_a": org_a_id, "a_a": asset_a, "e_a": emp_a, "r_b": req_b, "o_b": org_b_id, "a_b": asset_b, "e_b": emp_b},
        )
        # 8. Seed Maintenance Records
        await conn.execute(
            text(
                "INSERT INTO maintenance_records (id, organization_id, record_number, maintenance_request_id, asset_id, technician_id, vendor_id, start_date, status, labor_cost, parts_cost, other_cost, total_cost) "
                "VALUES (:m_a, :o_a, 'MREC-001', :r_a, :a_a, :e_a, :v_a, CURRENT_DATE, 'scheduled', 100, 50, 0, 150), "
                "       (:m_b, :o_b, 'MREC-002', :r_b, :a_b, :e_b, :v_b, CURRENT_DATE, 'scheduled', 200, 100, 0, 300)"
            ),
            {"m_a": rec_a, "o_a": org_a_id, "r_a": req_a, "a_a": asset_a, "e_a": emp_a, "v_a": vendor_a, "m_b": rec_b, "o_b": org_b_id, "r_b": req_b, "a_b": asset_b, "e_b": emp_b, "v_b": vendor_b},
        )

    yield {
        "org_a": org_a_id,
        "org_b": org_b_id,
        "user_a": auth_user_a,
        "user_b": auth_user_b,
        "emp_a": emp_a,
        "emp_b": emp_b,
        "vendor_a": vendor_a,
        "vendor_b": vendor_b,
        "asset_a": asset_a,
        "asset_b": asset_b,
        "req_a": req_a,
        "req_b": req_b,
        "rec_a": rec_a,
        "rec_b": rec_b,
    }

    # Teardown
    async with rls_engine.begin() as conn:
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:a, :b)"), {"a": org_a_id, "b": org_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:a, :b)"), {"a": prof_a, "b": prof_b})


@pytest.mark.asyncio
async def test_maintenance_rls_tenant_isolation(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    async with rls_engine.connect() as conn:
        # 1. Set Tenant A context
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text(f"SET LOCAL app.user_id = '{ctx['user_a']}'"))
        await conn.execute(text(f"SET LOCAL app.organization_id = '{ctx['org_a']}'"))

        # Verify Tenant A can only read Tenant A requests
        res_req = await conn.execute(text("SELECT id FROM maintenance_requests"))
        req_ids = [r[0] for r in res_req.fetchall()]
        assert ctx["req_a"] in req_ids
        assert ctx["req_b"] not in req_ids

        # Verify Tenant A can only read Tenant A records
        res_rec = await conn.execute(text("SELECT id FROM maintenance_records"))
        rec_ids = [r[0] for r in res_rec.fetchall()]
        assert ctx["rec_a"] in rec_ids
        assert ctx["rec_b"] not in rec_ids

        # Verify Tenant A cannot update Tenant B request
        res_update_req = await conn.execute(
            text("UPDATE maintenance_requests SET issue_title = 'Hacked Title' WHERE id = :id"),
            {"id": ctx["req_b"]},
        )
        assert res_update_req.rowcount == 0

        # Verify Tenant A cannot update Tenant B record
        res_update_rec = await conn.execute(
            text("UPDATE maintenance_records SET description = 'Hacked Record' WHERE id = :id"),
            {"id": ctx["rec_b"]},
        )
        assert res_update_rec.rowcount == 0

        # Verify Tenant A cannot delete Tenant B request or record
        res_del_rec = await conn.execute(
            text("DELETE FROM maintenance_records WHERE id = :id"),
            {"id": ctx["rec_b"]},
        )
        assert res_del_rec.rowcount == 0


@pytest.mark.asyncio
async def test_maintenance_rls_missing_context_fails(rls_engine, multi_tenant_fixture):
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # Reset context
        await conn.execute(text("RESET app.user_id"))
        await conn.execute(text("RESET app.organization_id"))

        res_req = await conn.execute(text("SELECT id FROM maintenance_requests"))
        assert len(res_req.fetchall()) == 0

        res_rec = await conn.execute(text("SELECT id FROM maintenance_records"))
        assert len(res_rec.fetchall()) == 0


@pytest.mark.asyncio
async def test_maintenance_composite_foreign_keys_cross_tenant_prevention(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    # 1. Attempt to create a request in Org A referencing Asset from Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO maintenance_requests (id, organization_id, request_number, asset_id, requester_id, issue_title, priority, requested_date, status) "
                    "VALUES (gen_random_uuid(), :o_a, 'MR-X', :a_b, :e_a, 'Invalid AC', 'low', CURRENT_DATE, 'submitted')"
                ),
                {"o_a": ctx["org_a"], "a_b": ctx["asset_b"], "e_a": ctx["emp_a"]},
            )

    # 2. Attempt to create a record in Org A referencing Vendor from Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO maintenance_records (id, organization_id, record_number, asset_id, vendor_id, start_date, status, labor_cost, parts_cost, other_cost, total_cost) "
                    "VALUES (gen_random_uuid(), :o_a, 'MREC-X', :a_a, :v_b, CURRENT_DATE, 'scheduled', 0, 0, 0, 0)"
                ),
                {"o_a": ctx["org_a"], "a_a": ctx["asset_a"], "v_b": ctx["vendor_b"]},
            )

    # 3. Attempt to create a record in Org A referencing Maintenance Request from Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO maintenance_records (id, organization_id, record_number, maintenance_request_id, asset_id, start_date, status, labor_cost, parts_cost, other_cost, total_cost) "
                    "VALUES (gen_random_uuid(), :o_a, 'MREC-Y', :r_b, :a_a, CURRENT_DATE, 'scheduled', 0, 0, 0, 0)"
                ),
                {"o_a": ctx["org_a"], "r_b": ctx["req_b"], "a_a": ctx["asset_a"]},
            )
