/**
 * Employee & Department Types for OfficeOS Frontend
 * Matches FastAPI backend schemas in app.schemas.employee
 */

export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";

export type EmployeeStatus =
  | "active"
  | "probation"
  | "notice_period"
  | "on_leave"
  | "suspended"
  | "terminated";

export interface Department {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  description?: string | null;
  manager_id?: string | null;
  manager_name?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentCreate {
  name: string;
  code: string;
  description?: string | null;
  manager_id?: string | null;
  is_active?: boolean;
}

export interface DepartmentUpdate {
  name?: string;
  code?: string;
  description?: string | null;
  manager_id?: string | null;
  is_active?: boolean;
}

export interface DepartmentBrief {
  id: string;
  name: string;
  code: string;
}

export interface BranchBrief {
  id: string;
  name: string;
  code: string;
}

export interface ManagerBrief {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation: string;
}

export interface ManagerOption {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation: string;
  department_name?: string | null;
  branch_name?: string | null;
}

export interface Employee {
  id: string;
  organization_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation: string;
  employment_type: EmploymentType | string;
  status: EmployeeStatus | string;
  date_of_joining: string;
  date_of_exit?: string | null;
  department_id?: string | null;
  department?: DepartmentBrief | null;
  branch_id?: string | null;
  branch?: BranchBrief | null;
  reporting_manager_id?: string | null;
  reporting_manager?: ManagerBrief | null;
  work_email?: string | null;
  phone_number?: string | null;
  personal_email?: string | null;
  current_address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  profile_id?: string | null;
  membership_id?: string | null;
  direct_reports?: ManagerBrief[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeCreate {
  employee_code: string;
  first_name: string;
  last_name: string;
  designation: string;
  employment_type: string;
  status: string;
  date_of_joining: string;
  date_of_exit?: string | null;
  department_id?: string | null;
  branch_id?: string | null;
  reporting_manager_id?: string | null;
  profile_id?: string | null;
  membership_id?: string | null;
  work_email?: string | null;
  personal_email?: string | null;
  phone_number?: string | null;
  current_address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  is_active?: boolean;
}

export interface EmployeeUpdate {
  employee_code?: string;
  first_name?: string;
  last_name?: string;
  designation?: string;
  employment_type?: string;
  status?: string;
  date_of_joining?: string;
  date_of_exit?: string | null;
  department_id?: string | null;
  branch_id?: string | null;
  reporting_manager_id?: string | null;
  profile_id?: string | null;
  membership_id?: string | null;
  work_email?: string | null;
  personal_email?: string | null;
  phone_number?: string | null;
  current_address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  is_active?: boolean;
}

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PaginatedEmployees {
  items: Employee[];
  meta: PaginationMeta;
}
