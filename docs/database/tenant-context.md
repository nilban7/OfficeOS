# Tenant Context

OfficeOS passes database tenant context through transaction-local PostgreSQL settings. FastAPI verifies the Supabase JWT first, derives the authenticated subject from the token, and validates the selected organization against an active membership. A client-supplied `X-Organization-Id` is only a selector; it is never an authorization decision.

For a tenant-scoped request, the same SQLAlchemy `AsyncSession` used by the request executes:

```sql
SELECT set_config('app.user_id', '<authenticated subject>', true);
SELECT set_config('app.organization_id', '<validated organization>', true);
```

The `true` argument makes each setting local to the current transaction. RLS policies require non-empty settings and an active membership for the context user and organization. They compare organization-owned rows with `app.organization_id`, so missing context, invalid context, inactive membership, and cross-tenant rows are denied.

The membership-discovery endpoint is the one identity exception: it sets `app.user_id` without an organization so a user can list all organizations to which they already belong. Its RLS policy limits rows to memberships whose profile matches that authenticated subject. It does not authorize access to organization-owned business data.

Normal application requests use the regular database role and never use a Supabase service-role connection. RLS remains enabled and forced on the foundation tables.