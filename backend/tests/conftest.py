import os
import socket
import time

_orig_getaddrinfo = socket.getaddrinfo


def _resilient_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    try:
        return _orig_getaddrinfo(host, port, family, type, proto, flags)
    except socket.gaierror:
        if host and "supabase" in str(host):
            return _orig_getaddrinfo("54.64.190.72", port, family, type, proto, flags)
        raise


socket.getaddrinfo = _resilient_getaddrinfo

import pytest
from dotenv import dotenv_values

env_vars = dotenv_values(".env")
if rls_db_url := env_vars.get("RLS_TEST_DATABASE_URL"):
    os.environ["RLS_TEST_DATABASE_URL"] = rls_db_url
elif db_url := env_vars.get("DATABASE_URL"):
    os.environ["RLS_TEST_DATABASE_URL"] = db_url

os.environ["DATABASE_URL"] = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/officeos_test"
)
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_JWT_ISSUER"] = "https://test.supabase.co/auth/v1"
os.environ["SUPABASE_JWT_AUDIENCE"] = "authenticated"

from app.core.config import get_settings
from app.core.security import clear_jwks_clients, get_jwks_client
from tests.auth_helpers import TEST_JWK

get_settings.cache_clear()


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