from typing import Self
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.services.storage import create_signed_download_url, create_signed_upload_url


def _settings() -> Settings:
    return Settings(
        database_url="postgresql+asyncpg://test:test@localhost/test",
        supabase_url="https://storage.example",
        supabase_anon_key="public-anon-key",
    )


class _AsyncClient:
    def __init__(self, response: MagicMock, **_: object) -> None:
        self.response = response
        self.post = AsyncMock(return_value=response)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None


@pytest.mark.asyncio
async def test_signed_download_url_uses_supabase_storage_and_expiration(monkeypatch: pytest.MonkeyPatch) -> None:
    org_id = uuid4()
    path = f"{org_id}/documents/report.pdf"
    response = MagicMock(status_code=200)
    response.json.return_value = {"signedURL": "/storage/v1/object/sign/documents/signed-path"}
    monkeypatch.setattr("app.services.storage.get_settings", _settings)
    with patch("app.services.storage.httpx.AsyncClient", return_value=_AsyncClient(response)):
        result = await create_signed_download_url(org_id, path, "verified-user-jwt", expires_in=300)
    assert result.signed_url == "https://storage.example/storage/v1/object/sign/documents/signed-path"
    assert result.expires_in == 300


@pytest.mark.asyncio
async def test_signed_upload_url_uses_supabase_storage_and_expiration(monkeypatch: pytest.MonkeyPatch) -> None:
    org_id = uuid4()
    path = f"{org_id}/documents/upload.pdf"
    response = MagicMock(status_code=200)
    response.json.return_value = {"signedURL": "/storage/v1/object/upload/sign/documents/signed-path"}
    monkeypatch.setattr("app.services.storage.get_settings", _settings)
    with patch("app.services.storage.httpx.AsyncClient", return_value=_AsyncClient(response)):
        result = await create_signed_upload_url(org_id, path, "verified-user-jwt", expires_in=900)
    assert result.signed_url == "https://storage.example/storage/v1/object/upload/sign/documents/signed-path"
    assert result.expires_in == 900


@pytest.mark.asyncio
async def test_signed_storage_rejects_cross_tenant_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.storage.get_settings", _settings)
    with pytest.raises(HTTPException) as exc:
        await create_signed_download_url(uuid4(), f"{uuid4()}/documents/secret.pdf", "verified-user-jwt")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_signed_storage_requires_authenticated_caller(monkeypatch: pytest.MonkeyPatch) -> None:
    org_id = uuid4()
    monkeypatch.setattr("app.services.storage.get_settings", _settings)
    with pytest.raises(HTTPException) as exc:
        await create_signed_download_url(org_id, f"{org_id}/documents/report.pdf", "")
    assert exc.value.status_code == 401
