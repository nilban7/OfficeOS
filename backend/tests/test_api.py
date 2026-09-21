import base64
import time
import uuid
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.security import HTTPAuthorizationCredentials
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings, get_settings
from app.core.security import clear_jwks_clients, get_jwks_client, verify_access_token
from app.dependencies.tenant import get_identity_session
from app.main import app
from app.models.identity import Organization, OrganizationMembership, Profile

# Generate ECC P-256 test key pairs
TEST_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
TEST_PUBLIC_KEY = TEST_PRIVATE_KEY.public_key()
TEST_KID = "test-key-id-1"

UNTRUSTED_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())


def public_key_to_jwk(public_key: ec.EllipticCurvePublicKey, kid: str) -> dict:
    public_numbers = public_key.public_numbers()

    def int_to_b64(val: int) -> str:
        return base64.urlsafe_b64encode(val.to_bytes(32, byteorder="big")).decode("utf-8").rstrip("=")

    return {
        "kty": "EC",
        "crv": "P-256",
        "x": int_to_b64(public_numbers.x),
        "y": int_to_b64(public_numbers.y),
        "use": "sig",
        "alg": "ES256",
        "kid": kid,
    }


TEST_JWK = public_key_to_jwk(TEST_PUBLIC_KEY, TEST_KID)


@pytest.fixture(autouse=True)
def setup_test_jwks(monkeypatch: pytest.MonkeyPatch):
    clear_jwks_clients()
    settings = get_settings()
    jwks_url = settings.supabase_jwks_url or "https://test.supabase.co/auth/v1/.well-known/jwks.json"
    client = get_jwks_client(jwks_url)

    def fake_fetch_data():
        data = {"keys": [TEST_JWK]}
        if client.jwk_set_cache is not None:
            client.jwk_set_cache.put(data)
        client._last_successful_fetch = time.monotonic()
        return data

    monkeypatch.setattr(client, "fetch_data", fake_fetch_data)
    yield
    clear_jwks_clients()


def create_test_token(
    user_id: str | None = None,
    *,
    private_key: ec.EllipticCurvePrivateKey = TEST_PRIVATE_KEY,
    kid: str | None = TEST_KID,
    algorithm: str = "ES256",
    issuer: str = "https://test.supabase.co/auth/v1",
    audience: str = "authenticated",
    claims_extra: dict | None = None,
    include_sub: bool = True,
) -> str:
    payload: dict[str, object] = {
        "email": "tester@example.com",
        "aud": audience,
        "iss": issuer,
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
    }
    if include_sub:
        payload["sub"] = user_id or str(uuid.uuid4())
    if claims_extra:
        payload.update(claims_extra)

    headers: dict[str, str] = {}
    if kid is not None:
        headers["kid"] = kid

    if algorithm.startswith("HS"):
        return jwt.encode(payload, "test-secret-value-with-32-bytes!!", algorithm=algorithm, headers=headers)
    return jwt.encode(payload, private_key, algorithm=algorithm, headers=headers)


@pytest.mark.asyncio
async def test_health_endpoint() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == {"status": "ok"}


@pytest.mark.asyncio
async def test_me_rejects_missing_authentication() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me")
    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_me_rejects_invalid_token() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me", headers={"Authorization": "Bearer invalid-token-string"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_auth_rejects_invalid_signature() -> None:
    token = create_test_token(private_key=UNTRUSTED_PRIVATE_KEY)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_auth_rejects_wrong_issuer() -> None:
    token = create_test_token(issuer="https://wrong.supabase.co/auth/v1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_auth_rejects_wrong_audience() -> None:
    token = create_test_token(audience="wrong-audience")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_auth_rejects_missing_sub() -> None:
    token = create_test_token(include_sub=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_auth_rejects_invalid_uuid_sub() -> None:
    token = create_test_token(user_id="not-a-valid-uuid")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_auth_rejects_missing_kid() -> None:
    token = create_test_token(kid=None)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_auth_rejects_unknown_kid() -> None:
    token = create_test_token(kid="unknown-kid-value")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_auth_rejects_unsupported_algorithm() -> None:
    token = create_test_token(algorithm="HS256")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_auth_handles_jwks_key_rotation(monkeypatch: pytest.MonkeyPatch) -> None:
    # Generate second key pair
    rotated_private_key = ec.generate_private_key(ec.SECP256R1())
    rotated_kid = "rotated-key-id-2"
    rotated_jwk = public_key_to_jwk(rotated_private_key.public_key(), rotated_kid)

    clear_jwks_clients()
    settings = get_settings()
    jwks_url = settings.supabase_jwks_url or "https://test.supabase.co/auth/v1/.well-known/jwks.json"
    client = get_jwks_client(jwks_url)
    client.cooldown_duration = 0  # eliminate cooldown for test

    fetch_count = 0

    def rotating_fetch_data():
        nonlocal fetch_count
        fetch_count += 1
        # First fetch returns only original key; subsequent fetches return both
        keys = [TEST_JWK] if fetch_count == 1 else [TEST_JWK, rotated_jwk]
        data = {"keys": keys}
        if client.jwk_set_cache is not None:
            client.jwk_set_cache.put(data)
        client._last_successful_fetch = time.monotonic()
        return data

    monkeypatch.setattr(client, "fetch_data", rotating_fetch_data)

    user1_id = str(uuid.uuid4())
    token1 = create_test_token(user_id=user1_id, kid=TEST_KID, private_key=TEST_PRIVATE_KEY)

    user2_id = str(uuid.uuid4())
    token2 = create_test_token(user_id=user2_id, kid=rotated_kid, private_key=rotated_private_key)

    mock_session = AsyncMock()
    mock_session.scalar.return_value = Profile(
        id=uuid.uuid4(),
        auth_user_id=uuid.UUID(user1_id),
        email="tester@example.com",
        first_name="Test1",
        last_name="User",
    )
    mock_session.execute = AsyncMock()
    app.dependency_overrides[get_identity_session] = lambda: mock_session

    try:
        # Request with original key -> 1st fetch
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http_client:
            res1 = await http_client.get("/api/v1/me", headers={"Authorization": f"Bearer {token1}"})
        assert res1.status_code == 200
        assert fetch_count == 1

        # Another request with original key -> cache hit, no fetch
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http_client:
            res1_again = await http_client.get("/api/v1/me", headers={"Authorization": f"Bearer {token1}"})
        assert res1_again.status_code == 200
        assert fetch_count == 1

        # Request with rotated key -> key not in cache -> triggers 2nd fetch -> succeeds!
        mock_session.scalar.return_value = Profile(
            id=uuid.uuid4(),
            auth_user_id=uuid.UUID(user2_id),
            email="tester@example.com",
            first_name="Test2",
            last_name="User",
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http_client:
            res2 = await http_client.get("/api/v1/me", headers={"Authorization": f"Bearer {token2}"})
        assert res2.status_code == 200
        assert fetch_count == 2
        assert res2.json()["data"]["id"] == user2_id
    finally:
        app.dependency_overrides.pop(get_identity_session, None)


def test_verify_access_token_fails_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.core.security.get_settings",
        lambda: Settings(
            database_url="postgresql+asyncpg://dummy:dummy@localhost/dummy",
            supabase_url=None,
            supabase_jwks_url=None,
        ),
    )
    with pytest.raises(Exception) as exc_info:
        verify_access_token(HTTPAuthorizationCredentials(scheme="Bearer", credentials="dummy"))
    assert exc_info.value.status_code == 500
    assert "Authentication is not configured" in exc_info.value.detail


@pytest.mark.asyncio
async def test_organizations_rejects_missing_authentication() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me/organizations")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_permissions_rejects_missing_authentication() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me/permissions")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.asyncio
async def test_permissions_rejects_missing_organization_header() -> None:
    token = create_test_token()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me/permissions", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "BAD_REQUEST"
    assert "Organization context is required" in body["error"]["message"]


@pytest.mark.asyncio
async def test_permissions_rejects_invalid_organization_uuid() -> None:
    token = create_test_token()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/me/permissions",
            headers={"Authorization": f"Bearer {token}", "X-Organization-Id": "not-a-valid-uuid"},
        )
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "BAD_REQUEST"
    assert "Invalid organization id" in body["error"]["message"]


@pytest.mark.asyncio
async def test_get_tenant_session_denies_non_member() -> None:
    token = create_test_token()
    org_id = str(uuid.uuid4())

    mock_session = AsyncMock()
    mock_session.scalar.return_value = None  # No membership found

    from app.core.database import get_db_session

    app.dependency_overrides[get_db_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/me/permissions",
                headers={"Authorization": f"Bearer {token}", "X-Organization-Id": org_id},
            )
        assert response.status_code == 403
        body = response.json()
        assert body["success"] is False
        assert body["error"]["code"] == "FORBIDDEN"
        assert "Organization access denied" in body["error"]["message"]
    finally:
        app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_get_tenant_session_succeeds_for_active_member() -> None:
    user_id = str(uuid.uuid4())
    org_id = str(uuid.uuid4())
    token = create_test_token(user_id=user_id)

    mock_session = AsyncMock()
    fake_membership = MagicMock(spec=OrganizationMembership)
    mock_session.scalar.return_value = fake_membership

    # Mock execute for set_user_context and set_transaction_context
    mock_session.execute = AsyncMock()
    mock_session.scalars.return_value = ["employees.view", "employees.create"]

    from app.core.database import get_db_session

    app.dependency_overrides[get_db_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/me/permissions",
                headers={"Authorization": f"Bearer {token}", "X-Organization-Id": org_id},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert len(body["data"]) == 2
        assert body["data"][0]["code"] == "employees.view"
    finally:
        app.dependency_overrides.pop(get_db_session, None)


@pytest.mark.asyncio
async def test_me_success_with_authenticated_user() -> None:
    user_id = str(uuid.uuid4())
    token = create_test_token(user_id=user_id)

    mock_session = AsyncMock()
    mock_session.scalar.return_value = Profile(
        id=uuid.uuid4(),
        auth_user_id=uuid.UUID(user_id),
        email="tester@example.com",
        first_name="Test",
        last_name="User",
    )
    mock_session.execute = AsyncMock()

    app.dependency_overrides[get_identity_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["id"] == user_id
        assert body["data"]["email"] == "tester@example.com"
        assert body["data"]["first_name"] == "Test"
        assert body["data"]["last_name"] == "User"
    finally:
        app.dependency_overrides.pop(get_identity_session, None)


@pytest.mark.asyncio
async def test_organizations_discovery_success() -> None:
    user_id = str(uuid.uuid4())
    token = create_test_token(user_id=user_id)
    org_id = uuid.uuid4()

    mock_session = AsyncMock()
    mock_session.scalars.return_value = [
        Organization(id=org_id, name="Acme Corp", slug="acme-corp", is_active=True)
    ]
    mock_session.execute = AsyncMock()

    app.dependency_overrides[get_identity_session] = lambda: mock_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/me/organizations", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert len(body["data"]) == 1
        assert body["data"][0]["id"] == str(org_id)
        assert body["data"][0]["name"] == "Acme Corp"
        assert body["data"][0]["slug"] == "acme-corp"
    finally:
        app.dependency_overrides.pop(get_identity_session, None)