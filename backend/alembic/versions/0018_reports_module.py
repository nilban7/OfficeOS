"""Reports & Dashboards permissions and role mappings.

Revision ID: 0018_reports_module
Revises: 0017_audit_logs_module
Create Date: 2026-09-30
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0018_reports_module"
down_revision: Union[str, None] = "0017_audit_logs_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("reports.view", "View standard organization reporting and operational dashboards"),
    ("reports.workforce", "View workforce, headcount, and employee distribution reports"),
    ("reports.attendance", "View organization-wide attendance trends and rate metrics"),
    ("reports.leave", "View leave utilization, requests, and balance analytics"),
    ("reports.procurement", "View procurement, purchase order, and vendor analytics"),
    ("reports.maintenance", "View maintenance costs, asset repair volume, and requests"),
    ("reports.finance", "View financial summaries, expense analytics, and cash flow trends"),
    ("reports.audit", "View audit trail activity distributions and security analytics"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "hr_manager": [
        "reports.view",
        "reports.workforce",
        "reports.attendance",
        "reports.leave",
    ],
    "finance_manager": [
        "reports.view",
        "reports.procurement",
        "reports.maintenance",
        "reports.finance",
    ],
    "project_manager": [
        "reports.view",
    ],
    "department_manager": [
        "reports.view",
        "reports.attendance",
        "reports.leave",
    ],
    "employee": [
        "reports.view",
    ],
}


def upgrade() -> None:
    # 1. Seed canonical reporting permissions
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 2. Map reporting permissions to canonical system roles
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
