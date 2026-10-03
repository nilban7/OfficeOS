export type DocumentStatus = "draft" | "active" | "archived" | "deleted";
export type GranteeType = "employee" | "department" | "role";
export type PermissionLevel = "view" | "edit" | "manage";

export interface EmployeeSummary {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation?: string | null;
}

export interface ClientSummary {
  id: string;
  name: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
}

export interface VendorSummary {
  id: string;
  name: string;
  code: string;
}

export interface BranchSummary {
  id: string;
  name: string;
  code: string;
}

export interface DocumentVersion {
  id: string;
  organization_id: string;
  document_id: string;
  version_number: number;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  checksum?: string | null;
  uploaded_by_id: string;
  notes?: string | null;
  created_at: string;
  uploaded_by?: EmployeeSummary | null;
}

export interface DocumentVersionCreate {
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  checksum?: string | null;
  notes?: string | null;
}

export interface DocumentPermission {
  id: string;
  organization_id: string;
  document_id: string;
  grantee_type: GranteeType;
  grantee_id: string;
  permission_level: PermissionLevel;
  created_at: string;
}

export interface DocumentPermissionCreate {
  grantee_type: GranteeType;
  grantee_id: string;
  permission_level: PermissionLevel;
}

export interface DocumentPermissionUpdate {
  permission_level: PermissionLevel;
}

export interface Document {
  id: string;
  organization_id: string;
  document_number: string;
  title: string;
  description?: string | null;
  category: string;
  document_type: string;
  owner_id: string;
  client_id?: string | null;
  project_id?: string | null;
  vendor_id?: string | null;
  branch_id?: string | null;
  status: DocumentStatus;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  current_version: number;
  created_at: string;
  updated_at: string;
  owner?: EmployeeSummary | null;
  client?: ClientSummary | null;
  project?: ProjectSummary | null;
  vendor?: VendorSummary | null;
  branch?: BranchSummary | null;
  versions_count?: number;
}

export interface DocumentDetail extends Document {
  versions: DocumentVersion[];
  permissions: DocumentPermission[];
}

export interface DocumentCreate {
  document_number: string;
  title: string;
  description?: string | null;
  category: string;
  document_type: string;
  owner_id: string;
  client_id?: string | null;
  project_id?: string | null;
  vendor_id?: string | null;
  branch_id?: string | null;
  status?: DocumentStatus;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  notes?: string | null;
}

export interface DocumentUpdate {
  title?: string;
  description?: string | null;
  category?: string;
  document_type?: string;
  client_id?: string | null;
  project_id?: string | null;
  vendor_id?: string | null;
  branch_id?: string | null;
  status?: DocumentStatus;
}

export interface DocumentDownloadResponse {
  download_url: string;
  expires_in: number;
  filename: string;
  mime_type: string;
  file_size: number;
}

export interface DocumentUploadUrlResponse {
  upload_url: string;
  storage_path: string;
  expires_in: number;
}
