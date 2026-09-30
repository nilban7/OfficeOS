"""PostgreSQL Row Level Security (RLS) integration tests for Asset Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Assets and Asset Assignments are strictly isolated by organization_id
2. Cross-tenant mutations (update/delete) are blocked by RLS
3. Missing user/org context denies access (fail-closed)
4. Database-level composite foreign keys prevent cross-tenant vendor/PO/asset association
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
    asgn_a = uuid.uuid4()
    asgn_b = uuid.uuid4()

    async with rls_engine.begin() as conn:
        # Seed Tenant A & B Orgs
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
        # Seed Vendors
        await conn.execute(
            text(
                "INSERT INTO vendors (id, organization_id, vendor_code, name, is_active) "
                "VALUES (:v_a, :o_a, 'VND-A', 'Vendor A', true), (:v_b, :o_b, 'VND-B', 'Vendor B', true)"
            ),
            {"v_a": vendor_a, "o_a": org_a_id, "v_b": vendor_b, "o_b": org_b_id},
        )
        # Seed Assets
        await conn.execute(
            text(
                "INSERT INTO assets (id, organization_id, asset_code, name, category, vendor_id, status, condition) "
                "VALUES (:a_a, :o_a, 'AST-A', 'Asset A', 'it_equipment', :v_a, 'assigned', 'good'), "
                "       (:a_b, :o_b, 'AST-B', 'Asset B', 'it_equipment', :v_b, 'assigned', 'good')"
            ),
            {"a_a": asset_a, "o_a": org_a_id, "v_a": vendor_a, "a_b": asset_b, "o_b": org_b_id, "v_b": vendor_b},
        )
        # Seed Asset Assignments
        await conn.execute(
            text(
                "INSERT INTO asset_assignments (id, organization_id, asset_id, employee_id, assigned_date, is_active) "
                "VALUES (:as_a, :o_a, :a_a, :e_a, CURRENT_DATE, true), "
                "       (:as_b, :o_b, :a_b, :e_b, CURRENT_DATE, true)"
            ),
            {"as_a": asgn_a, "o_a": org_a_id, "a_a": asset_a, "e_a": emp_a, "as_b": asgn_b, "o_b": org_b_id, "a_b": asset_b, "e_b": emp_b},
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
        "asgn_a": asgn_a,
        "asgn_b": asgn_b,
    }

    # Teardown
    async with rls_engine.begin() as conn:
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:a, :b)"), {"a": org_a_id, "b": org_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:a, :b)"), {"a": prof_a, "b": prof_b})


@pytest.mark.asyncio
async def test_assets_rls_tenant_isolation(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    async with rls_engine.connect() as conn:
        # 1. Tenant A context
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text(f"SET LOCAL app.user_id = '{ctx['user_a']}'"))
        await conn.execute(text(f"SET LOCAL app.organization_id = '{ctx['org_a']}'"))

        # Verify Tenant A can only read Tenant A assets
        res_assets = await conn.execute(text("SELECT id FROM assets"))
        asset_ids = [r[0] for r in res_assets.fetchall()]
        assert ctx["asset_a"] in asset_ids
        assert ctx["asset_b"] not in asset_ids

        # Verify Tenant A can only read Tenant A assignments
        res_asgns = await conn.execute(text("SELECT id FROM asset_assignments"))
        asgn_ids = [r[0] for r in res_asgns.fetchall()]
        assert ctx["asgn_a"] in asgn_ids
        assert ctx["asgn_b"] not in asgn_ids

        # Verify Tenant A cannot update Tenant B asset
        res_update = await conn.execute(
            text("UPDATE assets SET name = 'Hacked' WHERE id = :id"),
            {"id": ctx["asset_b"]},
        )
        assert res_update.rowcount == 0

        # Verify Tenant A cannot delete Tenant B asset
        res_del = await conn.execute(
            text("DELETE FROM assets WHERE id = :id"),
            {"id": ctx["asset_b"]},
        )
        assert res_del.rowcount == 0


@pytest.mark.asyncio
async def test_assets_rls_missing_context_fails(rls_engine, multi_tenant_fixture):
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        # No context set
        await conn.execute(text("RESET app.user_id"))
        await conn.execute(text("RESET app.organization_id"))

        res_assets = await conn.execute(text("SELECT id FROM assets"))
        assert len(res_assets.fetchall()) == 0

        res_asgns = await conn.execute(text("SELECT id FROM asset_assignments"))
        assert len(res_asgns.fetchall()) == 0


@pytest.mark.asyncio
async def test_assets_composite_foreign_key_cross_tenant_prevention(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    # 1. Attempt to create an asset in Org A referencing Vendor from Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO assets (id, organization_id, asset_code, name, category, vendor_id) "
                    "VALUES (gen_random_uuid(), :o_a, 'AST-X', 'Invalid Vendor Asset', 'it_equipment', :v_b)"
                ),
                {"o_a": ctx["org_a"], "v_b": ctx["vendor_b"]},
            )

    # 2. Attempt to create an assignment in Org A referencing Asset from Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO asset_assignments (id, organization_id, asset_id, employee_id, assigned_date, is_active) "
                    "VALUES (gen_random_uuid(), :o_a, :a_b, :e_a, CURRENT_DATE, true)"
                ),
                {"o_a": ctx["org_a"], "a_b": ctx["asset_b"], "e_a": ctx["emp_a"]},
            )
