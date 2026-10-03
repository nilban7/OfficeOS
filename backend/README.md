# OfficeOS Backend

FastAPI and SQLAlchemy foundation for the OfficeOS multi-tenant backend.

## Requirements

- Python 3.11 or newer
- PostgreSQL 14 or newer, including Supabase PostgreSQL

## Local setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
```

Set `DATABASE_URL` and `SUPABASE_URL` in `.env`. Supabase Auth access tokens are signed asymmetrically (ECC P-256 / ES256) and verified by FastAPI against the public JWKS endpoint (`https://<PROJECT-REF>.supabase.co/auth/v1/.well-known/jwks.json`). `SUPABASE_JWT_ISSUER` and the JWKS URL are automatically derived from `SUPABASE_URL`. Never commit `.env` or real credentials. The backend is the only application component that may hold database credentials; the frontend must use the API.

## Run the API

```powershell
uvicorn app.main:app --reload
```

The process health endpoint is `GET /api/v1/health`. Authenticated identity endpoints are `GET /api/v1/me`, `GET /api/v1/me/organizations`, and `GET /api/v1/me/permissions`. Tenant-scoped requests must send `X-Organization-Id`; that value selects a tenant but never grants access.

## Migrations

```powershell
alembic upgrade head
alembic downgrade base
```

The first migration creates identity, organization, branch, membership, and RBAC tables. It also enables and forces RLS. Schema changes must be made through reviewed Alembic migrations, never manually in the Supabase dashboard.

## Tests and checks

```powershell
pytest
ruff check app tests
```

The RLS integration test requires `RLS_TEST_DATABASE_URL` pointing at a disposable PostgreSQL database where the migration has been applied. It is skipped when that variable is absent.

## Tenant context and security

FastAPI verifies the Supabase access token before opening a tenant-scoped database path. It validates membership using the authenticated subject and requested organization selector. Only then, on the same `AsyncSession` and transaction as subsequent queries, it executes:

```sql
SELECT set_config('app.user_id', '<authenticated subject>', true);
SELECT set_config('app.organization_id', '<validated organization>', true);
```

The third argument is `true`, making both values transaction-local and preventing pooled-connection leakage. RLS policies fail closed when settings are missing, require active membership, and compare row ownership to the established organization context. Normal requests do not use a service-role or other RLS-bypassing connection.

`/me/organizations` is an identity-discovery operation and sets only `app.user_id` so a user can enumerate memberships they already own. It does not expose another user's memberships or organization data. All organization-owned business queries require both settings and an active membership.

## Authentication & JWKS Verification

OfficeOS verifies Supabase Auth access tokens asymmetrically:
- **Algorithm**: ECC P-256 (`ES256`). Legacy `HS256` shared secrets are not used.
- **JWKS Endpoint**: `https://<PROJECT-REF>.supabase.co/auth/v1/.well-known/jwks.json`.
- **Key Resolution**: Matching public key selected using the token's `kid` header.
- **Caching & Rotation**: Public keys are cached locally (5-minute TTL). Unknown `kid` triggers automatic single refresh to support key rotation without service restart.
- **Validation**:
  - Enforces `ES256` algorithm.
  - Signature validated using public EC key.
  - Issuer must match `SUPABASE_JWT_ISSUER` (`<SUPABASE_URL>/auth/v1`).
  - Audience must match `SUPABASE_JWT_AUDIENCE` (`authenticated`).
  - `sub` must be a valid UUID string representing the user's identity.
  - API keys (`sb_publishable_*`, `sb_secret_*`) are never accepted as user identities.
  - Fails closed with `401 UNAUTHENTICATED` on any validation failure.