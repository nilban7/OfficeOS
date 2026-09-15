# Authentication Specification

## 1. Purpose

This document defines the authentication architecture for the Office Management System.

Authentication establishes the identity of a user.

Authorization determines what that authenticated user is allowed to do.

These are separate responsibilities.

---

## 2. Authentication Technology

The application uses:

- Supabase Auth
- Next.js frontend
- FastAPI backend
- PostgreSQL/Supabase database

Supabase Auth is the primary identity provider.

FastAPI is responsible for verifying authenticated requests and applying application authorization.

---

## 3. Authentication Flow

The standard authentication flow is:

```text
User
  ↓
Next.js Frontend
  ↓
Supabase Auth
  ↓
Authenticated Session
  ↓
Access Token
  ↓
Frontend API Client
  ↓
FastAPI
  ↓
Verify Access Token
  ↓
Authenticated User
  ↓
Organization Membership
  ↓
Authorization