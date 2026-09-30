"""Create expense_categories, expenses, expense_items, and financial_transactions tables with RLS and canonical permissions.

Revision ID: 0014_finance_module
Revises: 0013_operations_module
Create Date: 2026-09-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0014_finance_module"
down_revision: Union[str, None] = "0013_operations_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("finance.view", "View expenses, financial transactions, and reports"),
    ("finance.create", "Create expenses and financial transactions"),
    ("finance.update", "Edit draft expenses and financial records"),
    ("finance.delete", "Delete draft expenses and financial records"),
    ("finance.approve", "Approve or reject submitted expense requests"),
    ("finance.manage", "Manage expense categories and financial settings"),
    ("finance.pay", "Process payments and mark expenses as paid"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "finance_manager": [p[0] for p in CANONICAL_PERMISSIONS],
    "hr_manager": [
        "finance.view",
        "finance.create",
        "finance.update",
        "finance.approve",
    ],
    "department_manager": [
        "finance.view",
        "finance.create",
        "finance.update",
    ],
    "project_manager": [
        "finance.view",
        "finance.create",
        "finance.update",
    ],
    "employee": [
        "finance.view",
        "finance.create",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Create expense_categories table
    op.create_table(
        "expense_categories",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("organization_id", "code", name="uq_expense_categories_org_code"),
        sa.UniqueConstraint("organization_id", "id", name="uq_expense_categories_org_id"),
    )
    op.execute("CREATE INDEX ix_expense_categories_organization_id ON expense_categories (organization_id)")
    op.execute("CREATE INDEX ix_expense_categories_code ON expense_categories (code)")
    op.execute("CREATE INDEX ix_expense_categories_is_active ON expense_categories (is_active)")

    # 2. Create expenses table
    op.create_table(
        "expenses",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expense_number", sa.String(50), nullable=False),
        sa.Column(
            "employee_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            uuid,
            sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            uuid,
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "client_id",
            uuid,
            sa.ForeignKey("clients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "branch_id",
            uuid,
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "reviewer_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewer_comment", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("organization_id", "expense_number", name="uq_expenses_org_number"),
        sa.UniqueConstraint("organization_id", "id", name="uq_expenses_org_id"),
        sa.CheckConstraint("amount >= 0", name="ck_expenses_amount_non_negative"),
        sa.CheckConstraint("tax_amount >= 0", name="ck_expenses_tax_non_negative"),
        sa.CheckConstraint("total_amount >= 0", name="ck_expenses_total_non_negative"),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'paid')",
            name="ck_expenses_status",
        ),
    )
    op.execute("CREATE INDEX ix_expenses_organization_id ON expenses (organization_id)")
    op.execute("CREATE INDEX ix_expenses_expense_number ON expenses (expense_number)")
    op.execute("CREATE INDEX ix_expenses_employee_id ON expenses (employee_id)")
    op.execute("CREATE INDEX ix_expenses_category_id ON expenses (category_id)")
    op.execute("CREATE INDEX ix_expenses_project_id ON expenses (project_id)")
    op.execute("CREATE INDEX ix_expenses_client_id ON expenses (client_id)")
    op.execute("CREATE INDEX ix_expenses_branch_id ON expenses (branch_id)")
    op.execute("CREATE INDEX ix_expenses_status ON expenses (status)")
    op.execute("CREATE INDEX ix_expenses_expense_date ON expenses (expense_date)")
    op.execute("CREATE INDEX ix_expenses_org_status ON expenses (organization_id, status)")

    # 3. Create expense_items table
    op.create_table(
        "expense_items",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expense_id", uuid, nullable=False),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1.00"),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("organization_id", "id", name="uq_expense_items_org_id"),
        sa.CheckConstraint("quantity > 0", name="ck_expense_items_quantity_positive"),
        sa.CheckConstraint("unit_price >= 0", name="ck_expense_items_unit_price_non_negative"),
        sa.CheckConstraint("tax_amount >= 0", name="ck_expense_items_tax_non_negative"),
        sa.CheckConstraint("line_total >= 0", name="ck_expense_items_line_total_non_negative"),
        sa.ForeignKeyConstraint(
            ["organization_id", "expense_id"],
            ["expenses.organization_id", "expenses.id"],
            ondelete="CASCADE",
            name="fk_expense_items_expense_org",
        ),
    )
    op.execute("CREATE INDEX ix_expense_items_organization_id ON expense_items (organization_id)")
    op.execute("CREATE INDEX ix_expense_items_expense_id ON expense_items (expense_id)")

    # 4. Create financial_transactions table
    op.create_table(
        "financial_transactions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("transaction_number", sa.String(50), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("transaction_type", sa.String(50), nullable=False),
        sa.Column("reference_type", sa.String(50), nullable=True),
        sa.Column("reference_id", uuid, nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("debit", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("credit", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column(
            "project_id",
            uuid,
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "client_id",
            uuid,
            sa.ForeignKey("clients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "vendor_id",
            uuid,
            sa.ForeignKey("vendors.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "employee_id",
            uuid,
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="posted",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("organization_id", "transaction_number", name="uq_financial_transactions_org_number"),
        sa.UniqueConstraint("organization_id", "id", name="uq_financial_transactions_org_id"),
        sa.CheckConstraint("debit >= 0", name="ck_financial_transactions_debit_non_negative"),
        sa.CheckConstraint("credit >= 0", name="ck_financial_transactions_credit_non_negative"),
        sa.CheckConstraint(
            "(debit > 0 OR credit > 0) AND NOT (debit > 0 AND credit > 0)",
            name="ck_financial_transactions_debit_or_credit",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'posted', 'void')",
            name="ck_financial_transactions_status",
        ),
    )
    op.execute("CREATE INDEX ix_financial_transactions_organization_id ON financial_transactions (organization_id)")
    op.execute("CREATE INDEX ix_financial_transactions_number ON financial_transactions (transaction_number)")
    op.execute("CREATE INDEX ix_financial_transactions_type ON financial_transactions (transaction_type)")
    op.execute("CREATE INDEX ix_financial_transactions_date ON financial_transactions (transaction_date)")
    op.execute("CREATE INDEX ix_financial_transactions_status ON financial_transactions (status)")
    op.execute("CREATE INDEX ix_financial_transactions_project_id ON financial_transactions (project_id)")
    op.execute("CREATE INDEX ix_financial_transactions_client_id ON financial_transactions (client_id)")
    op.execute("CREATE INDEX ix_financial_transactions_vendor_id ON financial_transactions (vendor_id)")
    op.execute("CREATE INDEX ix_financial_transactions_employee_id ON financial_transactions (employee_id)")

    # 5. Enable and FORCE RLS on all 4 tables
    tables = ("expense_categories", "expenses", "expense_items", "financial_transactions")
    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    for table in tables:
        op.execute(
            f"CREATE POLICY {table}_member ON {table} FOR ALL USING ("
            f"{user_context} AND {org_context} "
            f"AND organization_id = {org_setting_uuid} "
            f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
        )

    # 6. Seed Canonical Permissions
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 7. Map permissions to roles
    for role_name, perm_codes in ROLE_PERMISSIONS_MAPPING.items():
        for perm_code in perm_codes:
            op.execute(
                f"INSERT INTO role_permissions (role_id, permission_id) "
                f"SELECT r.id, p.id "
                f"FROM roles r, permissions p "
                f"WHERE r.name = '{role_name}' AND r.is_system = true AND p.code = '{perm_code}' "
                f"ON CONFLICT (role_id, permission_id) DO NOTHING"
            )


def downgrade() -> None:
    perm_codes_str = ", ".join(f"'{code}'" for code, _ in CANONICAL_PERMISSIONS)
    op.execute(
        f"DELETE FROM role_permissions WHERE permission_id IN ("
        f"SELECT id FROM permissions WHERE code IN ({perm_codes_str}))"
    )
    op.execute(f"DELETE FROM permissions WHERE code IN ({perm_codes_str})")

    tables = ("financial_transactions", "expense_items", "expenses", "expense_categories")
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
        op.drop_table(table)
