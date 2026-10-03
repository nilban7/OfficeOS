"""AI and Automation Module schema, RLS policies, and canonical permissions.

Revision ID: 0019_ai_automation_module
Revises: 0018_reports_module
Create Date: 2026-09-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0019_ai_automation_module"
down_revision: Union[str, None] = "0018_reports_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("ai.view", "View AI assistant status, allowed capabilities, and conversation history"),
    ("ai.use", "Interact with AI assistant, send messages, and execute assistant queries"),
    ("ai.manage", "Configure tenant AI parameters, capabilities, model selection, and usage limits"),
    ("automations.view", "View organization automation workflows, rules, and execution history"),
    ("automations.create", "Create organization automation workflows and rules"),
    ("automations.update", "Update organization automation rules, configuration, and active status"),
    ("automations.delete", "Delete organization automation workflows"),
    ("automations.execute", "Manually trigger or test organization automation workflows"),
    ("automations.manage", "Administratively manage organization automations and integrations"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "hr_manager": [
        "ai.view",
        "ai.use",
        "automations.view",
        "automations.create",
        "automations.update",
        "automations.execute",
    ],
    "finance_manager": [
        "ai.view",
        "ai.use",
        "automations.view",
        "automations.create",
        "automations.update",
        "automations.execute",
    ],
    "project_manager": [
        "ai.view",
        "ai.use",
        "automations.view",
        "automations.create",
        "automations.update",
        "automations.execute",
    ],
    "department_manager": [
        "ai.view",
        "ai.use",
        "automations.view",
        "automations.create",
        "automations.update",
        "automations.execute",
    ],
    "employee": [
        "ai.view",
        "ai.use",
    ],
}


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    jsonb = postgresql.JSONB(astext_type=sa.Text())

    # 1. Create ai_configurations table
    op.create_table(
        "ai_configurations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("provider", sa.String(50), nullable=False, server_default=sa.text("'system_gemini'")),
        sa.Column("model_name", sa.String(100), nullable=False, server_default=sa.text("'gemini-1.5-flash'")),
        sa.Column("temperature", sa.Numeric(3, 2), nullable=False, server_default=sa.text("0.70")),
        sa.Column("max_tokens_per_response", sa.Integer(), nullable=False, server_default=sa.text("2048")),
        sa.Column(
            "allowed_capabilities",
            jsonb,
            nullable=False,
            server_default=sa.text(
                '\'["workforce", "attendance", "leave", "projects", "procurement", "assets", "maintenance", "training", "internships", "operations", "documents"]\'::jsonb'
            ),
        ),
        sa.Column("daily_request_limit", sa.Integer(), nullable=False, server_default=sa.text("1000")),
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
    )
    op.execute("CREATE INDEX ix_ai_configurations_org_id ON ai_configurations (organization_id)")

    # 2. Create ai_conversations table
    op.create_table(
        "ai_conversations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            uuid,
            sa.ForeignKey("profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False, server_default=sa.text("'New Conversation'")),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
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
        sa.UniqueConstraint("organization_id", "id", name="uq_ai_conversations_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "user_id"],
            ["organization_memberships.organization_id", "organization_memberships.profile_id"],
            ondelete="CASCADE",
            name="fk_ai_conversations_org_user",
        ),
    )
    op.execute(
        "CREATE INDEX ix_ai_conversations_org_user ON ai_conversations (organization_id, user_id, updated_at DESC)"
    )

    # 3. Create ai_messages table
    op.create_table(
        "ai_messages",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conversation_id",
            uuid,
            sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sender_role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("capability_used", sa.String(50), nullable=True),
        sa.Column("tokens_used", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("metadata", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "conversation_id"],
            ["ai_conversations.organization_id", "ai_conversations.id"],
            ondelete="CASCADE",
            name="fk_ai_messages_org_conv",
        ),
        sa.CheckConstraint("sender_role IN ('user', 'assistant', 'system')", name="ck_ai_messages_sender_role"),
    )
    op.execute(
        "CREATE INDEX ix_ai_messages_org_conv ON ai_messages (organization_id, conversation_id, created_at ASC)"
    )

    # 4. Create automations table
    op.create_table(
        "automations",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("trigger_type", sa.String(50), nullable=False),
        sa.Column("trigger_config", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("action_config", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_by_id",
            uuid,
            sa.ForeignKey("profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_status", sa.String(50), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("run_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
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
        sa.UniqueConstraint("organization_id", "id", name="uq_automations_org_id"),
        sa.ForeignKeyConstraint(
            ["organization_id", "created_by_id"],
            ["organization_memberships.organization_id", "organization_memberships.profile_id"],
            ondelete="CASCADE",
            name="fk_automations_org_creator",
        ),
        sa.CheckConstraint("trigger_type IN ('event', 'schedule', 'manual')", name="ck_automations_trigger_type"),
        sa.CheckConstraint(
            "action_type IN ('notification', 'audit_log', 'task_create')", name="ck_automations_action_type"
        ),
    )
    op.execute("CREATE INDEX ix_automations_org_active ON automations (organization_id, is_active)")
    op.execute("CREATE INDEX ix_automations_org_trigger ON automations (organization_id, trigger_type)")

    # 5. Create automation_executions table
    op.create_table(
        "automation_executions",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "organization_id",
            uuid,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "automation_id",
            uuid,
            sa.ForeignKey("automations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "triggered_by_id",
            uuid,
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("trigger_source", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("execution_payload", jsonb, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("result_summary", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "automation_id"],
            ["automations.organization_id", "automations.id"],
            ondelete="CASCADE",
            name="fk_auto_exec_org_auto",
        ),
        sa.CheckConstraint("status IN ('success', 'failed', 'skipped')", name="ck_auto_exec_status"),
    )
    op.execute(
        "CREATE INDEX ix_auto_exec_org_auto ON automation_executions (organization_id, automation_id, created_at DESC)"
    )
    op.execute("CREATE INDEX ix_auto_exec_org_created ON automation_executions (organization_id, created_at DESC)")

    # 6. Enable and FORCE RLS on all 5 tables
    tables = (
        "ai_configurations",
        "ai_conversations",
        "ai_messages",
        "automations",
        "automation_executions",
    )
    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    user_context = "COALESCE(current_setting('app.user_id', true), '') <> ''"
    org_context = "COALESCE(current_setting('app.organization_id', true), '') <> ''"
    org_setting_uuid = "(NULLIF(current_setting('app.organization_id', true), ''))::uuid"
    user_setting_uuid = "(NULLIF(current_setting('app.user_id', true), ''))::uuid"

    # Policies for ai_configurations: Active org members can select, authorized members can insert/update
    op.execute(
        f"CREATE POLICY ai_configurations_select ON ai_configurations FOR SELECT USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )
    op.execute(
        f"CREATE POLICY ai_configurations_modify ON ai_configurations FOR ALL USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid})) "
        f"WITH CHECK ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )

    # Policies for ai_conversations: Users see, create, update, and delete their own conversations
    op.execute(
        f"CREATE POLICY ai_conversations_select ON ai_conversations FOR SELECT USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND user_id = public.get_auth_profile_id({user_setting_uuid}))"
    )
    op.execute(
        f"CREATE POLICY ai_conversations_insert ON ai_conversations FOR INSERT WITH CHECK ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND user_id = public.get_auth_profile_id({user_setting_uuid}))"
    )
    op.execute(
        f"CREATE POLICY ai_conversations_update ON ai_conversations FOR UPDATE USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND user_id = public.get_auth_profile_id({user_setting_uuid}))"
    )
    op.execute(
        f"CREATE POLICY ai_conversations_delete ON ai_conversations FOR DELETE USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND user_id = public.get_auth_profile_id({user_setting_uuid}))"
    )

    # Policies for ai_messages: Tied to conversation ownership
    op.execute(
        f"CREATE POLICY ai_messages_select ON ai_messages FOR SELECT USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND EXISTS (SELECT 1 FROM ai_conversations c WHERE c.id = ai_messages.conversation_id AND c.user_id = public.get_auth_profile_id({user_setting_uuid})))"
    )
    op.execute(
        f"CREATE POLICY ai_messages_insert ON ai_messages FOR INSERT WITH CHECK ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND EXISTS (SELECT 1 FROM ai_conversations c WHERE c.id = ai_messages.conversation_id AND c.user_id = public.get_auth_profile_id({user_setting_uuid})))"
    )
    op.execute(
        f"CREATE POLICY ai_messages_delete ON ai_messages FOR DELETE USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}) "
        f"AND EXISTS (SELECT 1 FROM ai_conversations c WHERE c.id = ai_messages.conversation_id AND c.user_id = public.get_auth_profile_id({user_setting_uuid})))"
    )

    # Policies for automations: Active org members can select, active members within tenant can insert/update/delete
    op.execute(
        f"CREATE POLICY automations_select ON automations FOR SELECT USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )
    op.execute(
        f"CREATE POLICY automations_modify ON automations FOR ALL USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid})) "
        f"WITH CHECK ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )

    # Policies for automation_executions: Active org members can select and insert
    op.execute(
        f"CREATE POLICY automation_executions_select ON automation_executions FOR SELECT USING ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )
    op.execute(
        f"CREATE POLICY automation_executions_insert ON automation_executions FOR INSERT WITH CHECK ("
        f"{user_context} AND {org_context} "
        f"AND organization_id = {org_setting_uuid} "
        f"AND public.is_org_member(organization_id, {user_setting_uuid}))"
    )

    # 7. Seed Canonical Permissions
    for code, description in CANONICAL_PERMISSIONS:
        escaped_desc = description.replace("'", "''")
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES (gen_random_uuid(), '{code}', '{escaped_desc}') "
            f"ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
        )

    # 8. Map permissions to roles
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
    # 1. Unmap and delete permissions
    perm_codes_str = ", ".join(f"'{code}'" for code, _ in CANONICAL_PERMISSIONS)
    op.execute(
        f"DELETE FROM role_permissions WHERE permission_id IN ("
        f"SELECT id FROM permissions WHERE code IN ({perm_codes_str}))"
    )
    op.execute(f"DELETE FROM permissions WHERE code IN ({perm_codes_str})")

    # 2. Drop tables
    tables = (
        "automation_executions",
        "automations",
        "ai_messages",
        "ai_conversations",
        "ai_configurations",
    )
    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
