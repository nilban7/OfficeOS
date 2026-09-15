# API Conventions

## 1. Purpose

This document defines the API conventions for the Office Management System.

The goal is to provide a consistent contract between:

- Next.js frontend
- FastAPI backend
- PostgreSQL/Supabase
- Future integrations
- AI-assisted development

All API development must follow these conventions unless an approved architecture decision requires an exception.

---

## 2. API Technology

The backend API is built using:

- Python
- FastAPI
- Pydantic

The frontend consumes the API using a centralized API client.

Business logic belongs in the backend.

The frontend must not directly implement business rules that belong to the backend.

---

## 3. API Base Path

All application APIs must use the versioned path:

```text
/api/v1/