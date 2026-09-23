import base64
import time
import uuid

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

# Generate ECC P-256 test key pairs once per test session
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
