export interface ActorSummary {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  actor_id?: string | null;
  actor?: ActorSummary | null;
  actor_email?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
}

export interface AuditLogFilters {
  action?: string;
  entity_type?: string;
  entity_id?: string;
  actor_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
}
