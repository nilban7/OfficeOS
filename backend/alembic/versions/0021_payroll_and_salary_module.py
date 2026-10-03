import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "0021_payroll_and_salary_module"
down_revision: Union[str, None] = "0020_saas_administration_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("payroll.view", "View payroll runs, salary structures, and summary metrics"),
    ("payroll.create", "Create employee salary structures and draft payroll runs"),
    ("payroll.update", "Update salary structures and payroll runs"),
    ("payroll.delete", "Delete or cancel draft payroll runs"),
    ("payroll.manage", "Process and calculate payroll runs"),
    ("payroll.approve", "Approve calculated payroll runs for disbursement"),
    ("payroll.pay", "Disburse and mark payroll runs and payslips as paid"),
    ("payslips.view", "View employee payslips across the organization"),
    ("payslips.view_own", "View personal employee payslips"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "hr_manager": [
        "payroll.view",
        "payroll.create",
        "payroll.update",
        "payroll.manage",
        "payroll.approve",
        "payslips.view",
        "payslips.view_own",
    ],
    "finance_manager": [
        "payroll.view",
        "payroll.approve",
        "payroll.pay",
        "payslips.view",
        "payslips.view_own",
    ],
    "department_manager": ["payroll.view", "payslips.view_own"],
    "project_manager": ["payslips.view_own"],
    "employee": ["payslips.view_own"],
}


def upgrade() -> None:
    # 1. Create salary_structures table
    op.create_table(
        "salary_structures",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("base_salary", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("hra", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("allowances", JSONB, nullable=False, server_default="{}"),
        sa.Column("deductions", JSONB, nullable=False, server_default="{}"),
        sa.Column("payment_frequency", sa.String(20), nullable=False, server_default="monthly"),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_salary_structures_org_id"),
        sa.UniqueConstraint("organization_id", "employee_id", name="uq_salary_structures_org_employee"),
        sa.CheckConstraint("base_salary >= 0", name="ck_salary_structures_base_salary"),
        sa.CheckConstraint("hra >= 0", name="ck_salary_structures_hra"),
        sa.CheckConstraint(
            "payment_frequency IN ('monthly', 'biweekly', 'weekly', 'annual')",
            name="ck_salary_structures_frequency",
        ),
    )
    op.execute("CREATE INDEX ix_salary_structures_organization_id ON salary_structures (organization_id)")
    op.execute("CREATE INDEX ix_salary_structures_employee_id ON salary_structures (employee_id)")

    # 2. Create payrolls table
    op.create_table(
        "payrolls",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("period_month", sa.Integer(), nullable=False),
        sa.Column("period_year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("total_gross_pay", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("total_deductions", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("total_net_pay", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("employee_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "processed_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "approved_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("payment_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_payrolls_org_id"),
        sa.UniqueConstraint("organization_id", "period_year", "period_month", name="uq_payrolls_org_period"),
        sa.CheckConstraint(
            "status IN ('draft', 'processing', 'approved', 'paid', 'cancelled')",
            name="ck_payrolls_status",
        ),
        sa.CheckConstraint("period_month BETWEEN 1 AND 12", name="ck_payrolls_period_month"),
        sa.CheckConstraint("period_year >= 2020", name="ck_payrolls_period_year"),
    )
    op.execute("CREATE INDEX ix_payrolls_organization_id ON payrolls (organization_id)")
    op.execute("CREATE INDEX ix_payrolls_period ON payrolls (period_year, period_month)")

    # 3. Create payslips table
    op.create_table(
        "payslips",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("payroll_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "employee_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("payslip_number", sa.String(50), nullable=False),
        sa.Column("base_salary", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("gross_pay", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("total_deductions", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("net_pay", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("paid_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("unpaid_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("earnings_breakdown", JSONB, nullable=False, server_default="{}"),
        sa.Column("deductions_breakdown", JSONB, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("payment_method", sa.String(50), nullable=False, server_default="bank_transfer"),
        sa.Column("payment_reference", sa.String(100), nullable=True),
        sa.Column("disbursement_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "id", name="uq_payslips_org_id"),
        sa.UniqueConstraint("organization_id", "payslip_number", name="uq_payslips_org_num"),
        sa.UniqueConstraint("organization_id", "payroll_id", "employee_id", name="uq_payslips_payroll_employee"),
        sa.ForeignKeyConstraint(
            ["organization_id", "payroll_id"],
            ["payrolls.organization_id", "payrolls.id"],
            ondelete="CASCADE",
            name="fk_payslips_payroll_org",
        ),
        sa.CheckConstraint("status IN ('draft', 'pending', 'paid', 'cancelled')", name="ck_payslips_status"),
        sa.CheckConstraint("net_pay >= 0", name="ck_payslips_net_pay"),
    )
    op.execute("CREATE INDEX ix_payslips_organization_id ON payslips (organization_id)")
    op.execute("CREATE INDEX ix_payslips_payroll_id ON payslips (payroll_id)")
    op.execute("CREATE INDEX ix_payslips_employee_id ON payslips (employee_id)")

    # 4. Enable Row Level Security (RLS)
    tables = ("salary_structures", "payrolls", "payslips")
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

    # 5. Seed Permissions
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 6. Map permissions to roles
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

    tables = ("payslips", "payrolls", "salary_structures")
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table}")
        op.drop_table(table)
