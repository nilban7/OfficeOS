import threading
import uuid
from dataclasses import dataclass

import jwt
from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

bearer_scheme = HTTPBearer(auto_error=False)

_jwks_clients: dict[str, jwt.PyJWKClient] = {}
_jwks_lock = threading.Lock()


def get_jwks_client(jwks_url: str) -> jwt.PyJWKClient:
    """Return a cached PyJWKClient instance for the specified JWKS URL."""
    with _jwks_lock:
        if jwks_url not in _jwks_clients:
            _jwks_clients[jwks_url] = jwt.PyJWKClient(
                jwks_url,
                cache_jwk_set=True,
                lifespan=300,
            )
        return _jwks_clients[jwks_url]


def clear_jwks_clients() -> None:
    """Clear cached JWKS clients, primarily used for test isolation."""
    with _jwks_lock:
        _jwks_clients.clear()


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None
    claims: dict[str, object]


def verify_access_token(
    credentials: HTTPAuthorizationCredentials | None,
    jwks_client: jwt.PyJWKClient | None = None,
) -> AuthenticatedUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    settings = get_settings()
    jwks_url = settings.supabase_jwks_url
    if not jwks_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication is not configured",
        )

    raw_token = credentials.credentials
    try:
        unverified_header = jwt.get_unverified_header(raw_token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
        ) from exc

    alg = unverified_header.get("alg")
    if not alg or alg not in settings.jwt_algorithms:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unsupported token algorithm",
        )

    kid = unverified_header.get("kid")
    if not kid or not isinstance(kid, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid key ID in token header",
        )

    client = jwks_client or get_jwks_client(jwks_url)
    try:
        signing_key = client.get_signing_key(kid)
    except (jwt.PyJWKClientError, jwt.PyJWKError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unknown or invalid token key ID",
        ) from exc

    try:
        claims = jwt.decode(
            raw_token,
            signing_key.key,
            algorithms=[alg],
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_jwt_issuer,
            options={
                "require": ["sub"],
                "verify_signature": True,
                "verify_aud": bool(settings.supabase_jwt_audience),
                "verify_iss": bool(settings.supabase_jwt_issuer),
                "verify_exp": True,
            },
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
        ) from exc

    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token subject",
        )

    try:
        user_uuid = uuid.UUID(subject)
        subject_str = str(user_uuid)
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token subject UUID",
        ) from exc

    email = claims.get("email")
    return AuthenticatedUser(
        id=subject_str,
        email=email if isinstance(email, str) else None,
        claims=claims,
    )