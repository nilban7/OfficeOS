/**
 * Foundational Organization, Membership, and RBAC Permission Types.
 * Matches the OfficeOS multi-tenant architecture.
 */

export type UserRole = "super_admin" | "org_admin" | "manager" | "employee" | "client";

export type Permission =
  | "org:read"
  | "org:update"
  | "org:delete"
  | "employee:read"
  | "employee:create"
  | "employee:update"
  | "employee:delete"
  | "attendance:read"
  | "attendance:create"
  | "attendance:approve"
  | "leave:read"
  | "leave:create"
  | "leave:approve"
  | "project:read"
  | "project:create"
  | "project:update"
  | "finance:read"
  | "finance:manage"
  | "settings:read"
  | "settings:manage";

export interface PermissionData {
  code: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  organization: Organization;
  userId: string;
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
  createdAt: string;
}
