/**
 * Foundational Organization, Membership, and RBAC Permission Types.
 * Matches the OfficeOS multi-tenant architecture and FastAPI backend schemas.
 */

export type CanonicalRole =
  | "system_admin"
  | "organization_owner"
  | "organization_admin"
  | "hr_manager"
  | "finance_manager"
  | "project_manager"
  | "department_manager"
  | "employee";

export type UserRole = CanonicalRole | string;

export type CanonicalPermission =
  | "organizations.view"
  | "organizations.update"
  | "organizations.settings_manage"
  | "branches.view"
  | "branches.manage"
  | "departments.view"
  | "departments.manage"
  | "roles.view"
  | "members.view"
  | "members.manage"
  | "employees.view"
  | "employees.create"
  | "employees.update"
  | "employees.delete"
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

export type Permission = CanonicalPermission | string;

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

export interface OrganizationProfile {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationProfileUpdate {
  name?: string;
}

export interface OrganizationSettings {
  id: string;
  organization_id: string;
  timezone: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSettingsUpdate {
  timezone?: string;
  currency?: string;
}

export interface BranchResponse {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  address?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Branch = BranchResponse;

export interface BranchCreate {
  name: string;
  code: string;
  address?: string | null;
  is_active?: boolean;
}

export interface BranchUpdate {
  name?: string;
  code?: string;
  address?: string | null;
  is_active?: boolean;
}

export interface RoleResponse {
  id: string;
  organization_id?: string | null;
  name: string;
  description?: string | null;
  is_system: boolean;
}

export interface MemberProfile {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export interface MemberResponse {
  id: string;
  organization_id: string;
  profile_id: string;
  status: string;
  profile: MemberProfile;
  roles: RoleResponse[];
  created_at: string;
  updated_at: string;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  organization: Organization;
  userId: string;
  role?: UserRole | null;
  permissions: Permission[];
  isActive: boolean;
  createdAt: string;
}
