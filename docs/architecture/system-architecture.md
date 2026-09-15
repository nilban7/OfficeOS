# Office Management System — System Architecture

## 1. Overview

The Office Management System is a multi-tenant SaaS platform designed to allow multiple independent organizations to manage their employees, HR activities, attendance, leave, clients, projects, procurement, assets, maintenance, operations, finance, documents, notifications, and reports.

The architecture must support:

- Multiple organizations
- Strong organization-level data isolation
- Role-based access control
- Secure authentication
- Scalable backend services
- Maintainable frontend architecture
- Version-controlled database changes
- Future AI and automation capabilities

---

# 2. High-Level Architecture

```text
                         USERS
                           |
                           v
                    +-------------+
                    |   Next.js   |
                    |  Frontend   |
                    +------+------+
                           |
              +------------+------------+
              |                         |
              v                         v
       +-------------+           +-------------+
       |  Supabase   |           |   FastAPI   |
       |    Auth     |           |   Backend   |
       +-------------+           +------+------+
                                        |
                                        v
                                Business Logic
                                        |
                                        v
                                  Authorization
                                        |
                                        v
                                  Supabase
                                        |
                         +--------------+--------------+
                         |                             |
                         v                             v
                   PostgreSQL                    Supabase Storage