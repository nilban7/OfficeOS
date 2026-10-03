"""Create notifications and notification_preferences tables with RLS and canonical permissions.

Revision ID: 0016_notifications_module
Revises: 0015_documents_module
Create Date: 2026-09-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0016_notifications_module"
down_revision: Union[str, None] = "0015_documents_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("notifications.view", "View own notifications and unread counts"),
    ("notifications.create", "Create notifications for organization members"),
    ("notifications.manage", "Administratively manage organization notifications"),
    ("notifications.mark_read", "Mark own notifications as read or unread"),
    ("notifications.preferences", "View and update own notification preferences"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "finance_manager": [
        "notifications.view",
        "notifications.mark_read",
        "notifications.preferences",
    ],
    "hr_manager": [
        "notifications.view",
        "notifications.create",
        "notifications.mark_read",
        "notifications.preferences",
    ],
    "department_manager": [
        "notifications.view",
        "notifications.mark_read",
        "notifications.preferences",
    ],
    "project_manager": [
        "notifications.view",
        "notifications.mark_read",
        "notifications.preferences",
    ],
    "employee": [
        "notifications.view",
        "notifications.mark_read",
        "notifications.preferences",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    jsonb = postgresql.JSONB(astext_type=sa.Text())

    # 1. Create helper function for getting profile_id from auth_user_id in RLS
    op.execute("""
        CREATE OR REPLACE FUNCTION public.get_auth_profile_id(p_auth_user_id uuid)
        RETURNS uuid
        LANGUAGE sql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        STABLE
        AS $$
          SELECT id FROM public.profiles WHERE auth_user_id = p_auth_user_id LIMIT 1;
        $$;
    """)
    op.execute("REVOKE ALL ON FUNCTION public.get_auth_profile_id(uuid) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.get_auth_profile_id(uuid) TO authenticated, service_role, anon")

    # 2. Create notifications table
    op.create_table(
        "notifications",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipient_id",
            uuid,
            sa.ForeignKey("profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("notification_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("action_url", sa.String(500), nullable=True),
        sa.Column("metadata", jsonb, nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("organization_id", "id", name="uq_notifications_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "recipient_id"],
            ["organization_memberships.organization_id", "organization_memberships.profile_id"],
            ondelete="CASCADE",
            name="fk_notifications_org_recipient",
        ),
        sa.CheckConstraint(
            "notification_type IN ('system', 'task', 'project', 'document', 'leave', 'attendance', 'finance', 'maintenance', 'training', 'general')",
            name="ck_notifications_type",
        ),
    )
    op.execute("CREATE INDEX ix_notifications_organization_id ON notifications (organization_id)")
    op.execute("CREATE INDEX ix_notifications_recipient_id ON notifications (recipient_id)")
    op.execute("CREATE INDEX ix_notifications_created_at ON notifications (created_at)")
    op.execute("CREATE INDEX ix_notifications_type ON notifications (notification_type)")
    op.execute(
        "CREATE INDEX ix_notifications_recipient_unread ON notifications (organization_id, recipient_id, created_at) "
        "WHERE read_at IS NULL AND archived_at IS NULL"
    )

    # 3. Create notification_preferences table
    op.create_table(
        "notification_preferences",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipient_id",
            uuid,
            sa.ForeignKey("profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("notification_type", sa.String(50), nullable=False),
        sa.Column("in_app_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
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
        sa.UniqueConstraint("organization_id", "id", name="uq_notification_preferences_org_id"),
        sa.UniqueConstraint(
            "organization_id",
            "recipient_id",
            "notification_type",
            name="uq_notification_preferences_org_user_type",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "recipient_id"],
            ["organization_memberships.organization_id", "organization_memberships.profile_id"],
            ondelete="CASCADE",
            name="fk_notification_preferences_org_recipient",
        ),
        sa.CheckConstraint(
            "notification_type IN ('system', 'task', 'project', 'document', 'leave', 'attendance', 'finance', 'maintenance', 'training', 'general')",
            name="ck_notification_preferences_type",
        ),
    )
    op.execute(
        "CREATE INDEX ix_notification_preferences_org_recipient ON notification_preferences (organization_id, recipient_id)"
    )

    # 4. Enable and FORCE RLS on both tables
    tables = ("notifications", "notification_preferences")
    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    # Policies for notifications
    # SELECT: Only recipient sees own notifications within their organization
    op.execute(
        f"CREATE POLICY notifications_select ON notifications FOR SELECT USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND recipient_id = public.get_auth_profile_id({user_setting_uuid}))"
    )

    # UPDATE: Only recipient can update (mark read/unread/archive) own notifications
    op.execute(
        f"CREATE POLICY notifications_update ON notifications FOR UPDATE USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND recipient_id = public.get_auth_profile_id({user_setting_uuid}))"
    )

    # DELETE: Only recipient can delete own notifications
    op.execute(
        f"CREATE POLICY notifications_delete ON notifications FOR DELETE USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND recipient_id = public.get_auth_profile_id({user_setting_uuid}))"
    )

    # INSERT: Any active org member can insert notifications for an active recipient in the same org
    op.execute(
        f"CREATE POLICY notifications_insert ON notifications FOR INSERT WITH CHECK ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )

    # Policy for notification_preferences: User manages only own preferences
    op.execute(
        f"CREATE POLICY notification_preferences_policy ON notification_preferences FOR ALL USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND recipient_id = public.get_auth_profile_id({user_setting_uuid})) "
        f"WITH CHECK ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND recipient_id = public.get_auth_profile_id({user_setting_uuid}))"
    )

    # 5. Seed Canonical Permissions
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

    op.execute("DROP POLICY IF EXISTS notification_preferences_policy ON notification_preferences")
    op.execute("DROP POLICY IF EXISTS notifications_insert ON notifications")
    op.execute("DROP POLICY IF EXISTS notifications_delete ON notifications")
    op.execute("DROP POLICY IF EXISTS notifications_update ON notifications")
    op.execute("DROP POLICY IF EXISTS notifications_select ON notifications")

    op.drop_table("notification_preferences")
    op.drop_table("notifications")
    op.execute("DROP FUNCTION IF EXISTS public.get_auth_profile_id(uuid)")
