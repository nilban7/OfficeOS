"""PostgreSQL Row Level Security (RLS) integration tests for Procurement module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Vendors, Purchase Requests, Purchase Orders, and Items are strictly isolated by organization_id
2. Cross-tenant mutations (update/delete) are blocked by RLS
3. Missing user/org context denies access (fail-closed)
4. Database-level composite foreign keys prevent cross-tenant vendor/PR/PO association
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
    pr_a = uuid.uuid4()
    pr_b = uuid.uuid4()
    po_a = uuid.uuid4()
    po_b = uuid.uuid4()
    item_a = uuid.uuid4()
    item_b = uuid.uuid4()

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
        # Seed Purchase Requests
        await conn.execute(
            text(
                "INSERT INTO purchase_requests (id, organization_id, request_number, requester_id, purpose, estimated_amount, status) "
                "VALUES (:pr_a, :o_a, 'PR-A-001', :e_a, 'Purpose A', 1000.00, 'approved'), "
                "       (:pr_b, :o_b, 'PR-B-001', :e_b, 'Purpose B', 2000.00, 'approved')"
            ),
            {
                "pr_a": pr_a,
                "o_a": org_a_id,
                "e_a": emp_a,
                "pr_b": pr_b,
                "o_b": org_b_id,
                "e_b": emp_b,
            },
        )
        # Seed Purchase Orders
        await conn.execute(
            text(
                "INSERT INTO purchase_orders (id, organization_id, po_number, vendor_id, purchase_request_id, order_date, status, subtotal, tax_amount, total_amount) "
                "VALUES (:po_a, :o_a, 'PO-A-001', :v_a, :pr_a, '2026-09-29', 'draft', 1000.00, 100.00, 1100.00), "
                "       (:po_b, :o_b, 'PO-B-001', :v_b, :pr_b, '2026-09-29', 'draft', 2000.00, 200.00, 2200.00)"
            ),
            {
                "po_a": po_a,
                "o_a": org_a_id,
                "v_a": vendor_a,
                "pr_a": pr_a,
                "po_b": po_b,
                "o_b": org_b_id,
                "v_b": vendor_b,
                "pr_b": pr_b,
            },
        )
        # Seed Purchase Order Items
        await conn.execute(
            text(
                "INSERT INTO purchase_order_items (id, organization_id, purchase_order_id, item_description, quantity, unit, unit_price, tax_rate, tax_amount, line_total) "
                "VALUES (:it_a, :o_a, :po_a, 'Item A', 1, 'pcs', 1000.00, 10.00, 100.00, 1100.00), "
                "       (:it_b, :o_b, :po_b, 'Item B', 2, 'pcs', 1000.00, 10.00, 200.00, 2200.00)"
            ),
            {
                "it_a": item_a,
                "o_a": org_a_id,
                "po_a": po_a,
                "it_b": item_b,
                "o_b": org_b_id,
                "po_b": po_b,
            },
        )

    return {
        "org_a": org_a_id,
        "org_b": org_b_id,
        "user_a": auth_user_a,
        "user_b": auth_user_b,
        "vendor_a": vendor_a,
        "vendor_b": vendor_b,
        "pr_a": pr_a,
        "pr_b": pr_b,
        "po_a": po_a,
        "po_b": po_b,
        "item_a": item_a,
        "item_b": item_b,
    }


@pytest.mark.asyncio
async def test_procurement_rls_cross_tenant_isolation(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text(
                "SELECT set_config('app.user_id', :u, true), set_config('app.organization_id', :o, true)"
            ),
            {"u": str(ctx["user_a"]), "o": str(ctx["org_a"])},
        )

        # Tenant A selects vendors
        vendors = (await conn.execute(text("SELECT id FROM vendors"))).scalars().all()
        assert ctx["vendor_a"] in vendors
        assert ctx["vendor_b"] not in vendors

        # Tenant A selects purchase requests
        prs = (await conn.execute(text("SELECT id FROM purchase_requests"))).scalars().all()
        assert ctx["pr_a"] in prs
        assert ctx["pr_b"] not in prs

        # Tenant A selects purchase orders
        pos = (await conn.execute(text("SELECT id FROM purchase_orders"))).scalars().all()
        assert ctx["po_a"] in pos
        assert ctx["po_b"] not in pos

        # Tenant A selects PO items
        items = (await conn.execute(text("SELECT id FROM purchase_order_items"))).scalars().all()
        assert ctx["item_a"] in items
        assert ctx["item_b"] not in items

        # Tenant A cannot mutate Tenant B PO
        res = await conn.execute(
            text("UPDATE purchase_orders SET notes = 'Hacked' WHERE id = :id"),
            {"id": ctx["po_b"]},
        )
        assert res.rowcount == 0


@pytest.mark.asyncio
async def test_procurement_rls_missing_context_denies_all(rls_engine, multi_tenant_fixture):
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text(
                "SELECT set_config('app.user_id', '', true), set_config('app.organization_id', '', true)"
            )
        )

        # Default deny on all tables without context
        vendors = (await conn.execute(text("SELECT count(*) FROM vendors"))).scalar()
        assert vendors == 0

        prs = (await conn.execute(text("SELECT count(*) FROM purchase_requests"))).scalar()
        assert prs == 0

        pos = (await conn.execute(text("SELECT count(*) FROM purchase_orders"))).scalar()
        assert pos == 0

        items = (await conn.execute(text("SELECT count(*) FROM purchase_order_items"))).scalar()
        assert items == 0


@pytest.mark.asyncio
async def test_procurement_composite_fk_prevents_cross_tenant_association(
    rls_engine, multi_tenant_fixture
):
    ctx = multi_tenant_fixture

    # Cross-tenant PO creation: Org A PO referencing Org B Vendor
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO purchase_orders (id, organization_id, po_number, vendor_id, order_date, status, subtotal, tax_amount, total_amount) "
                    "VALUES (gen_random_uuid(), :o_a, 'PO-ILLEGAL', :v_b, '2026-09-29', 'draft', 100, 10, 110)"
                ),
                {"o_a": ctx["org_a"], "v_b": ctx["vendor_b"]},
            )

    # Cross-tenant PO Item creation: Org A PO Item referencing Org B PO
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO purchase_order_items (id, organization_id, purchase_order_id, item_description, quantity, unit, unit_price, tax_rate, tax_amount, line_total) "
                    "VALUES (gen_random_uuid(), :o_a, :po_b, 'Cross Tenant Item', 1, 'pcs', 100, 10, 10, 110)"
                ),
                {"o_a": ctx["org_a"], "po_b": ctx["po_b"]},
            )
