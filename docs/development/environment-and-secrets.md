# Environment and Secrets

## 1. Purpose

This document defines how environment-specific configuration and secrets are handled in the Office Management System.

The goal is to:

- Keep secrets out of Git.
- Keep local, development, staging, and production configuration separate.
- Prevent accidental exposure of privileged credentials.
- Make setup predictable for every developer and AI agent.

---

## 2. Environment Types

The project should support:

```text
local
development
staging
production