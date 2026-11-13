"""membership permissions table and module permission seeds

Revision ID: 0039_membership_perms
Revises: 0038_prod_rbac_director
Create Date: 2026-11-13
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0039_membership_perms"
down_revision: Union[str, None] = "0038_prod_rbac_director"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ADDITIONAL_PERMISSIONS = [
    ("attendance.manage", "Manage organization attendance rules and devices"),
    ("leave.manage", "Manage leave categories, policies, and allocations"),
    ("payroll.manage", "Run payroll and manage salary structures"),
    ("payroll.runs", "Process and finalize monthly payroll runs"),
    ("projects.manage", "Manage project tasks, budgets, and assignments"),
    ("training.manage", "Manage training courses, instructors, and sessions"),
    ("internships.manage", "Manage internship listings and supervisor assignments"),
    ("clients.manage", "Manage client accounts and relationship owners"),
    ("engagements.manage", "Manage client engagement agreements and deliverables"),
    ("assets.manage", "Manage hardware assets, categories, and lifecycles"),
    ("maintenance.manage", "Manage maintenance vendors, work orders, and repairs"),
    ("finance.manage", "Manage bank accounts, invoices, and expense ledgers"),
    ("documents.manage", "Manage organization document folders and access"),
    ("branches.manage", "Create and manage organizational branch offices"),
    ("departments.manage", "Create and manage organizational departments"),
]

def upgrade() -> None:
    # 1. Create membership_permissions table
    op.create_table(
        "membership_permissions",
        sa.Column(
            "membership_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organization_memberships.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "permission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("permissions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    # 2. Seed additional permissions
    for code, desc in ADDITIONAL_PERMISSIONS:
        escaped_desc = desc.replace("'", "''")
        op.execute(f"""
            INSERT INTO permissions (id, code, description)
            VALUES (gen_random_uuid(), '{code}', '{escaped_desc}')
            ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;
        """)

    # 3. Enable RLS
    op.execute("ALTER TABLE membership_permissions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE membership_permissions FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    op.execute(f"""
        CREATE POLICY membership_permissions_member ON membership_permissions
        USING (
            {user_context} AND {org_context} AND membership_id IN (
                SELECT m.id FROM organization_memberships m
                JOIN profiles p ON p.id = m.profile_id
                WHERE m.organization_id::text = current_setting('app.organization_id', true)
                  AND p.auth_user_id::text = current_setting('app.user_id', true)
                  AND m.status = 'active'
            )
        )
    """)

    # 4. Indexes
    op.create_index(
        "ix_membership_permissions_membership_id",
        "membership_permissions",
        ["membership_id"],
    )
    op.create_index(
        "ix_membership_permissions_permission_id",
        "membership_permissions",
        ["permission_id"],
    )


def downgrade() -> None:
    op.drop_table("membership_permissions")
