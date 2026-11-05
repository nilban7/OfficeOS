"""internship documents, students cohort, and stipend disbursements

Revision ID: 0034_internship_docs_stipends
Revises: 0033_chat_security_visibility
Create Date: 2026-11-05
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0034_internship_docs_stipends"
down_revision: Union[str, None] = "0033_chat_security_visibility"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. internship_students table
    op.execute("""
        CREATE TABLE IF NOT EXISTS internship_students (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            internship_id UUID NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
            student_name VARCHAR(200) NOT NULL,
            student_email VARCHAR(255),
            institution VARCHAR(255),
            stipend NUMERIC(14, 2) DEFAULT 0.00,
            status VARCHAR(30) DEFAULT 'active' NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            CONSTRAINT uq_internship_students_org_id UNIQUE (organization_id, id),
            CONSTRAINT ck_internship_students_status CHECK (status IN ('planned', 'active', 'completed', 'terminated'))
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_internship_students_org ON internship_students (organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_internship_students_internship ON internship_students (internship_id)")

    # 2. internship_documents table
    op.execute("""
        CREATE TABLE IF NOT EXISTS internship_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            internship_id UUID NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            document_type VARCHAR(100) DEFAULT 'other' NOT NULL,
            intern_name VARCHAR(200),
            file_name VARCHAR(255) NOT NULL,
            file_size BIGINT DEFAULT 0 NOT NULL,
            mime_type VARCHAR(100) DEFAULT 'application/pdf' NOT NULL,
            file_url TEXT,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            CONSTRAINT uq_internship_documents_org_id UNIQUE (organization_id, id),
            CONSTRAINT ck_internship_documents_type CHECK (
                document_type IN ('offer_letter', 'agreement_nda', 'id_proof', 'college_noc', 'completion_certificate', 'evaluation_report', 'other')
            )
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_internship_documents_org ON internship_documents (organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_internship_documents_internship ON internship_documents (internship_id)")

    # 3. internship_stipend_disbursements table
    op.execute("""
        CREATE TABLE IF NOT EXISTS internship_stipend_disbursements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            payroll_id UUID REFERENCES payrolls(id) ON DELETE SET NULL,
            internship_id UUID NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
            intern_name VARCHAR(200) NOT NULL,
            period_month INTEGER NOT NULL,
            period_year INTEGER NOT NULL,
            stipend_amount NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
            status VARCHAR(30) DEFAULT 'pending' NOT NULL,
            payment_method VARCHAR(50) DEFAULT 'bank_transfer' NOT NULL,
            payment_reference VARCHAR(100),
            disbursed_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            CONSTRAINT uq_internship_stipends_org_id UNIQUE (organization_id, id),
            CONSTRAINT ck_internship_stipends_status CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
            CONSTRAINT ck_internship_stipends_month CHECK (period_month BETWEEN 1 AND 12),
            CONSTRAINT ck_internship_stipends_year CHECK (period_year >= 2020)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_internship_stipends_org ON internship_stipend_disbursements (organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_internship_stipends_payroll ON internship_stipend_disbursements (payroll_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_internship_stipends_internship ON internship_stipend_disbursements (internship_id)")

    # 4. RLS & Tenant Isolation
    tables = ("internship_students", "internship_documents", "internship_stipend_disbursements")
    user_context = "current_setting('app.current_user_id', true) IS NOT NULL"
    org_context = "current_setting('app.current_organization_id', true) IS NOT NULL"
    user_setting_uuid = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"
    org_setting_uuid = "NULLIF(current_setting('app.current_organization_id', true), '')::uuid"

    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table};")
        op.execute(
            f"CREATE POLICY {table}_member ON {table} FOR ALL USING ("
            f"{user_context} AND {org_context} "
            f"AND organization_id = {org_setting_uuid} "
            f"AND public.is_org_member(organization_id, {user_setting_uuid}));"
        )


def downgrade() -> None:
    tables = ("internship_stipend_disbursements", "internship_documents", "internship_students")
    for table in tables:
        op.execute(f"DROP POLICY IF EXISTS {table}_member ON {table};")
        op.execute(f"DROP TABLE IF EXISTS {table};")
