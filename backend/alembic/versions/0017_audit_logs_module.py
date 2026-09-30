"""Audit Logs Module - Immutability trigger, optimized indexes, RLS refinement, and audit_logs.view canonical permission.

Revision ID: 0017_audit_logs_module
Revises: 0016_notifications_module
Create Date: 2026-09-30
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0017_audit_logs_module"
down_revision = "0016_notifications_module"
branch_labels = None
depends_on = None

CANONICAL_PERMISSIONS = [
    ("audit_logs.view", "View organization audit logs and activity history"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [
        "audit_logs.view",
    ],
    "organization_owner": [
        "audit_logs.view",
    ],
    "organization_admin": [
        "audit_logs.view",
    ],
}


def upgrade() -> None:
    # 1. Performance and Query Indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_audit_logs_org_created_at ON audit_logs (organization_id, created_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_audit_logs_org_action ON audit_logs (organization_id, action)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_audit_logs_org_entity ON audit_logs (organization_id, entity_type, entity_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_audit_logs_org_actor ON audit_logs (organization_id, actor_id)"
    )

    # 2. Immutability: Prevent UPDATE and DELETE at database engine level
    op.execute("""
        CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutation()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF current_setting('app.allow_audit_log_cleanup', true) = 'true' THEN
            RETURN OLD;
          END IF;
          RAISE EXCEPTION 'Audit logs are immutable and cannot be updated or deleted.';
        END;
        $$;
    """)

    op.execute(
        "DROP TRIGGER IF EXISTS trg_prevent_audit_logs_mutation ON public.audit_logs"
    )
    op.execute("""
        CREATE TRIGGER trg_prevent_audit_logs_mutation
        BEFORE UPDATE OR DELETE ON public.audit_logs
        FOR EACH ROW
        EXECUTE FUNCTION public.prevent_audit_logs_mutation()
    """)

    # 3. Refine RLS Policies: Replace broad FOR ALL policy with strict SELECT and INSERT policies
    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    op.execute("DROP POLICY IF EXISTS audit_logs_member ON audit_logs")
    op.execute("DROP POLICY IF EXISTS audit_logs_select ON audit_logs")
    op.execute("DROP POLICY IF EXISTS audit_logs_insert ON audit_logs")

    # SELECT policy: Active members in the tenant can read audit logs of their own organization
    op.execute(
        f"CREATE POLICY audit_logs_select ON audit_logs FOR SELECT USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )

    # INSERT policy: Backend service with active tenant context can record audit logs
    op.execute(
        f"CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT WITH CHECK ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )

    # Ensure FORCE ROW LEVEL SECURITY remains enabled
    op.execute("ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY")

    # 4. Seed Canonical Permissions
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 5. Map permissions to canonical administrative roles
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
    # 1. Remove role_permissions
    perm_codes_str = ", ".join(f"'{code}'" for code, _ in CANONICAL_PERMISSIONS)
    op.execute(
        f"DELETE FROM role_permissions WHERE permission_id IN ("
        f"SELECT id FROM permissions WHERE code IN ({perm_codes_str}))"
    )

    # 2. Delete the seeded permissions
    op.execute(f"DELETE FROM permissions WHERE code IN ({perm_codes_str})")

    # 3. Restore previous audit_logs_member policy
    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    op.execute("DROP POLICY IF EXISTS audit_logs_select ON audit_logs")
    op.execute("DROP POLICY IF EXISTS audit_logs_insert ON audit_logs")

    op.execute(
        f"CREATE POLICY audit_logs_member ON audit_logs FOR ALL USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )

    # 4. Drop trigger and immutability function
    op.execute("DROP TRIGGER IF EXISTS trg_prevent_audit_logs_mutation ON public.audit_logs")
    op.execute("DROP FUNCTION IF EXISTS public.prevent_audit_logs_mutation()")

    # 5. Drop indexes
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_org_actor")
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_org_entity")
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_org_action")
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_org_created_at")
