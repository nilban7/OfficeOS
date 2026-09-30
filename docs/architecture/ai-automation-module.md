# AI & Automation Module Architecture

## 1. Overview

The **AI & Automation** module provides multi-tenant, permission-aware artificial intelligence interactions and event-driven workflow automation for OfficeOS.

Key tenets:
1. **Strict Tenant Isolation**: All configurations, conversations, messages, automations, and execution records are scoped by `organization_id` with composite foreign keys and PostgreSQL Row Level Security (`FORCE ROW LEVEL SECURITY`).
2. **Permission Boundary Defense**: The AI assistant never bypasses backend authorization or accesses datasets the calling user cannot view. Sensitive datasets (Finance, Audit Logs) require caller permissions (`finance:read`/`finance.view`/`reports.finance` and `audit_logs.view`).
3. **Safe Automation Primitives**: Automation workflows support in-app notifications, immutable audit logging, and operational task creation. Arbitrary code execution, shell commands, and raw SQL are strictly disallowed.
4. **Provider Abstraction**: Model interaction is abstracted behind `BaseAIProvider` and `SystemGeminiProvider`. No provider secrets or credentials are ever stored in database rows or exposed to frontend clients.

---

## 2. Architecture & Data Flow

```
+-------------------------------------------------------------+
|                        Frontend UI                          |
|    - /ai (Chat Assistant)                                   |
|    - /settings/ai (Model & Capability Configuration)        |
|    - /automations (Workflow Builder & Execution History)    |
+------------------------------+------------------------------+
                               | Authenticated REST API (JWT)
                               v
+-------------------------------------------------------------+
|                        FastAPI Core                         |
|   1. JWT Verification & Tenant Derivation                   |
|   2. Canonical Permission Enforcement                       |
|   3. PostgreSQL Context Setup (app.current_org_id)          |
+------------------------------+------------------------------+
                               |
            +------------------+------------------+
            |                                     |
            v                                     v
+-----------------------+             +-----------------------+
|       AIService       |             |   AutomationService   |
| - Tenant Configuration|             | - Trigger Validation  |
| - Permission Checking |             | - Sandboxed Execution |
| - Context Aggregation |             | - Execution History   |
| - Audit Logging       |             | - Audit Logging       |
+-----------+-----------+             +-----------+-----------+
            |                                     |
            v                                     v
+-----------------------+             +-----------------------+
|    AI Provider Hub    |             |  Safe Action Handlers |
| - SystemGeminiProvider|             | - Notifications       |
| - Fallback Engine     |             | - Audit Log Records   |
| - Zero Credential Leak|             | - Task Creation       |
+-----------------------+             +-----------------------+
            |                                     |
            +------------------+------------------+
                               |
                               v
+-------------------------------------------------------------+
|                     PostgreSQL Database                     |
|           Tables with Row-Level Security (RLS)              |
|   ai_configurations, ai_conversations, ai_messages          |
|   automations, automation_executions                        |
+-------------------------------------------------------------+
```

---

## 3. Data Model

### `ai_configurations`
- `id` (UUID, PK)
- `organization_id` (UUID, UNIQUE, FK -> `organizations.id`)
- `is_enabled` (BOOLEAN, default: true)
- `provider` (VARCHAR(50), default: "system_gemini")
- `model_name` (VARCHAR(100), default: "gemini-1.5-flash")
- `temperature` (NUMERIC(3, 2), default: 0.70)
- `max_tokens_per_response` (INTEGER, default: 2048)
- `allowed_capabilities` (JSONB array of enabled module domains)
- `daily_request_limit` (INTEGER, default: 1000)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### `ai_conversations`
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> `organizations.id`)
- `user_id` (UUID, FK -> `profiles.id`)
- `title` (VARCHAR(255))
- `is_archived` (BOOLEAN, default: false)
- Composite FK & Unique: `(organization_id, id)` and `(organization_id, user_id)`

### `ai_messages`
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> `organizations.id`)
- `conversation_id` (UUID, FK -> `ai_conversations.id`)
- `sender_role` (VARCHAR(20), CHECK in `('user', 'assistant', 'system')`)
- `content` (TEXT, max 8,000 characters)
- `capability_used` (VARCHAR(50), nullable)
- `tokens_used` (INTEGER, default: 0)
- `metadata` (JSONB)
- `created_at` (TIMESTAMPTZ)
- Composite FK: `(organization_id, conversation_id)` -> `ai_conversations(organization_id, id)`

### `automations`
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> `organizations.id`)
- `name` (VARCHAR(255))
- `description` (TEXT, nullable)
- `is_active` (BOOLEAN, default: true)
- `trigger_type` (VARCHAR(50), CHECK in `('event', 'schedule', 'manual')`)
- `trigger_config` (JSONB)
- `action_type` (VARCHAR(50), CHECK in `('notification', 'audit_log', 'task_create')`)
- `action_config` (JSONB)
- `created_by_id` (UUID, FK -> `profiles.id`)
- `last_run_at`, `last_run_status`, `next_run_at`
- `run_count` (INTEGER, default: 0)
- Composite FK & Unique: `(organization_id, id)` and `(organization_id, created_by_id)`

### `automation_executions`
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> `organizations.id`)
- `automation_id` (UUID, FK -> `automations.id`)
- `triggered_by_id` (UUID, FK -> `profiles.id`, nullable)
- `trigger_source` (VARCHAR(50))
- `status` (VARCHAR(50), CHECK in `('success', 'failed', 'skipped')`)
- `execution_payload` (JSONB)
- `result_summary` (TEXT)
- `error_message` (TEXT)
- `duration_ms` (INTEGER)
- `created_at` (TIMESTAMPTZ)
- Composite FK: `(organization_id, automation_id)` -> `automations(organization_id, id)`

---

## 4. Permissions & RBAC Taxonomy

The module adheres strictly to the canonical role taxonomy:
- `system_admin`
- `organization_owner`
- `organization_admin`
- `hr_manager`
- `finance_manager`
- `project_manager`
- `department_manager`
- `employee`

### Granular Permissions

| Permission | Description | Assigned Roles |
|---|---|---|
| `ai.view` | View AI Assistant interface and conversations | All active roles |
| `ai.use` | Send queries and interact with AI Assistant | All active roles |
| `ai.manage` | Configure organization-level AI parameters and quotas | `organization_owner`, `organization_admin` |
| `automations.view` | View organization automations and execution logs | `organization_owner`, `organization_admin`, `hr_manager`, `finance_manager`, `project_manager`, `department_manager` |
| `automations.create` | Create new automation rules | `organization_owner`, `organization_admin` |
| `automations.update` | Update existing automation workflows | `organization_owner`, `organization_admin` |
| `automations.delete` | Delete automation workflows | `organization_owner`, `organization_admin` |
| `automations.execute` | Trigger manual runs of active automations | `organization_owner`, `organization_admin`, `department_manager` |
| `automations.manage` | Administrative control over all automations | `organization_owner`, `organization_admin` |

---

## 5. Security Boundaries

1. **RLS Defense in Depth**:
   - `FORCE ROW LEVEL SECURITY` enabled on all 5 tables.
   - Policies verify `organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid`.
   - Missing or empty tenant context fails closed immediately (0 rows returned or inserted).
2. **Data Boundaries in AI Context Aggregator**:
   - Aggregated metrics use DB-level counts and tenant-scoped queries.
   - Financial summaries require caller permission `finance:read`, `finance.view`, or `reports.finance`. Unauthorized callers receive an explicit exclusion notice.
   - Audit trail summaries require caller permission `audit_logs.view`. Unauthorized callers receive an explicit exclusion notice.
   - Users can only query or read conversations they own (or manage if authorized).
3. **Safe Automation Sandbox**:
   - Only pre-approved internal actions are executable (`notification`, `audit_log`, `task_create`).
   - Disabled automations cannot be executed (`400 Bad Request`).
   - Cross-tenant execution is impossible due to composite tenant foreign keys and tenant-checked queries.
4. **Auditability**:
   - All AI configuration updates, conversation deletions, automation creations, updates, toggles, executions, and deletions are permanently recorded in `audit_logs`.

---

## 6. AI Provider Abstraction

- Model communications are routed through `BaseAIProvider.generate_response(prompt, system_instruction, context_data, temperature, max_tokens)`.
- `SystemGeminiProvider` checks for the server environment variable `GEMINI_API_KEY`.
  - When configured, queries the official Google Gemini Generative Language API.
  - When unconfigured or in test/offline environments, invokes a deterministic, structured analytical synthesis engine that produces contextual answers from verified tenant data without external calls.
- Zero secrets or API keys are ever stored in the database or exposed via API responses.

---

## 7. Deferred Capabilities

1. **Background Asynchronous Worker Queues**:
   - The current automation engine executes synchronously inside the FastAPI request lifecycle.
   - The execution service abstraction is designed for drop-in migration to Celery/Redis/ARQ background workers once SaaS Administration (Module 21) or distributed task workers are introduced.
2. **Third-Party Webhook / Outbound HTTP Dispatch**:
   - Outbound webhooks are intentionally deferred to prevent SSRF vulnerabilities until dedicated egress proxying, IP allowlisting, and cryptographic HMAC signing are established.
