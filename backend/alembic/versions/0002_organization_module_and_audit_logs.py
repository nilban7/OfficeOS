"""Create audit_logs table, tenant RLS policies, and seed organization permissions."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0002_organization_module_and_audit_logs"
down_revision = "0001_identity_tenancy_foundation"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("organizations.view", "View organization profile and basic details"),
    ("organizations.update", "Update organization profile"),
    ("organizations.settings_manage", "Manage organization settings and configuration"),
    ("branches.view", "View organization branches"),
    ("branches.manage", "Create, update, and deactivate organization branches"),
    ("members.view", "View organization members and roles"),
    ("members.manage", "Add, update, and remove organization members"),
    ("roles.view", "View available organization and system roles"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "organizations.view",
        "organizations.update",
        "organizations.settings_manage",
        "branches.view",
        "branches.manage",
        "members.view",
        "members.manage",
        "roles.view",
    ],
    "organization_owner": [
        "organizations.view",
        "organizations.update",
        "organizations.settings_manage",
        "branches.view",
        "branches.manage",
        "members.view",
        "members.manage",
        "roles.view",
    ],
    "organization_admin": [
        "organizations.view",
        "organizations.update",
        "organizations.settings_manage",
        "branches.view",
        "branches.manage",
        "members.view",
        "members.manage",
        "roles.view",
    ],
    "hr_manager": [
        "organizations.view",
        "branches.view",
        "members.view",
    ],
    "finance_manager": [
        "organizations.view",
        "branches.view",
    ],
    "project_manager": [
        "organizations.view",
        "branches.view",
    ],
    "department_manager": [
        "organizations.view",
        "branches.view",
    ],
    "employee": [
        "organizations.view",
        "branches.view",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    jsonb = postgresql.JSONB(astext_type=sa.Text())

    # 1. Create audit_logs table
    op.create_table(
        "audit_logs",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            uuid,
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", uuid, nullable=True),
        sa.Column("details", jsonb, nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.execute("CREATE INDEX ix_audit_logs_organization_id ON audit_logs (organization_id)")
    op.execute("CREATE INDEX ix_audit_logs_actor_id ON audit_logs (actor_id)")
    op.execute("CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at)")

    # 2. Enable and force RLS on audit_logs
    op.execute("ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY")

    # 3. RLS policies
    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    member = (
        "EXISTS (SELECT 1 FROM organization_memberships m "
        "JOIN profiles p ON p.id = m.profile_id "
        "WHERE m.organization_id = {org} "
        "AND p.auth_user_id::text = current_setting('app.user_id', true) "
        "AND m.status = 'active')"
    )

    # audit_logs policy: active members of the tenant can select audit logs
    audit_member_clause = member.format(org="audit_logs.organization_id")
    op.execute(
        f"CREATE POLICY audit_logs_member ON audit_logs USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id::text = current_setting('app.organization_id', true) "
        f"AND {audit_member_clause})"
    )

    # memberships_organization_view policy: active members can view all memberships in their tenant
    memberships_member_clause = member.format(org="organization_memberships.organization_id")
    op.execute(
        f"CREATE POLICY memberships_organization_view ON organization_memberships FOR SELECT USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id::text = current_setting('app.organization_id', true) "
        f"AND {memberships_member_clause})"
    )

    # profiles_organization_member policy: active members can view coworker profiles in their tenant
    org_setting_uuid = "current_setting('app.organization_id', true)::uuid"
    profiles_member_clause = member.format(org=org_setting_uuid)
    op.execute(
        f"CREATE POLICY profiles_organization_member ON profiles FOR SELECT USING ("
        f"{user_context} AND {org_context} "
        f"AND EXISTS ("
        f"  SELECT 1 FROM organization_memberships m "
        f"  WHERE m.organization_id::text = current_setting('app.organization_id', true) "
        f"  AND m.profile_id = profiles.id"
        f") "
        f"AND {profiles_member_clause})"
    )

    # 4. Seed Canonical Permissions
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
    # 1. Remove role_permissions for the organization module permissions
    perm_codes_str = ", ".join(f"'{code}'" for code, _ in CANONICAL_PERMISSIONS)
    op.execute(
        f"DELETE FROM role_permissions WHERE permission_id IN ("
        f"SELECT id FROM permissions WHERE code IN ({perm_codes_str}))"
    )

    # 2. Delete the seeded permissions
    op.execute(f"DELETE FROM permissions WHERE code IN ({perm_codes_str})")

    # 3. Drop policies
    op.execute("DROP POLICY IF EXISTS profiles_organization_member ON profiles")
    op.execute("DROP POLICY IF EXISTS memberships_organization_view ON organization_memberships")
    op.execute("DROP POLICY IF EXISTS audit_logs_member ON audit_logs")

    # 4. Drop audit_logs table
    op.drop_table("audit_logs")
