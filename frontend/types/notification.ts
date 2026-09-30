export type NotificationType =
  | "system"
  | "task"
  | "project"
  | "document"
  | "leave"
  | "attendance"
  | "finance"
  | "maintenance"
  | "training"
  | "general";

export interface Notification {
  id: string;
  organization_id: string;
  recipient_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  action_url?: string | null;
  metadata?: Record<string, unknown> | null;
  read_at?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationCreate {
  recipient_id: string;
  notification_type?: NotificationType;
  title: string;
  message: string;
  action_url?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface MarkAllReadResponse {
  marked_count: number;
}

export interface NotificationPreferenceItem {
  notification_type: NotificationType;
  in_app_enabled: boolean;
  email_enabled: boolean;
}

export interface NotificationPreference {
  id: string;
  organization_id: string;
  recipient_id: string;
  notification_type: NotificationType;
  in_app_enabled: boolean;
  email_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferencesUpdate {
  preferences: NotificationPreferenceItem[];
}

export interface NotificationFilters {
  status?: "all" | "unread" | "read" | "archived";
  notification_type?: NotificationType | "all";
}
