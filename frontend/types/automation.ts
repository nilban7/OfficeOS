export interface Automation {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  trigger_type: "event" | "schedule" | "manual";
  trigger_config: Record<string, unknown>;
  action_type: "notification" | "audit_log" | "task_create";
  action_config: Record<string, unknown>;
  created_by_id: string;
  last_run_at?: string | null;
  last_run_status?: string | null;
  next_run_at?: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationCreate {
  name: string;
  description?: string;
  trigger_type: "event" | "schedule" | "manual";
  trigger_config?: Record<string, unknown>;
  action_type: "notification" | "audit_log" | "task_create";
  action_config?: Record<string, unknown>;
  is_active?: boolean;
}

export interface AutomationUpdate {
  name?: string;
  description?: string;
  trigger_type?: "event" | "schedule" | "manual";
  trigger_config?: Record<string, unknown>;
  action_type?: "notification" | "audit_log" | "task_create";
  action_config?: Record<string, unknown>;
  is_active?: boolean;
}

export interface AutomationExecution {
  id: string;
  organization_id: string;
  automation_id: string;
  triggered_by_id?: string | null;
  trigger_source: string;
  status: "success" | "failed" | "skipped";
  execution_payload: Record<string, unknown>;
  result_summary?: string | null;
  error_message?: string | null;
  duration_ms: number;
  created_at: string;
}
