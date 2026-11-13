"""production rbac director role and osofficesupport superowner update

Revision ID: 0038_prod_rbac_director
Revises: 0037_employee_biometrics
Create Date: 2026-11-13
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0038_prod_rbac_director"
down_revision: Union[str, None] = "0037_employee_biometrics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SELF_SERVICE_PERMISSIONS = [
    ("attendance.view_own", "View own attendance logs and status"),
    ("leave.view_own", "View own leave balances and requests"),
    ("assets.view_own", "View hardware and assets allocated to self"),
    ("payslips.view_own", "View and download own salary payslips"),
    ("reimbursements.view_own", "View status of own reimbursement claims"),
    ("travel.view_own", "View status of own travel requests"),
    ("training.view_own", "View own enrolled training programs"),
]

DIRECTOR_PERMISSIONS = [
    "reports.view",
    "reports.workforce",
    "reports.attendance",
    "reports.leave",
    "reports.procurement",
    "reports.maintenance",
    "reports.finance",
    "reports.audit",
    "ai.view",
    "ai.use",
    "organizations.view",
    "branches.view",
    "departments.view",
    "roles.view",
    "members.view",
    "employees.view",
    "attendance.view",
    "leave.view",
    "leave.approve",
    "payroll.view",
    "payslips.view",
    "reimbursements.view",
    "reimbursements.approve",
    "travel.view",
    "travel.approve",
    "training.view",
    "internships.view",
    "clients.view",
    "engagements.view",
    "projects.view",
    "procurement.view",
    "procurement.approve",
    "assets.view",
    "maintenance.view",
    "operations.view",
    "finance.view",
    "finance.approve",
    "documents.view",
    "documents.download",
    "notifications.view",
    "notifications.mark_read",
    "audit_logs.view",
]

EMPLOYEE_PERMISSIONS = [
    "attendance.view",
    "attendance.view_own",
    "attendance.create",
    "attendance.update",
    "leave.view",
    "leave.view_own",
    "leave.request",
    "leave.cancel",
    "assets.view",
    "assets.view_own",
    "payslips.view_own",
    "reimbursements.view",
    "reimbursements.view_own",
    "reimbursements.create",
    "travel.view",
    "travel.view_own",
    "travel.create",
    "training.view",
    "training.view_own",
    "training.enroll",
    "notifications.view",
    "notifications.mark_read",
    "notifications.preferences",
    "documents.view",
    "documents.download",
]


def upgrade() -> None:
    # 1. Ensure director role exists
    op.execute("""
        INSERT INTO roles (id, name, description, is_system)
        SELECT gen_random_uuid(), 'director', 'Executive Director with high-level operational and financial oversight', true
        WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'director' AND is_system = true);
    """)

    # 2. Seed self-service permissions
    for code, desc in SELF_SERVICE_PERMISSIONS:
        escaped_desc = desc.replace("'", "''")
        op.execute(f"""
            INSERT INTO permissions (id, code, description)
            VALUES (gen_random_uuid(), '{code}', '{escaped_desc}')
            ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;
        """)

    # 3. Map permissions to director role
    for perm_code in DIRECTOR_PERMISSIONS:
        op.execute(f"""
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM roles r, permissions p
            WHERE r.name = 'director' AND r.is_system = true AND p.code = '{perm_code}'
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        """)

    # 4. Map self-service permissions to employee role
    for perm_code in EMPLOYEE_PERMISSIONS:
        op.execute(f"""
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM roles r, permissions p
            WHERE r.name = 'employee' AND r.is_system = true AND p.code = '{perm_code}'
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        """)

    # Also map all self-service permissions to system_admin and organization_owner
    for code, _ in SELF_SERVICE_PERMISSIONS:
        op.execute(f"""
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM roles r, permissions p
            WHERE r.name IN ('system_admin', 'organization_owner', 'organization_admin') 
              AND r.is_system = true 
              AND p.code = '{code}'
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        """)

    # 5. Update primary superowner profile email to osofficesupport@gmail.com
    op.execute("""
        UPDATE profiles
        SET email = 'osofficesupport@gmail.com',
            first_name = 'OsOffice',
            last_name = 'Support'
        WHERE id = '00000000-0000-0000-0000-000000000001'
           OR email = 'officeos@gmail.com';
    """)


def downgrade() -> None:
    # Revert email update
    op.execute("""
        UPDATE profiles
        SET email = 'officeos@gmail.com'
        WHERE email = 'osofficesupport@gmail.com';
    """)
