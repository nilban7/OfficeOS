# Database Naming Conventions

## 1. Purpose

This document defines the naming conventions for the Office Management System database.

The goal is to keep database objects consistent, readable, predictable, and easy to maintain across the development team and AI-assisted development.

All developers and AI agents must follow these conventions unless an approved architecture decision explicitly requires an exception.

---

## 2. General Rules

- Use lowercase names.
- Use `snake_case`.
- Use descriptive names.
- Avoid unnecessary abbreviations.
- Use consistent terminology across the entire database.
- Do not use spaces or special characters in database object names.
- Prefer clear business terms over technical shorthand.

Example:

```text
organization_users
created_at
employee_id