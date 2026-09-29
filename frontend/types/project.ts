/**
 * Project Management Types for OfficeOS Frontend
 * Matches FastAPI backend schemas in app.schemas.project
 */

export type ProjectStatus = "planned" | "active" | "on_hold" | "completed" | "cancelled";

export interface ProjectMember {
  id: string;
  organization_id: string;
  project_id: string;
  employee_id: string;
  role?: string | null;
  allocation_percentage?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string | null;
  employee_code?: string | null;
  employee_email?: string | null;
  employee_designation?: string | null;
}

export interface Project {
  id: string;
  organization_id: string;
  client_id?: string | null;
  project_code: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | string | null;
  project_manager_employee_id?: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string | null;
  client_code?: string | null;
  project_manager_name?: string | null;
  project_manager_code?: string | null;
  members_count?: number;
}

export interface ProjectDetail extends Project {
  members: ProjectMember[];
}

export interface ProjectCreateInput {
  project_code: string;
  name: string;
  description?: string | null;
  client_id?: string | null;
  status?: ProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  project_manager_employee_id?: string | null;
}

export interface ProjectUpdateInput {
  project_code?: string;
  name?: string;
  description?: string | null;
  client_id?: string | null;
  status?: ProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  project_manager_employee_id?: string | null;
}

export interface ProjectMemberCreateInput {
  employee_id: string;
  role?: string | null;
  allocation_percentage?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface ProjectMemberUpdateInput {
  role?: string | null;
  allocation_percentage?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ProjectListResponse {
  items: Project[];
  meta: PaginationMeta;
}
