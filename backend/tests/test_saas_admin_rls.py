"""Live PostgreSQL Row Level Security (RLS) integration tests for SaaS Administration module.

Validates against real Supabase/PostgreSQL database:
1. Platform configuration is strictly restricted to system_admin; non-admin users get 0 rows.
2. Missing auth/user context fails closed on platform tables.
3. Platform announcements target-based visibility:
   - 'all' targets are visible to all tenant users
   - 'specific_orgs' targets are visible only to the specified organization
   - Inactive announcements are hidden from normal tenants
   - system_admin can manage and view all announcements
4. Cross-tenant organization access:
   - system_admin can view all organizations across tenants
   - normal tenant user can only view their own organization
5. Cross-tenant audit logs:
   - system_admin can view audit logs across all organizations
   - normal tenant user can only view audit logs for their tenant
"""

import json
import os
import uuid

import pytest
from sqlalchemy import text
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
async def saas_admin_rls_fixture(rls_engine):
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()

    sys_admin_user_id = uuid.uuid4()
    sys_admin_prof_id = uuid.uuid4()

    tenant_a_user_id = uuid.uuid4()
    tenant_a_prof_id = uuid.uuid4()

    tenant_b_user_id = uuid.uuid4()
    tenant_b_prof_id = uuid.uuid4()

    ann_all_id = uuid.uuid4()
    ann_a_only_id = uuid.uuid4()
    ann_inactive_id = uuid.uuid4()

    async with rls_engine.begin() as conn:
        # Get role IDs for system_admin and employee / organization_admin
        sys_role_res = await conn.execute(text("SELECT id FROM roles WHERE name = 'system_admin' LIMIT 1"))
        sys_role_id = sys_role_res.scalar_one()

        emp_role_res = await conn.execute(text("SELECT id FROM roles WHERE name = 'employee' LIMIT 1"))
        emp_role_id = emp_role_res.scalar_one()

        # 1. Organizations
        await conn.execute(
            text(
                "INSERT INTO organizations (id, name, slug, status) VALUES "
                "(:id_a, 'SaaS Org A', :slug_a, 'active'), (:id_b, 'SaaS Org B', :slug_b, 'active')"
            ),
            {
                "id_a": org_a_id,
                "slug_a": f"saas-org-a-{org_a_id.hex[:6]}",
                "id_b": org_b_id,
                "slug_b": f"saas-org-b-{org_b_id.hex[:6]}",
            },
        )

        # 2. Profiles
        await conn.execute(
            text(
                "INSERT INTO profiles (id, auth_user_id, email, first_name, last_name) VALUES "
                "(:p_sys, :u_sys, :email_sys, 'Sys', 'Admin'), "
                "(:p_a, :u_a, :email_a, 'Alice', 'TenantA'), "
                "(:p_b, :u_b, :email_b, 'Bob', 'TenantB')"
            ),
            {
                "p_sys": sys_admin_prof_id,
                "u_sys": sys_admin_user_id,
                "email_sys": f"sysadmin-{sys_admin_user_id.hex[:6]}@example.com",
                "p_a": tenant_a_prof_id,
                "u_a": tenant_a_user_id,
                "email_a": f"alice-{tenant_a_user_id.hex[:6]}@example.com",
                "p_b": tenant_b_prof_id,
                "u_b": tenant_b_user_id,
                "email_b": f"bob-{tenant_b_user_id.hex[:6]}@example.com",
            },
        )

        # 3. Memberships
        mem_sys_id = uuid.uuid4()
        mem_a_id = uuid.uuid4()
        mem_b_id = uuid.uuid4()

        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) VALUES "
                "(:m_sys, :org_a, :p_sys, 'active'), "
                "(:m_a, :org_a, :p_a, 'active'), "
                "(:m_b, :org_b, :p_b, 'active')"
            ),
            {
                "m_sys": mem_sys_id,
                "org_a": org_a_id,
                "p_sys": sys_admin_prof_id,
                "m_a": mem_a_id,
                "p_a": tenant_a_prof_id,
                "m_b": mem_b_id,
                "org_b": org_b_id,
                "p_b": tenant_b_prof_id,
            },
        )

        # 4. Membership Roles
        await conn.execute(
            text(
                "INSERT INTO membership_roles (membership_id, role_id) VALUES "
                "(:m_sys, :r_sys), "
                "(:m_a, :r_emp), "
                "(:m_b, :r_emp)"
            ),
            {
                "m_sys": mem_sys_id,
                "r_sys": sys_role_id,
                "m_a": mem_a_id,
                "r_emp": emp_role_id,
                "m_b": mem_b_id,
            },
        )

        # 5. Platform Announcements
        await conn.execute(
            text(
                "INSERT INTO platform_announcements (id, title, content, severity, is_active, target_type, target_org_ids) VALUES "
                "(:id_all, 'Global Notice', 'To all tenants', 'info', true, 'all', '[]'::jsonb), "
                "(:id_a_only, 'Org A Notice', 'Only for Org A', 'warning', true, 'specific_orgs', :target_a), "
                "(:id_inact, 'Inactive Notice', 'Draft notice', 'critical', false, 'all', '[]'::jsonb)"
            ),
            {
                "id_all": ann_all_id,
                "id_a_only": ann_a_only_id,
                "target_a": json.dumps([str(org_a_id)]),
                "id_inact": ann_inactive_id,
            },
        )

        # 6. Audit Logs
        await conn.execute(
            text(
                "INSERT INTO audit_logs (id, organization_id, actor_id, action, entity_type, entity_id) VALUES "
                "(gen_random_uuid(), :org_a, :p_a, 'create', 'test_entity', :org_a), "
                "(gen_random_uuid(), :org_b, :p_b, 'create', 'test_entity', :org_b)"
            ),
            {
                "org_a": org_a_id,
                "p_a": tenant_a_prof_id,
                "org_b": org_b_id,
                "p_b": tenant_b_prof_id,
            },
        )

    yield {
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "sys_admin_user_id": sys_admin_user_id,
        "tenant_a_user_id": tenant_a_user_id,
        "tenant_b_user_id": tenant_b_user_id,
        "ann_all_id": ann_all_id,
        "ann_a_only_id": ann_a_only_id,
        "ann_inactive_id": ann_inactive_id,
    }

    # Teardown
    async with rls_engine.begin() as conn:
        await conn.execute(text("SELECT set_config('app.allow_audit_log_cleanup', 'true', true)"))
        await conn.execute(
            text("DELETE FROM platform_announcements WHERE id IN (:id1, :id2, :id3)"),
            {"id1": ann_all_id, "id2": ann_a_only_id, "id3": ann_inactive_id},
        )
        await conn.execute(
            text("DELETE FROM organizations WHERE id IN (:id_a, :id_b)"),
            {"id_a": org_a_id, "id_b": org_b_id},
        )
        await conn.execute(
            text("DELETE FROM profiles WHERE id IN (:p1, :p2, :p3)"),
            {"p1": sys_admin_prof_id, "p2": tenant_a_prof_id, "p3": tenant_b_prof_id},
        )


@pytest.mark.asyncio
async def test_platform_config_rls_system_admin_allowed(rls_engine, saas_admin_rls_fixture):
    """Verify system_admin can read platform configuration."""
    f = saas_admin_rls_fixture
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["sys_admin_user_id"])})

        count = (await conn.execute(text("SELECT count(*) FROM platform_configurations"))).scalar_one()
        assert count >= 1


@pytest.mark.asyncio
async def test_platform_config_rls_non_system_admin_denied(rls_engine, saas_admin_rls_fixture):
    """Verify non-system_admin (normal tenant user) cannot read platform configuration (returns 0 rows)."""
    f = saas_admin_rls_fixture
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["tenant_a_user_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_a_id"])})

        count = (await conn.execute(text("SELECT count(*) FROM platform_configurations"))).scalar_one()
        assert count == 0


@pytest.mark.asyncio
async def test_platform_config_rls_missing_context_fails_closed(rls_engine, saas_admin_rls_fixture):
    """Verify missing user context fails closed (0 rows)."""
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', '', true)"))

        count = (await conn.execute(text("SELECT count(*) FROM platform_configurations"))).scalar_one()
        assert count == 0


@pytest.mark.asyncio
async def test_platform_announcements_rls_tenant_visibility(rls_engine, saas_admin_rls_fixture):
    """Verify announcements target filtering for normal tenants."""
    f = saas_admin_rls_fixture

    # Tenant A sees 'all' and 'specific_orgs' (matching org_a_id), but NOT inactive
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["tenant_a_user_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_a_id"])})

        ann_titles = (await conn.execute(text(
            "SELECT title FROM platform_announcements WHERE id IN (:id1, :id2, :id3)"
        ), {"id1": f["ann_all_id"], "id2": f["ann_a_only_id"], "id3": f["ann_inactive_id"]})).scalars().all()

        assert set(ann_titles) == {"Global Notice", "Org A Notice"}

    # Tenant B sees ONLY 'all' target, NOT Org A's notice or inactive
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["tenant_b_user_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_b_id"])})

        ann_titles_b = (await conn.execute(text(
            "SELECT title FROM platform_announcements WHERE id IN (:id1, :id2, :id3)"
        ), {"id1": f["ann_all_id"], "id2": f["ann_a_only_id"], "id3": f["ann_inactive_id"]})).scalars().all()

        assert set(ann_titles_b) == {"Global Notice"}

    # system_admin sees all announcements including inactive
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["sys_admin_user_id"])})

        ann_titles_sys = (await conn.execute(text(
            "SELECT title FROM platform_announcements WHERE id IN (:id1, :id2, :id3)"
        ), {"id1": f["ann_all_id"], "id2": f["ann_a_only_id"], "id3": f["ann_inactive_id"]})).scalars().all()

        assert set(ann_titles_sys) == {"Global Notice", "Org A Notice", "Inactive Notice"}


@pytest.mark.asyncio
async def test_organizations_cross_tenant_system_admin(rls_engine, saas_admin_rls_fixture):
    """Verify system_admin can view cross-tenant organizations under RLS, while tenant user is isolated."""
    f = saas_admin_rls_fixture

    # system_admin sees both Org A and Org B
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["sys_admin_user_id"])})

        orgs = (await conn.execute(text(
            "SELECT id FROM organizations WHERE id IN (:id_a, :id_b)"
        ), {"id_a": f["org_a_id"], "id_b": f["org_b_id"]})).scalars().all()

        assert len(orgs) == 2

    # Tenant B user only sees Org B (their own organization)
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["tenant_b_user_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_b_id"])})

        orgs_b = (await conn.execute(text(
            "SELECT id FROM organizations WHERE id IN (:id_a, :id_b)"
        ), {"id_a": f["org_a_id"], "id_b": f["org_b_id"]})).scalars().all()

        assert len(orgs_b) == 1
        assert orgs_b[0] == f["org_b_id"]


@pytest.mark.asyncio
async def test_audit_logs_cross_tenant_system_admin(rls_engine, saas_admin_rls_fixture):
    """Verify system_admin can view cross-tenant audit logs under RLS, while tenant user is isolated."""
    f = saas_admin_rls_fixture

    # system_admin sees both Org A and Org B audit logs
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["sys_admin_user_id"])})

        logs = (await conn.execute(text(
            "SELECT count(*) FROM audit_logs WHERE organization_id IN (:id_a, :id_b)"
        ), {"id_a": f["org_a_id"], "id_b": f["org_b_id"]})).scalar_one()

        assert logs == 2

    # Tenant A user only sees Org A audit logs
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": str(f["tenant_a_user_id"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :oid, true)"), {"oid": str(f["org_a_id"])})

        logs_a = (await conn.execute(text(
            "SELECT count(*) FROM audit_logs WHERE organization_id IN (:id_a, :id_b)"
        ), {"id_a": f["org_a_id"], "id_b": f["org_b_id"]})).scalar_one()

        assert logs_a == 1
