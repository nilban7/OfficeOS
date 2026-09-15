# RBAC and Permissions Specification

## 1. Purpose

This document defines the Role-Based Access Control (RBAC) and permission model for the Office Management System.

The system uses roles and granular permissions to control access to application features and operations.

Authorization must be enforced by the backend.

The frontend may use permissions to improve the user experience, but frontend checks are never a security boundary.

---

## 2. Core Authorization Model

The authorization model is:

```text
User
  ↓
Organization Membership
  ↓
Role
  ↓
Permissions
  ↓
Allowed Action