# OfficeOS Frontend

Production-ready Next.js application foundation for the **OfficeOS** multi-tenant SaaS platform.

---

## 1. Overview & Architecture

The frontend is built with:
- **Next.js (App Router)**
- **React**
- **TypeScript** (Strict mode)
- **Tailwind CSS**
- **Supabase Auth** (Client authentication and session management)
- **FastAPI API Client** (Centralized communication with `/api/v1` backend endpoints)
- **Vitest & React Testing Library** (Unit and component testing)

### Security Boundary Model
- **Supabase Auth** is responsible for establishing user identity and generating access tokens.
- **FastAPI Backend** is authoritative for business logic and role/permission authorization.
- The frontend **never** connects directly to PostgreSQL and never makes authorization decisions alone. Frontend permission checks are UX helpers only.

---

## 2. Directory Structure

```text
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   ├── (protected)/
│   │   ├── dashboard/
│   │   └── layout.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── auth/          # Login, forgot-password, reset-password forms
│   ├── feedback/      # Loading, empty, and error state components
│   ├── layout/        # Sidebar, header, org switcher, user nav
│   ├── navigation/    # Navigation constants and helpers
│   └── ui/            # Reusable design primitives (Button, Input, Card, Badge, Modal, Label)
│
├── constants/         # Route definitions and navigation configuration
├── hooks/             # Custom React hooks (useAuth, useApi, useOrganization)
├── lib/
│   ├── api/           # Centralized typed FastAPI client & endpoints
│   ├── auth/          # Auth context provider & Supabase session mapping
│   ├── config/        # Safe client environment configuration
│   ├── supabase/      # Supabase browser client singleton
│   └── utils/         # Classnames composition (cn)
│
├── types/             # TypeScript contracts (API, Auth, Organization, Navigation)
└── tests/             # Vitest test suites and setup
```

---

## 3. Getting Started

### Prerequisites
- Node.js `v20+` or `v22+`
- npm `10+`

### Installation
Inside the `frontend/` directory:

```bash
npm install
```

### Environment Variables
Copy the example environment configuration:

```bash
cp .env.example .env.local
```

Configure your variables in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Security Note:** Only public variables prefixed with `NEXT_PUBLIC_` belong in the frontend. Never place backend secrets, database connection strings, or Supabase service-role keys in this directory.

---

## 4. Development & Build Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Next.js development server at `http://localhost:3000` |
| `npm run build` | Builds the optimized production application |
| `npm run start` | Runs the production build server |
| `npm run type-check` | Runs the TypeScript compiler check (`tsc --noEmit`) |
| `npm run lint` | Runs Next.js ESLint checks |
| `npm test` | Runs the Vitest test suite |
| `npm run test:watch` | Runs Vitest in interactive watch mode |

---

## 5. API Client Usage

Use the centralized API client from `@/lib/api/client`:

```typescript
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";

// Standard GET request
const employees = await apiClient.get<Employee[]>(API_ENDPOINTS.employees.list);

// POST request with Bearer token automatically attached
const newProject = await apiClient.post<Project>(API_ENDPOINTS.projects.list, {
  name: "New Project",
});
```
