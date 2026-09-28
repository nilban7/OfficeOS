"""PostgreSQL Row Level Security (RLS) integration tests for Client Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Clients are strictly isolated by organization_id
2. Client contacts are strictly isolated by organization_id
3. Cross-tenant mutations (update/delete) are blocked by RLS
4. Missing user/org context denies access (fail-closed)
5. Database-level composite foreign key prevents cross-tenant client/contact association
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
    client_a = uuid.uuid4()
    client_b = uuid.uuid4()
    contact_a = uuid.uuid4()
    contact_b = uuid.uuid4()

    async with rls_engine.begin() as conn:
        # Seed Tenant A & B Orgs
        await conn.execute(
            text(
                "INSERT INTO organizations (id, name, slug) VALUES (:id_a, 'Org A', :slug_a), (:id_b, 'Org B', :slug_b)"
            ),
            {"id_a": org_a_id, "slug_a": f"org-a-{org_a_id.hex[:6]}", "id_b": org_b_id, "slug_b": f"org-b-{org_b_id.hex[:6]}"},
        )
        # Seed Profiles
        await conn.execute(
            text(
                "INSERT INTO profiles (id, auth_user_id, email, first_name, last_name) "
                "VALUES (:p_a, :u_a, 'a@test.com', 'Alice', 'A'), (:p_b, :u_b, 'b@test.com', 'Bob', 'B')"
            ),
            {"p_a": prof_a, "u_a": auth_user_a, "p_b": prof_b, "u_b": auth_user_b},
        )
        # Seed Memberships
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) "
                "VALUES (gen_random_uuid(), :o_a, :p_a, 'active'), (gen_random_uuid(), :o_b, :p_b, 'active')"
            ),
            {"o_a": org_a_id, "p_a": prof_a, "o_b": org_b_id, "p_b": prof_b},
        )
        # Seed Clients
        await conn.execute(
            text(
                "INSERT INTO clients (id, organization_id, client_code, name, status) "
                "VALUES (:c_a, :o_a, 'CLI-A', 'Client A', 'active'), (:c_b, :o_b, 'CLI-B', 'Client B', 'active')"
            ),
            {"c_a": client_a, "o_a": org_a_id, "c_b": client_b, "o_b": org_b_id},
        )
        # Seed Contacts
        await conn.execute(
            text(
                "INSERT INTO client_contacts (id, organization_id, client_id, name, is_primary) "
                "VALUES (:ct_a, :o_a, :c_a, 'Contact A', true), (:ct_b, :o_b, :c_b, 'Contact B', true)"
            ),
            {"ct_a": contact_a, "o_a": org_a_id, "c_a": client_a, "ct_b": contact_b, "o_b": org_b_id, "c_b": client_b},
        )

    yield {
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "auth_user_a": auth_user_a,
        "auth_user_b": auth_user_b,
        "client_a": client_a,
        "client_b": client_b,
        "contact_a": contact_a,
        "contact_b": contact_b,
    }

    # Cleanup
    async with rls_engine.begin() as conn:
        await conn.execute(text("DELETE FROM client_contacts WHERE id IN (:ct_a, :ct_b)"), {"ct_a": contact_a, "ct_b": contact_b})
        await conn.execute(text("DELETE FROM clients WHERE id IN (:c_a, :c_b)"), {"c_a": client_a, "c_b": client_b})
        await conn.execute(text("DELETE FROM organization_memberships WHERE organization_id IN (:o_a, :o_b)"), {"o_a": org_a_id, "o_b": org_b_id})
        await conn.execute(text("DELETE FROM profiles WHERE id IN (:p_a, :p_b)"), {"p_a": prof_a, "p_b": prof_b})
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:o_a, :o_b)"), {"o_a": org_a_id, "o_b": org_b_id})


@pytest.mark.asyncio
async def test_clients_and_contacts_cross_tenant_isolation(rls_engine, multi_tenant_fixture):
    f = multi_tenant_fixture

    # Test as User A in Org A
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": str(f["auth_user_a"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": str(f["org_a_id"])})

        clients = (await conn.execute(text("SELECT id, name FROM clients"))).all()
        assert len(clients) == 1
        assert clients[0].id == f["client_a"]

        contacts = (await conn.execute(text("SELECT id, name FROM client_contacts"))).all()
        assert len(contacts) == 1
        assert contacts[0].id == f["contact_a"]

        # Cross-tenant mutation blocked: Tenant A cannot update Tenant B client
        res = await conn.execute(
            text("UPDATE clients SET name = 'Hacked' WHERE id = :id"),
            {"id": f["client_b"]},
        )
        assert res.rowcount == 0

        # Tenant A cannot delete Tenant B contact
        del_res = await conn.execute(
            text("DELETE FROM client_contacts WHERE id = :id"),
            {"id": f["contact_b"]},
        )
        assert del_res.rowcount == 0

    # Test as User B in Org B
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(text("SELECT set_config('app.user_id', :user_id, true)"), {"user_id": str(f["auth_user_b"])})
        await conn.execute(text("SELECT set_config('app.organization_id', :org_id, true)"), {"org_id": str(f["org_b_id"])})

        clients_b = (await conn.execute(text("SELECT id, name FROM clients"))).all()
        assert len(clients_b) == 1
        assert clients_b[0].id == f["client_b"]

        contacts_b = (await conn.execute(text("SELECT id, name FROM client_contacts"))).all()
        assert len(contacts_b) == 1
        assert contacts_b[0].id == f["contact_b"]


@pytest.mark.asyncio
async def test_clients_fail_closed_without_context(rls_engine, multi_tenant_fixture):
    async with rls_engine.begin() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))

        clients = (await conn.execute(text("SELECT * FROM clients"))).all()
        assert len(clients) == 0

        contacts = (await conn.execute(text("SELECT * FROM client_contacts"))).all()
        assert len(contacts) == 0


@pytest.mark.asyncio
async def test_composite_foreign_key_blocks_cross_tenant_association(rls_engine, multi_tenant_fixture):
    f = multi_tenant_fixture

    async with rls_engine.connect() as conn:
        # Attempt to insert contact belonging to Org A but referencing Client B (Org B)
        # Even without RLS or with bypass, the composite FK fk_client_contacts_clients_org rejects this at the schema level!
        with pytest.raises(IntegrityError):
            async with conn.begin():
                await conn.execute(
                    text(
                        "INSERT INTO client_contacts (id, organization_id, client_id, name, is_primary) "
                        "VALUES (gen_random_uuid(), :o_a, :c_b, 'Illegal Cross-Tenant Contact', false)"
                    ),
                    {"o_a": f["org_a_id"], "c_b": f["client_b"]},
                )
