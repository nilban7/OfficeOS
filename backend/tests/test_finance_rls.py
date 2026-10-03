"""PostgreSQL Row Level Security (RLS) integration tests for Finance Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Expense categories, expenses, expense items, and financial transactions are strictly isolated by organization_id
2. Cross-tenant mutations (update/delete) are blocked by RLS
3. Missing user/org context denies access (fail-closed)
4. Composite foreign keys prevent cross-tenant expense/item association
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
    cat_a = uuid.uuid4()
    cat_b = uuid.uuid4()
    exp_a = uuid.uuid4()
    exp_b = uuid.uuid4()
    item_a = uuid.uuid4()
    item_b = uuid.uuid4()
    tx_a = uuid.uuid4()
    tx_b = uuid.uuid4()

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
                "VALUES (:e_a, :o_a, 'EMP-A', 'Emp', 'A', 'Accountant', '2025-01-01'), "
                "       (:e_b, :o_b, 'EMP-B', 'Emp', 'B', 'Accountant', '2025-01-01')"
            ),
            {"e_a": emp_a, "o_a": org_a_id, "e_b": emp_b, "o_b": org_b_id},
        )
        # 5. Seed Categories
        await conn.execute(
            text(
                "INSERT INTO expense_categories (id, organization_id, name, code) "
                "VALUES (:c_a, :o_a, 'Cat A', 'CAT-A'), (:c_b, :o_b, 'Cat B', 'CAT-B')"
            ),
            {"c_a": cat_a, "o_a": org_a_id, "c_b": cat_b, "o_b": org_b_id},
        )
        # 6. Seed Expenses
        await conn.execute(
            text(
                "INSERT INTO expenses (id, organization_id, expense_number, employee_id, category_id, expense_date, amount, tax_amount, total_amount, status) "
                "VALUES (:exp_a, :o_a, 'EXP-A', :e_a, :c_a, '2025-03-01', 100.00, 10.00, 110.00, 'draft'), "
                "       (:exp_b, :o_b, 'EXP-B', :e_b, :c_b, '2025-03-01', 200.00, 20.00, 220.00, 'draft')"
            ),
            {
                "exp_a": exp_a,
                "o_a": org_a_id,
                "e_a": emp_a,
                "c_a": cat_a,
                "exp_b": exp_b,
                "o_b": org_b_id,
                "e_b": emp_b,
                "c_b": cat_b,
            },
        )
        # 7. Seed Expense Items
        await conn.execute(
            text(
                "INSERT INTO expense_items (id, organization_id, expense_id, description, quantity, unit_price, tax_amount, line_total, created_at) "
                "VALUES (:i_a, :o_a, :exp_a, 'Item A', 1.00, 100.00, 10.00, 110.00, NOW()), "
                "       (:i_b, :o_b, :exp_b, 'Item B', 2.00, 100.00, 20.00, 220.00, NOW())"
            ),
            {
                "i_a": item_a,
                "o_a": org_a_id,
                "exp_a": exp_a,
                "i_b": item_b,
                "o_b": org_b_id,
                "exp_b": exp_b,
            },
        )
        # 8. Seed Financial Transactions
        await conn.execute(
            text(
                "INSERT INTO financial_transactions (id, organization_id, transaction_number, transaction_date, transaction_type, description, debit, credit, status) "
                "VALUES (:tx_a, :o_a, 'TX-A', '2025-03-01', 'expense_payment', 'Payment A', 110.00, 0.00, 'posted'), "
                "       (:tx_b, :o_b, 'TX-B', '2025-03-01', 'expense_payment', 'Payment B', 220.00, 0.00, 'posted')"
            ),
            {
                "tx_a": tx_a,
                "o_a": org_a_id,
                "tx_b": tx_b,
                "o_b": org_b_id,
            },
        )

    yield {
        "org_a": org_a_id,
        "org_b": org_b_id,
        "user_a": auth_user_a,
        "user_b": auth_user_b,
        "emp_a": emp_a,
        "emp_b": emp_b,
        "cat_a": cat_a,
        "cat_b": cat_b,
        "exp_a": exp_a,
        "exp_b": exp_b,
        "item_a": item_a,
        "item_b": item_b,
        "tx_a": tx_a,
        "tx_b": tx_b,
    }

    # Teardown
    async with rls_engine.begin() as conn:
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:a, :b)"), {"a": org_a_id, "b": org_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:a, :b)"), {"a": prof_a, "b": prof_b})


@pytest.mark.asyncio
async def test_finance_rls_tenant_isolation(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    async with rls_engine.connect() as conn:
        # Set Tenant A context
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text(f"SET LOCAL app.user_id = '{ctx['user_a']}'"))
        await conn.execute(text(f"SET LOCAL app.organization_id = '{ctx['org_a']}'"))

        # 1. Categories
        res_cat = await conn.execute(text("SELECT id FROM expense_categories"))
        cat_ids = [r[0] for r in res_cat.fetchall()]
        assert ctx["cat_a"] in cat_ids
        assert ctx["cat_b"] not in cat_ids

        # 2. Expenses
        res_exp = await conn.execute(text("SELECT id FROM expenses"))
        exp_ids = [r[0] for r in res_exp.fetchall()]
        assert ctx["exp_a"] in exp_ids
        assert ctx["exp_b"] not in exp_ids

        # 3. Expense Items
        res_item = await conn.execute(text("SELECT id FROM expense_items"))
        item_ids = [r[0] for r in res_item.fetchall()]
        assert ctx["item_a"] in item_ids
        assert ctx["item_b"] not in item_ids

        # 4. Transactions
        res_tx = await conn.execute(text("SELECT id FROM financial_transactions"))
        tx_ids = [r[0] for r in res_tx.fetchall()]
        assert ctx["tx_a"] in tx_ids
        assert ctx["tx_b"] not in tx_ids

        # Verify cross-tenant update is blocked
        res_up = await conn.execute(
            text("UPDATE expenses SET description = 'Hacked' WHERE id = :id"),
            {"id": ctx["exp_b"]},
        )
        assert res_up.rowcount == 0

        # Verify cross-tenant delete is blocked
        res_del = await conn.execute(
            text("DELETE FROM financial_transactions WHERE id = :id"),
            {"id": ctx["tx_b"]},
        )
        assert res_del.rowcount == 0


@pytest.mark.asyncio
async def test_finance_rls_missing_context_fails(rls_engine, multi_tenant_fixture):
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("RESET app.user_id"))
        await conn.execute(text("RESET app.organization_id"))

        res_cat = await conn.execute(text("SELECT id FROM expense_categories"))
        assert len(res_cat.fetchall()) == 0

        res_exp = await conn.execute(text("SELECT id FROM expenses"))
        assert len(res_exp.fetchall()) == 0

        res_item = await conn.execute(text("SELECT id FROM expense_items"))
        assert len(res_item.fetchall()) == 0

        res_tx = await conn.execute(text("SELECT id FROM financial_transactions"))
        assert len(res_tx.fetchall()) == 0


@pytest.mark.asyncio
async def test_finance_composite_foreign_keys_cross_tenant_prevention(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    # Attempt to create expense item in Org A referencing Expense in Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO expense_items (id, organization_id, expense_id, description, quantity, unit_price, tax_amount, line_total, created_at) "
                    "VALUES (gen_random_uuid(), :o_a, :exp_b, 'Cross Tenant Item', 1.0, 50.0, 0.0, 50.0, NOW())"
                ),
                {"o_a": ctx["org_a"], "exp_b": ctx["exp_b"]},
            )
