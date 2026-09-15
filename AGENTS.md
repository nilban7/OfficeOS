# Office Management System — AI Development Rules

## 1. Project Overview

This repository contains a multi-tenant Office Management SaaS platform.

The system is designed to support multiple independent organizations.

Organization data must always remain isolated.

---

## 2. Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend

- Python
- FastAPI
- Pydantic

### Database

- PostgreSQL
- Supabase

### Authentication

- Supabase Auth

### Storage

- Supabase Storage

---

## 3. Repository Structure

```text
/frontend
    Next.js application

/backend
    FastAPI application

/database
    Database migrations and seeds

/docs
    Architecture, API, database and workflow documentation

/.github
    GitHub configuration and CI/CD