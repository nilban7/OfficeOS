import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "0022_client_engagements_module"
down_revision: Union[str, None] = "0021_payroll_and_salary_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CANONICAL_PERMISSIONS = [
    ("engagements.view", "View client engagements and lifecycle status"),
    ("engagements.create", "Create new client engagements and initial proposals"),
    ("engagements.update", "Update engagement details, milestones, and status"),
    ("engagements.manage", "Full management over client engagements lifecycle"),
    ("proposals.view", "View proposals and pricing schedules"),
    ("proposals.create", "Create and edit commercial proposals"),
    ("proposals.manage", "Approve and send proposals to clients"),
    ("agreements.view", "View contracts, agreements, and execution status"),
    ("agreements.create", "Draft SOWs, MSAs, and contract amendments"),
    ("agreements.sign", "Record digital signatures on agreements"),
    ("agreements.manage", "Execute and terminate formal agreements"),
    ("uat.view", "View UAT test sessions, test cases, and runs"),
    ("uat.manage", "Create test cases and manage mock run sessions"),
    ("client_issues.manage", "Triage, assign, and resolve client queries and defects"),
]

ROLE_PERMISSIONS_MAPPING = {
    "system_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_owner": [p[0] for p in CANONICAL_PERMISSIONS],
    "organization_admin": [p[0] for p in CANONICAL_PERMISSIONS],
    "operations_manager": [
        "engagements.view",
        "engagements.create",
        "engagements.update",
        "engagements.manage",
        "proposals.view",
        "proposals.create",
        "proposals.manage",
        "agreements.view",
        "agreements.create",
        "agreements.sign",
        "uat.view",
        "uat.manage",
        "client_issues.manage",
    ],
    "finance_manager": [
        "engagements.view",
        "proposals.view",
        "agreements.view",
    ],
    "employee": [
        "engagements.view",
        "uat.view",
    ],
}


def upgrade() -> None:
    # 1. client_engagements
    op.create_table(
        "client_engagements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("engagement_code", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("current_stage", sa.String(40), server_default="proposal", nullable=False, index=True),
        sa.Column("delivery_health", sa.String(20), server_default="on_track", nullable=False, index=True),
        sa.Column("progress_percentage", sa.Integer(), server_default="0", nullable=False),
        sa.Column("contract_value", sa.Numeric(14, 2), nullable=True),
        sa.Column("invoiced_amount", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("collected_amount", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("currency", sa.String(10), server_default="INR", nullable=False),
        sa.Column("target_completion_date", sa.Date(), nullable=True),
        sa.Column("actual_completion_date", sa.Date(), nullable=True),
        sa.Column("engagement_lead_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "engagement_code", name="uq_client_engagements_code"),
        sa.UniqueConstraint("organization_id", "id", name="uq_client_engagements_org_id"),
        sa.CheckConstraint("progress_percentage >= 0 AND progress_percentage <= 100", name="ck_engagement_progress"),
        sa.CheckConstraint(
            "current_stage IN ('proposal', 'agreement', 'kickoff', 'delivery', 'weekly_reporting', 'uat', 'issues_triage', 'acceptance_handover', 'maintenance_support')",
            name="ck_engagement_stage",
        ),
        sa.CheckConstraint("delivery_health IN ('on_track', 'at_risk', 'blocked', 'completed')", name="ck_engagement_health"),
    )

    # 2. engagement_proposals
    op.create_table(
        "engagement_proposals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("engagement_id", UUID(as_uuid=True), sa.ForeignKey("client_engagements.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("proposal_number", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("status", sa.String(32), server_default="draft", nullable=False, index=True),
        sa.Column("total_amount", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("currency", sa.String(10), server_default="INR", nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("scope_of_work", sa.Text(), nullable=True),
        sa.Column("deliverables_json", JSONB, nullable=True),
        sa.Column("line_items_json", JSONB, nullable=True),
        sa.Column("payment_terms", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "proposal_number", name="uq_proposals_number"),
        sa.CheckConstraint(
            "status IN ('draft', 'in_review', 'sent', 'accepted', 'declined', 'expired')",
            name="ck_proposal_status",
        ),
    )

    # 3. engagement_agreements
    op.create_table(
        "engagement_agreements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("engagement_id", UUID(as_uuid=True), sa.ForeignKey("client_engagements.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("proposal_id", UUID(as_uuid=True), sa.ForeignKey("engagement_proposals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("agreement_number", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("agreement_type", sa.String(32), server_default="sow", nullable=False, index=True),
        sa.Column("status", sa.String(32), server_default="draft", nullable=False, index=True),
        sa.Column("contract_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(10), server_default="INR", nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("document_sha256", sa.String(64), nullable=True),
        sa.Column("document_content", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "agreement_number", name="uq_agreements_number"),
        sa.CheckConstraint("agreement_type IN ('sow', 'msa', 'nda', 'sla', 'amendment')", name="ck_agreement_type"),
        sa.CheckConstraint(
            "status IN ('draft', 'under_review', 'pending_signatures', 'partially_signed', 'active', 'terminated', 'expired')",
            name="ck_agreement_status",
        ),
    )

    # 4. agreement_signatures
    op.create_table(
        "agreement_signatures",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("agreement_id", UUID(as_uuid=True), sa.ForeignKey("engagement_agreements.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("signer_name", sa.String(255), nullable=False),
        sa.Column("signer_email", sa.String(320), nullable=False),
        sa.Column("signer_role", sa.String(32), nullable=False),
        sa.Column("signer_title", sa.String(100), nullable=True),
        sa.Column("status", sa.String(32), server_default="pending", nullable=False),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("signature_data", sa.Text(), nullable=True),
        sa.Column("signature_checksum", sa.String(64), nullable=True),
        sa.CheckConstraint("status IN ('pending', 'signed', 'declined')", name="ck_signature_status"),
        sa.CheckConstraint("signer_role IN ('internal', 'client')", name="ck_signature_role"),
    )

    # 5. engagement_weekly_reports
    op.create_table(
        "engagement_weekly_reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("engagement_id", UUID(as_uuid=True), sa.ForeignKey("client_engagements.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("report_number", sa.String(50), nullable=False),
        sa.Column("week_start_date", sa.Date(), nullable=False),
        sa.Column("week_end_date", sa.Date(), nullable=False),
        sa.Column("executive_summary", sa.Text(), nullable=False),
        sa.Column("accomplishments", JSONB, nullable=True),
        sa.Column("next_week_plans", JSONB, nullable=True),
        sa.Column("risks_and_blockers", JSONB, nullable=True),
        sa.Column("delivery_health", sa.String(20), server_default="on_track", nullable=False),
        sa.Column("client_action_items", sa.Text(), nullable=True),
        sa.Column("is_published", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 6. engagement_uat_sessions
    op.create_table(
        "engagement_uat_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("engagement_id", UUID(as_uuid=True), sa.ForeignKey("client_engagements.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("session_title", sa.String(255), nullable=False),
        sa.Column("build_version", sa.String(50), nullable=False),
        sa.Column("staging_url", sa.String(500), nullable=True),
        sa.Column("status", sa.String(32), server_default="active", nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('draft', 'active', 'completed', 'approved', 'rejected')", name="ck_uat_session_status"),
    )

    # 7. engagement_uat_test_cases
    op.create_table(
        "engagement_uat_test_cases",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("engagement_uat_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False),
        sa.Column("expected_outcome", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("actual_outcome", sa.Text(), nullable=True),
        sa.Column("tested_by_name", sa.String(255), nullable=True),
        sa.Column("tested_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 8. engagement_issues
    op.create_table(
        "engagement_issues",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("engagement_id", UUID(as_uuid=True), sa.ForeignKey("client_engagements.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("issue_number", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("issue_type", sa.String(32), server_default="bug", nullable=False),
        sa.Column("priority", sa.String(20), server_default="medium", nullable=False),
        sa.Column("status", sa.String(32), server_default="open", nullable=False),
        sa.Column("assigned_employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reported_by_name", sa.String(255), nullable=False),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 9. engagement_change_requests
    op.create_table(
        "engagement_change_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("engagement_id", UUID(as_uuid=True), sa.ForeignKey("client_engagements.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("cr_number", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("justification", sa.Text(), nullable=False),
        sa.Column("scope_delta", sa.Text(), nullable=False),
        sa.Column("additional_cost", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("additional_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(32), server_default="draft", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 10. engagement_handovers
    op.create_table(
        "engagement_handovers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("engagement_id", UUID(as_uuid=True), sa.ForeignKey("client_engagements.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("handover_number", sa.String(50), nullable=False),
        sa.Column("deliverables_accepted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("documentation_provided", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("client_signoff_name", sa.String(255), nullable=True),
        sa.Column("client_signoff_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("warranty_start_date", sa.Date(), nullable=True),
        sa.Column("warranty_end_date", sa.Date(), nullable=True),
        sa.Column("sla_tier", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 11. Seed Permissions & Role Mappings
    bind = op.get_bind()
    for code, desc in CANONICAL_PERMISSIONS:
        bind.execute(
            sa.text(
                "INSERT INTO permissions (id, code, description) "
                "VALUES (:id, :code, :desc) "
                "ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
            ),
            {"id": str(uuid.uuid4()), "code": code, "desc": desc},
        )

    for role_name, perm_codes in ROLE_PERMISSIONS_MAPPING.items():
        role_row = bind.execute(
            sa.text("SELECT id FROM roles WHERE name = :name LIMIT 1"),
            {"name": role_name},
        ).fetchone()
        if role_row:
            role_id = role_row[0]
            for p_code in perm_codes:
                perm_row = bind.execute(
                    sa.text("SELECT id FROM permissions WHERE code = :code LIMIT 1"),
                    {"code": p_code},
                ).fetchone()
                if perm_row:
                    perm_id = perm_row[0]
                    bind.execute(
                        sa.text(
                            "INSERT INTO role_permissions (role_id, permission_id) "
                            "VALUES (:role_id, :perm_id) "
                            "ON CONFLICT (role_id, permission_id) DO NOTHING"
                        ),
                        {"role_id": role_id, "perm_id": perm_id},
                    )


def downgrade() -> None:
    op.drop_table("engagement_handovers")
    op.drop_table("engagement_change_requests")
    op.drop_table("engagement_issues")
    op.drop_table("engagement_uat_test_cases")
    op.drop_table("engagement_uat_sessions")
    op.drop_table("engagement_weekly_reports")
    op.drop_table("agreement_signatures")
    op.drop_table("engagement_agreements")
    op.drop_table("engagement_proposals")
    op.drop_table("client_engagements")
