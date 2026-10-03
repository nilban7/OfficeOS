"""SaaS Administration Module - Platform configuration, announcements, organization lifecycle, and system_admin RLS.

Revision ID: 0020_saas_administration_module
Revises: 0019_ai_automation_module
Create Date: 2026-09-30
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0020_saas_administration_module"
down_revision = "0019_ai_automation_module"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("saas.view", "View SaaS platform administration dashboard, directory, and analytics"),
    ("saas.manage", "Manage SaaS platform configuration, organization lifecycle, and announcements"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "saas.view",
        "saas.manage",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)

    # 1. Add status and suspension tracking to organizations
    op.add_column(
        "organizations",
        sa.Column("status", sa.String(30), nullable=False, server_default="active"),
    )
    op.add_column(
        "organizations",
        sa.Column("suspension_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "organizations",
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_organizations_status",
        "organizations",
        "status IN ('active', 'suspended', 'deactivated')",
    )
    op.create_index("ix_organizations_status", "organizations", ["status"])

    # 2. Platform Configurations Table (Platform-wide, NOT organization-scoped)
    op.create_table(
        "platform_configurations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("platform_name", sa.String(100), nullable=False, server_default="OfficeOS"),
        sa.Column("support_email", sa.String(255), nullable=True),
        sa.Column("maintenance_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("allowed_signup_domains", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("max_organizations", sa.Integer(), nullable=False, server_default="1000"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 3. Platform Announcements Table
    op.create_table(
        "platform_announcements",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(30), nullable=False, server_default="info"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("target_type", sa.String(30), nullable=False, server_default="all"),
        sa.Column("target_org_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_by_id", uuid, sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("severity IN ('info', 'warning', 'critical')", name="ck_announcements_severity"),
        sa.CheckConstraint("target_type IN ('all', 'specific_orgs')", name="ck_announcements_target_type"),
    )
    op.create_index("ix_announcements_is_active", "platform_announcements", ["is_active"])
    op.create_index("ix_announcements_target_type", "platform_announcements", ["target_type"])
    op.create_index("ix_announcements_starts_at", "platform_announcements", ["starts_at"])

    # 4. Helper function: is_system_admin
    op.execute("""
        CREATE OR REPLACE FUNCTION public.is_system_admin(p_user_id uuid)
        RETURNS boolean
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        AS $$
          SELECT EXISTS (
            SELECT 1
            FROM organization_memberships m
            JOIN profiles p ON p.id = m.profile_id
            JOIN membership_roles mr ON mr.membership_id = m.id
            JOIN roles r ON r.id = mr.role_id
            WHERE p.auth_user_id = p_user_id
              AND m.status = 'active'
              AND r.name = 'system_admin'
          );
        $$;
    """)

    # 5. Row-Level Security on Platform Tables
    op.execute("ALTER TABLE platform_configurations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE platform_configurations FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE platform_announcements FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"
    org_setting_uuid = "NULLIF(current_setting('app.organization_id', true), '')"

    # Platform configuration: Only system_admin can read and write
    op.execute(f"""
        CREATE POLICY platform_config_system_admin ON platform_configurations
        FOR ALL
        USING ({user_context} AND public.is_system_admin({user_setting_uuid}))
        WITH CHECK ({user_context} AND public.is_system_admin({user_setting_uuid}))
    """)

    # Platform announcements:
    # - system_admin has full CRUD
    # - authenticated members can SELECT active announcements targeted to them
    op.execute(f"""
        CREATE POLICY platform_announcements_system_admin ON platform_announcements
        FOR ALL
        USING ({user_context} AND public.is_system_admin({user_setting_uuid}))
        WITH CHECK ({user_context} AND public.is_system_admin({user_setting_uuid}))
    """)

    op.execute(f"""
        CREATE POLICY platform_announcements_tenant_select ON platform_announcements
        FOR SELECT
        USING (
            {user_context}
            AND is_active = true
            AND starts_at <= now()
            AND (ends_at IS NULL OR ends_at > now())
            AND (
                target_type = 'all'
                OR (
                    {org_setting_uuid} IS NOT NULL
                    AND target_org_ids ? {org_setting_uuid}
                )
            )
        )
    """)

    # 6. Cross-tenant RLS policies for system_admin on organizations and audit_logs
    op.execute(f"""
        CREATE POLICY organizations_system_admin ON organizations
        FOR ALL
        USING ({user_context} AND public.is_system_admin({user_setting_uuid}))
        WITH CHECK ({user_context} AND public.is_system_admin({user_setting_uuid}))
    """)

    op.execute(f"""
        CREATE POLICY audit_logs_system_admin_select ON audit_logs
        FOR SELECT
        USING ({user_context} AND public.is_system_admin({user_setting_uuid}))
    """)

    # 7. Seed Default Platform Configuration
    op.execute("""
        INSERT INTO platform_configurations (id, platform_name, support_email, maintenance_mode, allowed_signup_domains, max_organizations)
        VALUES (gen_random_uuid(), 'OfficeOS', 'support@officeos.internal', false, '[]'::jsonb, 1000)
    """)

    # 8. Seed SaaS Permissions and map to system_admin
    for perm_code, perm_desc in CANONICAL_PERMISSIONS:
        op.execute(f"""
            INSERT INTO permissions (id, code, description)
            VALUES (gen_random_uuid(), '{perm_code}', '{perm_desc}')
            ON CONFLICT (code) DO NOTHING
        """)

    for role_name, perm_codes in ROLE_PERMISSIONS_MAPPING.items():
        for perm_code in perm_codes:
            op.execute(f"""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM roles r, permissions p
                WHERE r.name = '{role_name}'
                  AND r.organization_id IS NULL
                  AND p.code = '{perm_code}'
                ON CONFLICT (role_id, permission_id) DO NOTHING
            """)


def downgrade() -> None:
    # Remove permissions mapping
    for perm_code, _ in CANONICAL_PERMISSIONS:
        op.execute(f"""
            DELETE FROM role_permissions
            WHERE permission_id IN (SELECT id FROM permissions WHERE code = '{perm_code}')
        """)
        op.execute(f"DELETE FROM permissions WHERE code = '{perm_code}'")

    # Drop RLS policies
    op.execute("DROP POLICY IF EXISTS audit_logs_system_admin_select ON audit_logs")
    op.execute("DROP POLICY IF EXISTS organizations_system_admin ON organizations")
    op.execute("DROP POLICY IF EXISTS platform_announcements_tenant_select ON platform_announcements")
    op.execute("DROP POLICY IF EXISTS platform_announcements_system_admin ON platform_announcements")
    op.execute("DROP POLICY IF EXISTS platform_config_system_admin ON platform_configurations")

    # Drop function
    op.execute("DROP FUNCTION IF EXISTS public.is_system_admin(uuid)")

    # Drop tables
    op.drop_table("platform_announcements")
    op.drop_table("platform_configurations")

    # Drop columns on organizations
    op.drop_index("ix_organizations_status", table_name="organizations")
    op.drop_constraint("ck_organizations_status", "organizations", type_="check")
    op.drop_column("organizations", "suspended_at")
    op.drop_column("organizations", "suspension_reason")
    op.drop_column("organizations", "status")
