"""offsite attendance and 2-step hr approval workflow

Revision ID: 0029_offsite_attendance_approval
Revises: 0028_travel_costs_and_payments
Create Date: 2026-10-29
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "0029_offsite_attendance_approval"
down_revision: Union[str, None] = "0028_travel_costs_and_payments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("attendance.approve", "Approve or reject offsite client meeting and field visit attendance"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": ["attendance.approve"],
    "organization_owner": ["attendance.approve"],
    "organization_admin": ["attendance.approve"],
    "hr_manager": ["attendance.approve"],
    "department_manager": ["attendance.approve"],
}


def upgrade() -> None:
    # 1. Add offsite & 2-step approval columns to attendance_records
    op.add_column(
        "attendance_records",
        sa.Column("is_offsite", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "attendance_records",
        sa.Column("offsite_reason", sa.String(100), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("offsite_location", sa.String(255), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("client_name", sa.String(160), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("approval_status", sa.String(32), nullable=False, server_default=sa.text("'not_required'")),
    )
    op.add_column(
        "attendance_records",
        sa.Column("hr_approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("hr_approved_by_id", UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("hr_rejection_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("org_head_approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("org_head_approved_by_id", UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("org_head_rejection_reason", sa.Text(), nullable=True),
    )

    # 2. Add indexes
    op.create_index(
        "ix_attendance_records_is_offsite",
        "attendance_records",
        ["is_offsite"],
    )
    op.create_index(
        "ix_attendance_records_approval_status",
        "attendance_records",
        ["approval_status"],
    )

    # 3. Add check constraint for approval_status
    op.create_check_constraint(
        "ck_attendance_approval_status",
        "attendance_records",
        "approval_status IN ('not_required', 'pending_hr', 'pending_org_head', 'approved', 'rejected')",
    )

    # 4. Seed permission
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 5. Map permissions to roles
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
    # 1. Remove permissions
    perm_codes_str = ", ".join(f"'{code}'" for code, _ in CANONICAL_PERMISSIONS)
    op.execute(
        f"DELETE FROM role_permissions WHERE permission_id IN ("
        f"SELECT id FROM permissions WHERE code IN ({perm_codes_str}))"
    )
    op.execute(f"DELETE FROM permissions WHERE code IN ({perm_codes_str})")

    # 2. Drop constraints & indexes
    op.drop_constraint("ck_attendance_approval_status", "attendance_records", type_="check")
    op.drop_index("ix_attendance_records_approval_status", table_name="attendance_records")
    op.drop_index("ix_attendance_records_is_offsite", table_name="attendance_records")

    # 3. Drop columns
    op.drop_column("attendance_records", "org_head_rejection_reason")
    op.drop_column("attendance_records", "org_head_approved_by_id")
    op.drop_column("attendance_records", "org_head_approved_at")
    op.drop_column("attendance_records", "hr_rejection_reason")
    op.drop_column("attendance_records", "hr_approved_by_id")
    op.drop_column("attendance_records", "hr_approved_at")
    op.drop_column("attendance_records", "approval_status")
    op.drop_column("attendance_records", "client_name")
    op.drop_column("attendance_records", "offsite_location")
    op.drop_column("attendance_records", "offsite_reason")
    op.drop_column("attendance_records", "is_offsite")
