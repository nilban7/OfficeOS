"""PostgreSQL Row Level Security (RLS) integration tests for Documents Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Documents, document_versions, and document_permissions are strictly isolated by organization_id
2. Cross-tenant mutations (update/delete) are blocked by RLS
3. Missing user/org context denies access (fail-closed)
4. Composite foreign keys prevent cross-tenant document/version/permission association
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

pytestmark = pytest.mark.skipif(
    not os.getenv("RLS_TEST_DATABASE_URL"),
    reason="Set RLS_TEST_DATABASE_URL to run PostgreSQL cross-tenant integration tests",
)


@pytest.fixture
async def rls_engine():
    db_url = os.environ["RLS_TEST_DATABASE_URL"]
    engine = create_async_engine(db_url, echo=False)
    yield engine
    await engine.dispose()


@pytest.fixture
async def multi_tenant_fixture(rls_engine):
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()
    auth_user_a = uuid.uuid4()
    auth_user_b = uuid.uuid4()
    prof_a = uuid.uuid4()
    prof_b = uuid.uuid4()
    emp_a = uuid.uuid4()
    emp_b = uuid.uuid4()
    doc_a = uuid.uuid4()
    doc_b = uuid.uuid4()
    ver_a = uuid.uuid4()
    ver_b = uuid.uuid4()
    perm_a = uuid.uuid4()
    perm_b = uuid.uuid4()

    async with rls_engine.begin() as conn:
        # 1. Seed Orgs
        await conn.execute(
            text(
                "INSERT INTO organizations (id, name, slug) VALUES (:id_a, 'Org A', :slug_a), (:id_b, 'Org B', :slug_b)"
            ),
            {
                "id_a": org_a_id,
                "slug_a": f"org-a-{org_a_id.hex[:6]}",
                "id_b": org_b_id,
                "slug_b": f"org-b-{org_b_id.hex[:6]}",
            },
        )
        # 2. Seed Profiles
        await conn.execute(
            text(
                "INSERT INTO profiles (id, auth_user_id, email, first_name, last_name) "
                "VALUES (:p_a, :u_a, 'a@test.com', 'Alice', 'A'), (:p_b, :u_b, 'b@test.com', 'Bob', 'B')"
            ),
            {"p_a": prof_a, "u_a": auth_user_a, "p_b": prof_b, "u_b": auth_user_b},
        )
        # 3. Seed Memberships
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) "
                "VALUES (gen_random_uuid(), :o_a, :p_a, 'active'), (gen_random_uuid(), :o_b, :p_b, 'active')"
            ),
            {"o_a": org_a_id, "p_a": prof_a, "o_b": org_b_id, "p_b": prof_b},
        )
        # 4. Seed Employees
        await conn.execute(
            text(
                "INSERT INTO employees (id, organization_id, employee_code, first_name, last_name, designation, date_of_joining) "
                "VALUES (:e_a, :o_a, 'EMP-A', 'Emp', 'A', 'Analyst', '2025-01-01'), "
                "       (:e_b, :o_b, 'EMP-B', 'Emp', 'B', 'Analyst', '2025-01-01')"
            ),
            {"e_a": emp_a, "o_a": org_a_id, "e_b": emp_b, "o_b": org_b_id},
        )
        # 5. Seed Documents
        await conn.execute(
            text(
                "INSERT INTO documents (id, organization_id, document_number, title, category, document_type, owner_id, status, storage_path, original_filename, mime_type, file_size) "
                "VALUES (:d_a, :o_a, 'DOC-A', 'Doc A', 'Contract', 'PDF', :e_a, 'active', 'path/a.pdf', 'a.pdf', 'application/pdf', 1000), "
                "       (:d_b, :o_b, 'DOC-B', 'Doc B', 'Policy', 'PDF', :e_b, 'active', 'path/b.pdf', 'b.pdf', 'application/pdf', 2000)"
            ),
            {"d_a": doc_a, "o_a": org_a_id, "e_a": emp_a, "d_b": doc_b, "o_b": org_b_id, "e_b": emp_b},
        )
        # 6. Seed Document Versions
        await conn.execute(
            text(
                "INSERT INTO document_versions (id, organization_id, document_id, version_number, storage_path, original_filename, mime_type, file_size, uploaded_by_id, created_at) "
                "VALUES (:v_a, :o_a, :d_a, 1, 'path/a.pdf', 'a.pdf', 'application/pdf', 1000, :e_a, NOW()), "
                "       (:v_b, :o_b, :d_b, 1, 'path/b.pdf', 'b.pdf', 'application/pdf', 2000, :e_b, NOW())"
            ),
            {"v_a": ver_a, "o_a": org_a_id, "d_a": doc_a, "e_a": emp_a, "v_b": ver_b, "o_b": org_b_id, "d_b": doc_b, "e_b": emp_b},
        )
        # 7. Seed Document Permissions
        await conn.execute(
            text(
                "INSERT INTO document_permissions (id, organization_id, document_id, grantee_type, grantee_id, permission_level, created_at) "
                "VALUES (:pm_a, :o_a, :d_a, 'employee', :e_a, 'edit', NOW()), "
                "       (:pm_b, :o_b, :d_b, 'employee', :e_b, 'view', NOW())"
            ),
            {"pm_a": perm_a, "o_a": org_a_id, "d_a": doc_a, "e_a": emp_a, "pm_b": perm_b, "o_b": org_b_id, "d_b": doc_b, "e_b": emp_b},
        )

    yield {
        "org_a": org_a_id,
        "org_b": org_b_id,
        "user_a": auth_user_a,
        "user_b": auth_user_b,
        "emp_a": emp_a,
        "emp_b": emp_b,
        "doc_a": doc_a,
        "doc_b": doc_b,
        "ver_a": ver_a,
        "ver_b": ver_b,
        "perm_a": perm_a,
        "perm_b": perm_b,
    }

    # Teardown
    async with rls_engine.begin() as conn:
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:a, :b)"), {"a": org_a_id, "b": org_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:a, :b)"), {"a": prof_a, "b": prof_b})


@pytest.mark.asyncio
async def test_documents_rls_tenant_isolation(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    async with rls_engine.connect() as conn:
        # Set Tenant A context
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text(f"SET LOCAL app.user_id = '{ctx['user_a']}'"))
        await conn.execute(text(f"SET LOCAL app.organization_id = '{ctx['org_a']}'"))

        # 1. Documents isolation
        res_doc = await conn.execute(text("SELECT id FROM documents"))
        doc_ids = [r[0] for r in res_doc.fetchall()]
        assert ctx["doc_a"] in doc_ids
        assert ctx["doc_b"] not in doc_ids

        # 2. Versions isolation
        res_ver = await conn.execute(text("SELECT id FROM document_versions"))
        ver_ids = [r[0] for r in res_ver.fetchall()]
        assert ctx["ver_a"] in ver_ids
        assert ctx["ver_b"] not in ver_ids

        # 3. Permissions isolation
        res_perm = await conn.execute(text("SELECT id FROM document_permissions"))
        perm_ids = [r[0] for r in res_perm.fetchall()]
        assert ctx["perm_a"] in perm_ids
        assert ctx["perm_b"] not in perm_ids

        # Verify cross-tenant update is blocked
        res_up = await conn.execute(
            text("UPDATE documents SET title = 'Hacked Document' WHERE id = :id"),
            {"id": ctx["doc_b"]},
        )
        assert res_up.rowcount == 0

        # Verify cross-tenant delete is blocked
        res_del = await conn.execute(
            text("DELETE FROM documents WHERE id = :id"),
            {"id": ctx["doc_b"]},
        )
        assert res_del.rowcount == 0


@pytest.mark.asyncio
async def test_documents_rls_missing_context_fails(rls_engine, multi_tenant_fixture):
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("RESET app.user_id"))
        await conn.execute(text("RESET app.organization_id"))

        res_doc = await conn.execute(text("SELECT id FROM documents"))
        assert len(res_doc.fetchall()) == 0

        res_ver = await conn.execute(text("SELECT id FROM document_versions"))
        assert len(res_ver.fetchall()) == 0

        res_perm = await conn.execute(text("SELECT id FROM document_permissions"))
        assert len(res_perm.fetchall()) == 0


@pytest.mark.asyncio
async def test_documents_composite_foreign_keys_cross_tenant_prevention(rls_engine, multi_tenant_fixture):
    ctx = multi_tenant_fixture

    # Attempt to create version in Org A referencing Document in Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO document_versions (id, organization_id, document_id, version_number, storage_path, original_filename, mime_type, file_size, uploaded_by_id, created_at) "
                    "VALUES (gen_random_uuid(), :o_a, :d_b, 2, 'path/cross.pdf', 'cross.pdf', 'application/pdf', 500, :e_a, NOW())"
                ),
                {"o_a": ctx["org_a"], "d_b": ctx["doc_b"], "e_a": ctx["emp_a"]},
            )

    # Attempt to create permission in Org A referencing Document in Org B
    async with rls_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO document_permissions (id, organization_id, document_id, grantee_type, grantee_id, permission_level, created_at) "
                    "VALUES (gen_random_uuid(), :o_a, :d_b, 'employee', :e_a, 'view', NOW())"
                ),
                {"o_a": ctx["org_a"], "d_b": ctx["doc_b"], "e_a": ctx["emp_a"]},
            )
