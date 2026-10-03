# Module 21 — SaaS Administration Architecture

## 1. Architectural Overview & Separation of Concerns

OfficeOS employs a two-tier administrative hierarchy:

```
+-----------------------------------------------------------------------------------+
|                        TIER 1: PLATFORM / SAAS ADMINISTRATION                     |
|                                                                                   |
|  - Sole Canonical Role: `system_admin`                                            |
|  - Scope: Cross-tenant SaaS control plane, fleet directory, global configuration  |
|  - Boundaries: Platform-level tables, tenant suspension, health telemetry         |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                     TIER 2: TENANT / ORGANIZATION ADMINISTRATION                  |
|                                                                                   |
|  - Organization Roles: `organization_owner`, `organization_admin`, managers       |
|  - Scope: Isolated to single organization (branches, members, roles, resources)   |
|  - Boundaries: Strict PostgreSQL Row-Level Security (RLS) & tenant session context|
+-----------------------------------------------------------------------------------+
```

### Critical Security Distinction
- Platform administration is **strictly isolated** from organization administration.
- Ordinary organization administrators (`organization_owner`, `organization_admin`, etc.) have **zero** cross-tenant privileges.
- Ordinary organization roles attempting to reach SaaS administration endpoints receive an immediate `403 Forbidden` response.
- Platform privileges are **never** inferred from email addresses, frontend route paths, custom request headers (`X-Organization-Id`, etc.), or client-supplied tenant identifiers.

---

## 2. Platform Admin Identity & Authorization

### Canonical Role
- The system enforces exactly one platform administrator role: **`system_admin`**.
- No aliases or substitute roles are permitted (`super_admin`, `platform_admin`, `saas_admin`, or `root_admin` are forbidden).

### Server-Side Resolution & Enforcers
- **`require_system_admin` Dependency:** Resolves the caller's server-side active memberships, joins `membership_roles` and `roles`, and verifies that an active role named `system_admin` exists.
- **Canonical Permissions:**
  - `saas.view`: Read-only telemetry, directory search, usage statistics, and audit logs.
  - `saas.manage`: Lifecycle state transitions (suspend, activate, restore), platform configuration updates, and announcement management.

---

## 3. Database & Row-Level Security (RLS) Model

The migration `0020_saas_administration_module` introduces:

### Entities
1. **`organizations` Table Enhancements:**
   - `status`: `VARCHAR(30)` (`'active'`, `'suspended'`, `'deactivated'`) with check constraint `ck_organizations_status`.
   - `suspension_reason`: `VARCHAR(500)` nullable.
   - `suspended_at`: `TIMESTAMP WITH TIME ZONE` nullable.
2. **`platform_configurations` Table:**
   - Platform-wide singleton settings (`platform_name`, `support_email`, `maintenance_mode`, `allowed_signup_domains`, `max_organizations`).
   - `FORCE ROW LEVEL SECURITY`.
3. **`platform_announcements` Table:**
   - Broadcast notices (`title`, `content`, `severity`, `is_active`, `target_type`, `target_org_ids`, `starts_at`, `ends_at`).
   - `FORCE ROW LEVEL SECURITY`.

### PostgreSQL Security Definer Helper
```sql
CREATE OR REPLACE FUNCTION public.is_system_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_memberships m
    JOIN profiles p ON p.id = m.profile_id
    JOIN membership_roles mr ON mr.membership_id = m.id
    JOIN roles r ON r.id = mr.role_id
    WHERE p.auth_user_id = p_user_id
      AND m.status = 'active'
      AND r.name = 'system_admin'
  );
$$;
```

### RLS Policies
- **`platform_configurations`:**
  - Policy: `platform_config_system_admin`
  - Access: Only `system_admin` can read and write. Ordinary tenant users fail closed (0 rows).
- **`platform_announcements`:**
  - Full CRUD: `system_admin`.
  - Selective Read: Active notices targeted to `'all'` or where `target_org_ids` contains `current_setting('app.organization_id')`.
- **`organizations` Cross-Tenant View:**
  - Policy: `organizations_system_admin` allows `system_admin` to view and administer all tenant organizations.
- **`audit_logs` Cross-Tenant Audit:**
  - Policy: `audit_logs_system_admin_select` allows `system_admin` to inspect audit logs across all organizations.

---

## 4. Organization Suspension Semantics

### Centralized Enforcement Point
Organization suspension is enforced globally at the tenant resolution layer:
- **`app/dependencies/tenant.py:get_tenant_session`**:
  ```python
  if org.status == "suspended":
      is_sys_admin = await is_system_admin_user(current_user.id, db)
      if not is_sys_admin:
          raise HTTPException(
              status_code=status.HTTP_403_FORBIDDEN,
              detail=f"Organization '{org.name}' is currently suspended. Please contact platform administration.",
          )
  ```
- **Guaranteed Isolation:** Normal tenant users receive an immediate `403 Forbidden` for all authenticated requests when their organization is suspended.
- **Platform Access Preserved:** `system_admin` users remain able to inspect and administer suspended organizations.
- **Data Integrity:** Suspension is strictly non-destructive. No organization data, memberships, employees, or files are deleted.
- **Restoration:** Restoring an organization sets `status = 'active'`, clears `suspension_reason` and `suspended_at`, and instantly re-enables access for all organization members.

---

## 5. API Surface

All platform endpoints reside under `/api/v1/admin/...` and enforce JWT authentication + `require_system_admin`.

| HTTP Method | Route | Description | Required Permission |
|-------------|-------|-------------|---------------------|
| `GET` | `/api/v1/admin/overview` | Platform KPI summary and recent organizations | `saas.view` |
| `GET` | `/api/v1/admin/organizations` | Paginated tenant directory with search & status filters | `saas.view` |
| `GET` | `/api/v1/admin/organizations/{id}` | Organization detailed profile & counts | `saas.view` |
| `POST` | `/api/v1/admin/organizations/{id}/suspend` | Suspend tenant with reason | `saas.manage` |
| `POST` | `/api/v1/admin/organizations/{id}/activate` | Activate tenant | `saas.manage` |
| `POST` | `/api/v1/admin/organizations/{id}/restore` | Restore suspended tenant | `saas.manage` |
| `GET` | `/api/v1/admin/members` | Cross-tenant membership overview | `saas.view` |
| `GET` | `/api/v1/admin/usage` | Aggregated fleet usage & breakdown | `saas.view` |
| `GET` | `/api/v1/admin/health` | Live platform health, latency probe, migration head | `saas.view` |
| `GET` | `/api/v1/admin/audit-logs` | Platform-wide cross-tenant audit log explorer | `saas.view` |
| `GET` | `/api/v1/admin/config` | Read platform configuration | `saas.view` |
| `PATCH` | `/api/v1/admin/config` | Update platform configuration | `saas.manage` |
| `GET` | `/api/v1/admin/announcements` | List all platform announcements | `saas.view` |
| `POST` | `/api/v1/admin/announcements` | Create a platform announcement | `saas.manage` |
| `PATCH` | `/api/v1/admin/announcements/{id}` | Update an announcement | `saas.manage` |
| `DELETE` | `/api/v1/admin/announcements/{id}` | Delete an announcement | `saas.manage` |
| `GET` | `/api/v1/announcements/active` | Active announcements for current tenant | Authenticated Member |

---

## 6. Audit & Forensics

Platform administration leverages the existing immutable `audit_logs` table:
- State-changing operations (`organization.suspended`, `organization.activated`, `organization.restored`, `platform_config.updated`, `announcement.created`, `announcement.updated`, `announcement.deleted`) are automatically logged.
- The `details` payload contains sanitized metadata (action reasons, modified fields) with zero secrets.
- In-memory inspection of audit logs by `system_admin` is restricted to sanitized output.

---

## 7. Zero Secret Exposure Policy

- Database passwords, JWT signing secrets, Supabase service-role keys, and external API keys are **never** returned by any endpoint, printed in logs, or exposed in frontend components.
- Platform health reports sanitized operational metrics only: status (`healthy`), database connectivity (`connected`), ping latency in milliseconds, Alembic revision head (`0020_saas_administration_module`), and app version.

---

## 8. Deferred Capabilities

1. **Self-Service Organization Data Archival / Permanent Deletion:** Physical data deletion is deliberately unsupported in MVP to safeguard data preservation and prevent accidental cross-tenant data loss.
2. **Automated Tenant Billing Invoicing Integration:** Billing tier quotas and Stripe webhook automation are deferred to future enhancements; baseline database limit tracking is enforced via `max_organizations`.
