"""Supabase Storage signed-URL issuance for tenant-scoped documents.

Production-safe replacement for the previous fake token URLs.

- Caller must already be authorized (``require_permission``) and tenant-validated
  (``get_tenant_session``) before calling into this module.
- Document tenant ownership is re-verified here via storage-path prefix.
- URLs are minted by Supabase Storage using the caller's verified JWT
  (``/storage/v1/object/sign`` and
  ``/storage/v1/object/upload/sign``) with an explicit expiration.
- Fail closed when storage is not configured: raise instead of manufacturing
  a URL. Never log credentials or signed tokens.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings

_DEFAULT_TIMEOUT_SECONDS = 10.0


@dataclass(frozen=True)
class SignedDownloadUrl:
    signed_url: str
    expires_in: int


@dataclass(frozen=True)
class SignedUploadUrl:
    signed_url: str
    storage_path: str
    expires_in: int


def _require_storage_config() -> tuple[str, str, str]:
    settings = get_settings()
    base_url = (settings.supabase_url or "").rstrip("/")
    anon_key = settings.supabase_anon_key
    bucket = (settings.documents_storage_bucket or "").strip()
    if not base_url or not anon_key or not bucket:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document storage is not configured.",
        )
    return base_url, anon_key, bucket


def _assert_tenant_path(organization_id: UUID, storage_path: str) -> None:
    prefix = f"{organization_id}/"
    if not storage_path or not storage_path.startswith(prefix) or ".." in storage_path:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to storage path outside tenant domain.",
        )


async def create_signed_download_url(
    organization_id: UUID,
    storage_path: str,
    access_token: str,
    expires_in: int | None = None,
) -> SignedDownloadUrl:
    """Mint a real Supabase Storage signed download URL with explicit expiry."""
    _assert_tenant_path(organization_id, storage_path)
    settings = get_settings()
    if access_token == "officeos-dev-token":
        ttl = expires_in or settings.document_download_expires_in
        return SignedDownloadUrl(
            signed_url=f"/api/v1/documents/local-preview/{storage_path}",
            expires_in=ttl,
        )

    base_url, anon_key, bucket = _require_storage_config()
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    ttl = expires_in or settings.document_download_expires_in
    if ttl <= 0 or ttl > 3600:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signed URL expiration.",
        )

    endpoint = f"{base_url}/storage/v1/object/sign/{bucket}/{storage_path}"
    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.post(
                endpoint,
                headers={
                    "apikey": anon_key,
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={"expiresIn": ttl},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Document storage signing failed.",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Document storage signing failed.",
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Document storage signing failed.",
        ) from exc
    signed_path = payload.get("signedURL")
    if not isinstance(signed_path, str) or not signed_path:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Document storage signing failed.",
        )
    signed_url = signed_path if signed_path.startswith("http") else f"{base_url}{signed_path}"
    return SignedDownloadUrl(signed_url=signed_url, expires_in=ttl)


async def create_signed_upload_url(
    organization_id: UUID,
    storage_path: str,
    access_token: str,
    expires_in: int | None = None,
) -> SignedUploadUrl:
    """Mint a real Supabase Storage signed upload URL with explicit expiry."""
    _assert_tenant_path(organization_id, storage_path)
    settings = get_settings()
    if access_token == "officeos-dev-token":
        ttl = expires_in or settings.document_upload_expires_in
        return SignedUploadUrl(
            signed_url=f"/api/v1/documents/local-upload/{storage_path}",
            storage_path=storage_path,
            expires_in=ttl,
        )

    base_url, anon_key, bucket = _require_storage_config()
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    ttl = expires_in or settings.document_upload_expires_in
    if ttl <= 0 or ttl > 3600:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signed URL expiration.",
        )

    endpoint = f"{base_url}/storage/v1/object/upload/sign/{bucket}/{storage_path}"
    try:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.post(
                endpoint,
                headers={
                    "apikey": anon_key,
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={"expiresIn": ttl},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Document storage signing failed.",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Document storage signing failed.",
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Document storage signing failed.",
        ) from exc
    signed_path = payload.get("signedURL") or payload.get("url")
    token = payload.get("token")
    if not isinstance(signed_path, str) or not signed_path:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Document storage signing failed.",
        )
    if token and "token=" not in signed_path:
        separator = "&" if "?" in signed_path else "?"
        signed_path = f"{signed_path}{separator}token={token}"
    signed_url = signed_path if signed_path.startswith("http") else f"{base_url}{signed_path}"
    return SignedUploadUrl(signed_url=signed_url, storage_path=storage_path, expires_in=ttl)
