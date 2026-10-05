/**
 * SaaS Administration Types.
 * Matches backend schemas for Platform Administration (Module 21).
 */

export interface PlatformConfiguration {
  id: string;
  platform_name: string;
  support_email: string | null;
  maintenance_mode: boolean;
  allowed_signup_domains: string[];
  max_organizations: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformConfigurationUpdate {
  platform_name?: string;
  support_email?: string;
  maintenance_mode?: boolean;
  allowed_signup_domains?: string[];
  max_organizations?: number;
}

export type AnnouncementSeverity = "info" | "warning" | "critical";
export type AnnouncementTargetType = "all" | "specific_orgs";

export interface PlatformAnnouncement {
  id: string;
  title: string;
  content: string;
  severity: AnnouncementSeverity;
  is_active: boolean;
  target_type: AnnouncementTargetType;
  target_org_ids: string[];
  created_by_id?: string | null;
  starts_at: string;
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformAnnouncementCreate {
  title: string;
  content: string;
  severity?: AnnouncementSeverity;
  is_active?: boolean;
  target_type?: AnnouncementTargetType;
  target_org_ids?: string[];
  starts_at?: string;
  ends_at?: string | null;
}

export interface PlatformAnnouncementUpdate {
  title?: string;
  content?: string;
  severity?: AnnouncementSeverity;
  is_active?: boolean;
  target_type?: AnnouncementTargetType;
  target_org_ids?: string[];
  ends_at?: string | null;
}

export interface OrganizationDirectoryItem {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "deactivated";
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch_count: number;
  member_count: number;
  employee_count: number;
  suspension_reason?: string | null;
  suspended_at?: string | null;
}

export interface OrganizationDirectoryResponse {
  items: OrganizationDirectoryItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface OrganizationCreateRequest {
  name: string;
  slug?: string;
  timezone?: string;
  currency?: string;
}

export interface OrganizationUpdateRequest {
  name?: string;
  slug?: string;
  is_active?: boolean;
}

export interface OrganizationDetailResponse {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "deactivated";
  is_active: boolean;
  created_at: string;
  updated_at: string;
  suspension_reason?: string | null;
  suspended_at?: string | null;
  timezone: string;
  currency: string;
  branch_count: number;
  member_count: number;
  employee_count: number;
  project_count: number;
}

export interface PlatformMemberItem {
  membership_id: string;
  profile_id: string;
  auth_user_id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  organization_id: string;
  organization_name: string;
  status: string;
  roles: string[];
  created_at: string;
}

export interface PlatformMembersResponse {
  items: PlatformMemberItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface OrganizationBreakdownItem {
  organization_id: string;
  name: string;
  status: string;
  member_count: number;
  employee_count: number;
  project_count: number;
}

export interface PlatformUsageResponse {
  total_organizations: number;
  active_organizations: number;
  suspended_organizations: number;
  total_members: number;
  total_employees: number;
  total_projects: number;
  total_clients: number;
  total_assets: number;
  total_documents: number;
  organization_breakdown: OrganizationBreakdownItem[];
}

export interface PlatformHealthResponse {
  status: string;
  database_connected: boolean;
  database_latency_ms: number;
  migration_head: string;
  app_version: string;
  environment: string;
  active_organizations: number;
}

export interface PlatformOverviewResponse {
  total_organizations: number;
  active_organizations: number;
  suspended_organizations: number;
  total_users: number;
  total_employees: number;
  recent_organizations: OrganizationDirectoryItem[];
  system_status: string;
}
