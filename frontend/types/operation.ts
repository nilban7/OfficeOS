export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export interface EmployeeSummary {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation?: string | null;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  code: string;
}

export interface BranchSummary {
  id: string;
  name: string;
  code: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
}

export interface ClientSummary {
  id: string;
  name: string;
}

export interface AssetSummary {
  id: string;
  name: string;
  asset_tag: string;
}

export interface OperationChecklist {
  id: string;
  organization_id: string;
  task_id: string;
  title: string;
  sequence_order: number;
  is_required: boolean;
  is_completed: boolean;
  completed_by_id?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  completed_by?: EmployeeSummary | null;
}

export interface OperationChecklistCreate {
  title: string;
  sequence_order?: number;
  is_required?: boolean;
  notes?: string | null;
}

export interface OperationChecklistUpdate {
  title?: string;
  sequence_order?: number;
  is_required?: boolean;
  is_completed?: boolean;
  notes?: string | null;
}

export interface OperationTaskAssignee {
  id: string;
  organization_id: string;
  task_id: string;
  employee_id: string;
  role: string;
  assigned_at: string;
  employee?: EmployeeSummary | null;
}

export interface OperationTask {
  id: string;
  organization_id: string;
  task_number: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  requester_id?: string | null;
  assigned_to_id?: string | null;
  department_id?: string | null;
  branch_id?: string | null;
  project_id?: string | null;
  client_id?: string | null;
  asset_id?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;

  requester?: EmployeeSummary | null;
  assigned_to?: EmployeeSummary | null;
  department?: DepartmentSummary | null;
  branch?: BranchSummary | null;
  project?: ProjectSummary | null;
  client?: ClientSummary | null;
  asset?: AssetSummary | null;

  checklists_count: number;
  completed_checklists_count: number;
  assignees_count: number;
}

export interface OperationTaskDetail extends OperationTask {
  checklists: OperationChecklist[];
  assignees: OperationTaskAssignee[];
}

export interface OperationTaskCreate {
  task_number: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: TaskPriority;
  requester_id?: string | null;
  assigned_to_id?: string | null;
  department_id?: string | null;
  branch_id?: string | null;
  project_id?: string | null;
  client_id?: string | null;
  asset_id?: string | null;
  due_date?: string | null;
  notes?: string | null;
}

export interface OperationTaskUpdate {
  title?: string;
  description?: string | null;
  category?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  assigned_to_id?: string | null;
  department_id?: string | null;
  branch_id?: string | null;
  project_id?: string | null;
  client_id?: string | null;
  asset_id?: string | null;
  due_date?: string | null;
  notes?: string | null;
}

export interface OperationTaskAssign {
  assigned_to_id: string;
  notes?: string | null;
}

export interface OperationTaskStatusAction {
  notes?: string | null;
}

export interface OperationTaskListResponse {
  items: OperationTask[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
