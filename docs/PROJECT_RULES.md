# Office Management System — Project Rules

## 1. Purpose

These rules define how the Office Management System is designed, developed, tested, reviewed, and maintained.

These rules apply to both human developers and AI coding agents.

---

# 2. Product Definition

The Office Management System is a multi-tenant SaaS application.

The system allows multiple independent organizations to use the same platform while keeping their data completely isolated.

Example:

Organization A
    ↓
Employees
Projects
Clients
Finance
Attendance

Organization B
    ↓
Employees
Projects
Clients
Finance
Attendance

Organization A must never access Organization B's data.

---

# 3. Development Team

## Frontend Lead

Responsibilities:

- Next.js
- React
- TypeScript
- Tailwind CSS
- UI/UX
- Frontend components
- Pages
- Forms
- Frontend API integration
- Frontend testing

Primary directory:

```text
/frontend