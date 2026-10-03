"""PostgreSQL Row Level Security (RLS) integration tests for Notifications Management module.

These tests execute against a real PostgreSQL instance when RLS_TEST_DATABASE_URL is set.
They verify:
1. Cross-tenant notification access fails (tenant A user cannot see tenant B notifications).
2. Same-tenant recipient isolation (user A1 cannot see user A2 notifications in same tenant).
3. User A1 can mark own notification read, but cannot mark/update user A2 notification read.
4. Mark-all-read under RLS affects only authenticated user's notifications.
5. Missing user or organization context fails closed.
6. Notification preferences cannot cross tenant or user scope.
7. Composite foreign key constraint prevents creating a notification or preference for a recipient in another tenant.
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
async def multi_tenant_notifications_fixture(rls_engine):
    org_a_id = uuid.uuid4()
    org_b_id = uuid.uuid4()

    auth_user_a1 = uuid.uuid4()
    auth_user_a2 = uuid.uuid4()
    auth_user_b = uuid.uuid4()

    prof_a1 = uuid.uuid4()
    prof_a2 = uuid.uuid4()
    prof_b = uuid.uuid4()

    notif_a1 = uuid.uuid4()
    notif_a2 = uuid.uuid4()
    notif_b = uuid.uuid4()

    pref_a1 = uuid.uuid4()
    pref_b = uuid.uuid4()

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
                "VALUES (:p_a1, :u_a1, 'a1@test.com', 'Alice', 'One'), "
                "       (:p_a2, :u_a2, 'a2@test.com', 'Aaron', 'Two'), "
                "       (:p_b, :u_b, 'b@test.com', 'Bob', 'Three')"
            ),
            {
                "p_a1": prof_a1,
                "u_a1": auth_user_a1,
                "p_a2": prof_a2,
                "u_a2": auth_user_a2,
                "p_b": prof_b,
                "u_b": auth_user_b,
            },
        )
        # 3. Seed Memberships
        await conn.execute(
            text(
                "INSERT INTO organization_memberships (id, organization_id, profile_id, status) "
                "VALUES (gen_random_uuid(), :o_a, :p_a1, 'active'), "
                "       (gen_random_uuid(), :o_a, :p_a2, 'active'), "
                "       (gen_random_uuid(), :o_b, :p_b, 'active')"
            ),
            {
                "o_a": org_a_id,
                "p_a1": prof_a1,
                "p_a2": prof_a2,
                "o_b": org_b_id,
                "p_b": prof_b,
            },
        )
        # 4. Seed Notifications
        await conn.execute(
            text(
                "INSERT INTO notifications (id, organization_id, recipient_id, notification_type, title, message) "
                "VALUES (:n_a1, :o_a, :p_a1, 'task', 'Task for Alice', 'Please review code'), "
                "       (:n_a2, :o_a, :p_a2, 'leave', 'Leave for Aaron', 'Leave approved'), "
                "       (:n_b, :o_b, :p_b, 'finance', 'Invoice for Bob', 'Invoice paid')"
            ),
            {
                "n_a1": notif_a1,
                "o_a": org_a_id,
                "p_a1": prof_a1,
                "n_a2": notif_a2,
                "p_a2": prof_a2,
                "n_b": notif_b,
                "o_b": org_b_id,
                "p_b": prof_b,
            },
        )
        # 5. Seed Preferences
        await conn.execute(
            text(
                "INSERT INTO notification_preferences (id, organization_id, recipient_id, notification_type, in_app_enabled) "
                "VALUES (:pref_a1, :o_a, :p_a1, 'task', true), "
                "       (:pref_b, :o_b, :p_b, 'finance', false)"
            ),
            {
                "pref_a1": pref_a1,
                "o_a": org_a_id,
                "p_a1": prof_a1,
                "pref_b": pref_b,
                "o_b": org_b_id,
                "p_b": prof_b,
            },
        )

    yield {
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "auth_user_a1": auth_user_a1,
        "auth_user_a2": auth_user_a2,
        "auth_user_b": auth_user_b,
        "prof_a1": prof_a1,
        "prof_a2": prof_a2,
        "prof_b": prof_b,
        "notif_a1": notif_a1,
        "notif_a2": notif_a2,
        "notif_b": notif_b,
        "pref_a1": pref_a1,
        "pref_b": pref_b,
    }

    # Cleanup
    async with rls_engine.begin() as conn:
        await conn.execute(text("DELETE FROM organizations WHERE id IN (:id_a, :id_b)"), {"id_a": org_a_id, "id_b": org_b_id})
        await conn.execute(
            text("DELETE FROM profiles WHERE id IN (:p_a1, :p_a2, :p_b)"),
            {"p_a1": prof_a1, "p_a2": prof_a2, "p_b": prof_b},
        )


@pytest.mark.asyncio
async def test_notifications_rls_tenant_and_user_isolation(rls_engine, multi_tenant_notifications_fixture):
    """User A1 can only see and modify their own notifications in Org A, never Org B or User A2."""
    f = multi_tenant_notifications_fixture

    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text("SELECT set_config('app.user_id', :u, true)"),
            {"u": str(f["auth_user_a1"])},
        )
        await conn.execute(
            text("SELECT set_config('app.organization_id', :o, true)"),
            {"o": str(f["org_a_id"])},
        )

        # 1. SELECT notifications: only Notif A1 visible
        res = await conn.execute(text("SELECT id, title FROM notifications"))
        rows = res.fetchall()
        assert len(rows) == 1
        assert rows[0][0] == f["notif_a1"]
        assert rows[0][1] == "Task for Alice"

        # 2. SELECT preferences: only Pref A1 visible
        res_pref = await conn.execute(text("SELECT id, notification_type FROM notification_preferences"))
        pref_rows = res_pref.fetchall()
        assert len(pref_rows) == 1
        assert pref_rows[0][0] == f["pref_a1"]

        # 3. UPDATE own notification: succeeds
        upd_own = await conn.execute(
            text("UPDATE notifications SET read_at = now() WHERE id = :id"),
            {"id": f["notif_a1"]},
        )
        assert upd_own.rowcount == 1

        # 4. UPDATE coworker's notification in same org: blocked by RLS (0 rows affected)
        upd_coworker = await conn.execute(
            text("UPDATE notifications SET read_at = now() WHERE id = :id"),
            {"id": f["notif_a2"]},
        )
        assert upd_coworker.rowcount == 0

        # 5. UPDATE other tenant's notification: blocked by RLS (0 rows affected)
        upd_tenant_b = await conn.execute(
            text("UPDATE notifications SET read_at = now() WHERE id = :id"),
            {"id": f["notif_b"]},
        )
        assert upd_tenant_b.rowcount == 0

        # 6. DELETE coworker's notification: blocked by RLS (0 rows affected)
        del_coworker = await conn.execute(
            text("DELETE FROM notifications WHERE id = :id"),
            {"id": f["notif_a2"]},
        )
        assert del_coworker.rowcount == 0


@pytest.mark.asyncio
async def test_notifications_rls_missing_context_fails(rls_engine, multi_tenant_notifications_fixture):
    """Without transaction context, all queries fail closed."""
    async with rls_engine.connect() as conn:
        await conn.execute(text("SET LOCAL ROLE authenticated"))

        # No app.user_id or app.organization_id set
        res = await conn.execute(text("SELECT * FROM notifications"))
        assert len(res.fetchall()) == 0

        res_pref = await conn.execute(text("SELECT * FROM notification_preferences"))
        assert len(res_pref.fetchall()) == 0


@pytest.mark.asyncio
async def test_notifications_composite_fk_and_cross_tenant_recipient_prevention(
    rls_engine, multi_tenant_notifications_fixture
):
    """Composite FK prevents targeting a recipient who is not a member of that organization."""
    f = multi_tenant_notifications_fixture

    # Attempt to insert notification in Org A for recipient in Org B (prof_b)
    async with rls_engine.connect() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO notifications (id, organization_id, recipient_id, notification_type, title, message) "
                    "VALUES (gen_random_uuid(), :o_a, :p_b, 'general', 'Cross-tenant alert', 'Illegal targeting')"
                ),
                {"o_a": f["org_a_id"], "p_b": f["prof_b"]},
            )

    # Attempt to insert notification_preferences in Org A for recipient in Org B (prof_b)
    async with rls_engine.connect() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                text(
                    "INSERT INTO notification_preferences (id, organization_id, recipient_id, notification_type, in_app_enabled) "
                    "VALUES (gen_random_uuid(), :o_a, :p_b, 'general', true)"
                ),
                {"o_a": f["org_a_id"], "p_b": f["prof_b"]},
            )


@pytest.mark.asyncio
async def test_notifications_mark_all_read_isolation(rls_engine, multi_tenant_notifications_fixture):
    """Mark all read under RLS affects only authenticated user's unread notifications."""
    f = multi_tenant_notifications_fixture

    async with rls_engine.connect() as conn:
        # User A1 marks all read in Org A
        await conn.execute(text("SET LOCAL ROLE authenticated"))
        await conn.execute(
            text("SELECT set_config('app.user_id', :u, true)"),
            {"u": str(f["auth_user_a1"])},
        )
        await conn.execute(
            text("SELECT set_config('app.organization_id', :o, true)"),
            {"o": str(f["org_a_id"])},
        )

        upd = await conn.execute(
            text("UPDATE notifications SET read_at = now() WHERE read_at IS NULL")
        )
        # Should only affect 1 row (Alice's notification), NOT Aaron's notification
        assert upd.rowcount == 1

    # Verify Aaron's notification is still unread by connecting as Aaron (auth_user_a2)
    async with rls_engine.connect() as conn2:
        await conn2.execute(text("SET LOCAL ROLE authenticated"))
        await conn2.execute(
            text("SELECT set_config('app.user_id', :u, true)"),
            {"u": str(f["auth_user_a2"])},
        )
        await conn2.execute(
            text("SELECT set_config('app.organization_id', :o, true)"),
            {"o": str(f["org_a_id"])},
        )

        res = await conn2.execute(
            text("SELECT id, read_at FROM notifications WHERE id = :id"),
            {"id": f["notif_a2"]},
        )
        row = res.fetchone()
        assert row is not None
        assert row[1] is None  # Still unread!
