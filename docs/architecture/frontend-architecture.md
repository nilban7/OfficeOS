# Office Management System — Frontend Architecture

## 1. Purpose

This document defines the architecture and development standards for the Office Management System frontend.

The frontend is a multi-tenant SaaS interface built with Next.js, React, TypeScript, and Tailwind CSS.

The frontend must provide a consistent, secure, accessible, responsive, and maintainable user experience.

---

# 2. Technology Stack

The frontend uses:

- Next.js
- React
- TypeScript
- Tailwind CSS

Additional libraries should only be introduced when there is a clear project requirement.

Before introducing a new dependency, check whether existing project functionality can solve the requirement.

---

# 3. Application Router

The application uses the Next.js App Router.

The primary application structure is:

```text
frontend/
│
├── app/
│   ├── (auth)/
│   ├── dashboard/
│   ├── organization/
│   ├── employees/
│   ├── attendance/
│   ├── leave/
│   ├── clients/
│   ├── projects/
│   ├── procurement/
│   ├── assets/
│   ├── maintenance/
│   ├── training/
│   ├── internships/
│   ├── operations/
│   ├── finance/
│   ├── documents/
│   ├── notifications/
│   └── settings/
│
├── components/
├── lib/
├── hooks/
├── types/
├── constants/
└── tests/