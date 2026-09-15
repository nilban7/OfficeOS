# Row Level Security (RLS) Strategy

## 1. Purpose

This document defines the Row Level Security (RLS) strategy for the Office Management System.

The system is a multi-tenant SaaS application.

Each organization must be isolated from every other organization.

RLS provides database-level protection as one layer of the overall security architecture.

---

## 2. Core Security Principle

A user belonging to Organization A must never be able to access Organization B's data.

Tenant isolation must be enforced at multiple layers:

```text
Frontend authorization
        ↓
FastAPI authentication
        ↓
FastAPI authorization
        ↓
Database authorization / RLS
        ↓
PostgreSQL data