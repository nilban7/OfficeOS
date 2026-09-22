"""Create identity, tenancy, RBAC, and fail-closed RLS foundation."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0001_identity_tenancy_foundation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    uuid = postgresql.UUID(as_uuid=True)

    op.create_table(
        "organizations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "profiles",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("auth_user_id", uuid, nullable=False, unique=True),
        sa.Column("email", sa.String(320)),
        sa.Column("first_name", sa.String(100)),
        sa.Column("last_name", sa.String(100)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "organization_settings",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "branches",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("address", sa.Text()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "code", name="uq_branches_organization_code"),
    )
    op.create_table(
        "organization_memberships",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("profile_id", uuid, sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "profile_id", name="uq_memberships_organization_profile"),
        sa.CheckConstraint("status IN ('active', 'suspended', 'invited')", name="ck_memberships_status"),
    )
    op.create_table(
        "roles",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id", ondelete="CASCADE")),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "name", name="uq_roles_organization_name"),
    )
    op.create_table(
        "permissions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("code", sa.String(120), nullable=False, unique=True),
        sa.Column("description", sa.Text()),
    )
    op.create_table(
        "role_permissions",
        sa.Column("role_id", uuid, sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", uuid, sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "membership_roles",
        sa.Column("membership_id", uuid, sa.ForeignKey("organization_memberships.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", uuid, sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    )
    for table in ("organizations", "organization_settings", "branches", "organization_memberships", "roles", "membership_roles"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE profiles ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE profiles FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    no_org_context = "COALESCE(current_setting('app.organization_id', true), '') = ''"
    member = "EXISTS (SELECT 1 FROM organization_memberships m JOIN profiles p ON p.id = m.profile_id WHERE m.organization_id = {org} AND p.auth_user_id::text = current_setting('app.user_id', true) AND m.status = 'active')"
    op.execute(f"CREATE POLICY profiles_self ON profiles USING ({user_context} AND auth_user_id::text = current_setting('app.user_id', true))")
    op.execute(f"CREATE POLICY organizations_member ON organizations USING ({user_context} AND (({org_context} AND id::text = current_setting('app.organization_id', true)) OR {no_org_context}) AND {member.format(org='organizations.id')})")
    op.execute(f"CREATE POLICY organization_settings_member ON organization_settings USING ({user_context} AND {org_context} AND organization_id::text = current_setting('app.organization_id', true) AND {member.format(org='organization_settings.organization_id')})")
    op.execute(f"CREATE POLICY branches_member ON branches USING ({user_context} AND {org_context} AND organization_id::text = current_setting('app.organization_id', true) AND {member.format(org='branches.organization_id')})")
    op.execute(f"CREATE POLICY memberships_identity ON organization_memberships USING ({user_context} AND profile_id IN (SELECT id FROM profiles WHERE auth_user_id::text = current_setting('app.user_id', true)) AND ({no_org_context} OR organization_id::text = current_setting('app.organization_id', true)))")
    op.execute(f"CREATE POLICY roles_member ON roles USING ({user_context} AND {org_context} AND (organization_id IS NULL OR (organization_id::text = current_setting('app.organization_id', true) AND {member.format(org='roles.organization_id')})))")
    op.execute(f"CREATE POLICY membership_roles_member ON membership_roles USING ({user_context} AND {org_context} AND membership_id IN (SELECT m.id FROM organization_memberships m JOIN profiles p ON p.id = m.profile_id WHERE m.organization_id::text = current_setting('app.organization_id', true) AND p.auth_user_id::text = current_setting('app.user_id', true) AND m.status = 'active'))")

    op.execute("CREATE INDEX ix_profiles_auth_user_id ON profiles (auth_user_id)")
    op.execute("CREATE INDEX ix_memberships_organization_id ON organization_memberships (organization_id)")
    op.execute("CREATE INDEX ix_memberships_profile_id ON organization_memberships (profile_id)")

    permissions = ["employees.view", "employees.create", "employees.update", "employees.delete"]
    for permission in permissions:
        op.execute(f"INSERT INTO permissions (id, code) VALUES (gen_random_uuid(), '{permission}')")
    for role in ("system_admin", "organization_owner", "organization_admin", "hr_manager", "finance_manager", "project_manager", "department_manager", "employee"):
        op.execute(f"INSERT INTO roles (id, name, is_system) VALUES (gen_random_uuid(), '{role}', true)")


def downgrade() -> None:
    for table in ("membership_roles", "role_permissions", "permissions", "roles", "organization_memberships", "branches", "organization_settings", "profiles", "organizations"):
        op.drop_table(table)