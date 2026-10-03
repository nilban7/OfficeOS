# Authentication Specification

## 1. Purpose

This document defines the authentication architecture for the Office Management System.

Authentication establishes the identity of a user.

Authorization determines what that authenticated user is allowed to do.

These are separate responsibilities.

---

## 2. Authentication Technology

The application uses:

- Supabase Auth
- Next.js frontend
- FastAPI backend
- PostgreSQL/Supabase database

Supabase Auth is the primary identity provider.

FastAPI is responsible for verifying authenticated requests and applying application authorization.

---

## 3. Authentication Flow

The standard authentication flow is:

```text
User
  ↓
Next.js Frontend
  ↓
Supabase Auth
  ↓
Authenticated Session
  ↓
Access Token
  ↓
Frontend API Client
  ↓
FastAPI
  ↓
Verify Access Token (JWKS ES256)
  ↓
Authenticated User
  ↓
Organization Membership
  ↓
Authorization
```

---

## 4. Asymmetric Signing & Public JWKS Endpoint

Supabase Auth uses asymmetric cryptographic signing for user access tokens:

- **Signing Algorithm**: ECC P-256 (`ES256`). The legacy symmetric `HS256` shared secret is deprecated and not used for backend API verification.
- **Public JWKS Endpoint**: `https://<PROJECT-REF>.supabase.co/auth/v1/.well-known/jwks.json`
- **Key Identification**: Each token includes a `kid` (Key ID) header matching a public key in the JWKS endpoint.

---

## 5. Token Verification Rules & Security

FastAPI enforces fail-closed verification on every protected request:

1. **Algorithm Check**: The JWT header algorithm (`alg`) must match the allowed list (strictly `ES256`). Tokens using `HS256`, `RS256`, `none`, or any other algorithm are rejected.
2. **Key ID (`kid`) Resolution**: The token header must specify a non-empty `kid`. The public key matching this `kid` is retrieved from the JWKS cache.
3. **Cryptographic Signature Verification**: The token signature is validated against the ECC P-256 public key.
4. **Issuer Validation**: The `iss` claim must match the configured Supabase Auth issuer (`https://<PROJECT-REF>.supabase.co/auth/v1`).
5. **Audience Validation**: The `aud` claim must match the configured audience (default `authenticated`).
6. **Subject (`sub`) Validation**: The `sub` claim is strictly required and must parse as a valid UUID. This represents the Supabase Auth user ID.
7. **Expiration (`exp`)**: Expired tokens are rejected immediately.
8. **Rejection Responses**: Any verification failure results in an immediate `401 UNAUTHENTICATED` response.

---

## 6. JWKS Caching and Key Rotation

To prevent network bottlenecks and latency overhead on API requests:

- **Local Caching**: The public JWK Set is cached in memory with a 5-minute time-to-live (TTL).
- **Key Rotation**: When Supabase rotates signing keys, incoming tokens will present a new `kid`. Upon encountering an unknown `kid`, the JWKS client performs an automatic, cooldown-protected cache refresh to fetch the newly published public key without requiring an application restart.
- **Fail-Closed**: If a key ID remains unknown after refreshing the JWKS, the request is rejected immediately with `401 UNAUTHENTICATED`.

---

## 7. API Keys vs. User Identity

- Supabase API keys (`sb_publishable_*`, `sb_secret_*`) are project/service credentials, **not** user identities.
- The backend never accepts API keys in lieu of user Bearer tokens.
- Normal authenticated business requests must always present a user access token issued by Supabase Auth.

---

## 8. Backend Configuration

Configuration is managed via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | Yes | None | The Supabase project URL (e.g. `https://<project-ref>.supabase.co`) |
| `SUPABASE_JWT_ISSUER` | Optional | `{SUPABASE_URL}/auth/v1` | Supabase Auth issuer URL |
| `SUPABASE_JWT_AUDIENCE` | Optional | `authenticated` | Expected token audience |
| `JWT_ALGORITHMS` | Optional | `["ES256"]` | Permitted asymmetric signature algorithms |

`SUPABASE_JWT_SECRET` is legacy and not required or used for normal API authentication.