export type KioskVerificationMethod = "pin" | "face" | "qr" | "fingerprint";

export interface KioskDevice {
  id: string;
  organization_id: string;
  branch_id?: string | null;
  name: string;
  device_identifier: string;
  device_model?: string | null;
  app_version?: string | null;
  ip_address?: string | null;
  battery_level?: number | null;
  is_charging?: boolean | null;
  is_active: boolean;
  last_heartbeat_at?: string | null;
  ip_restrictions?: string[] | null;
  allowed_modes?: string[] | null;
  created_at: string;
  updated_at?: string | null;
}

export interface KioskActivationCode {
  id: string;
  organization_id: string;
  branch_id?: string | null;
  code: string;
  is_used: boolean;
  used_at?: string | null;
  expires_at: string;
  created_at: string;
}

export interface KioskActivateRequest {
  code: string;
  secret_code?: string;
  device_name: string;
  device_identifier?: string;
  device_model?: string;
  app_version?: string;
  battery_level?: number;
}

export interface KioskActivateResponse {
  kiosk_token: string;
  device_token?: string;
  kiosk_id?: string;
  organization_id?: string;
  organization_name: string;
  branch_id?: string | null;
  device_name: string;
  allowed_modes: string[];
  exit_pin: string;
}

export interface KioskPunchRequest {
  employee_code?: string;
  employee_identifier?: string;
  verification_method: string;
  punch_type: string;
  employee_pin?: string;
  pin_code?: string;
  face_snapshot_data?: string;
  face_snapshot_base64?: string;
  fingerprint_credential_id?: string;
  latitude?: number;
  longitude?: number;
  device_timestamp?: string;
}

export interface KioskPunchResponse {
  success: boolean;
  message: string;
  punch_type: "in" | "out";
  punched_at: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department?: string | null;
  avatar_url?: string | null;
  work_duration_hours?: number | null;
}

export interface KioskPunchAuditItem {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  punch_type: string;
  timestamp: string;
  verification_method: string;
  kiosk_device_id?: string | null;
  kiosk_device_name?: string | null;
  face_snapshot_url?: string | null;
  client_ip?: string | null;
}

export interface KioskEmployeeStatusItem {
  id: string;
  code: string;
  name: string;
  role: string;
  department: string;
  initials: string;
  is_enrolled: boolean;
  credential_id?: string | null;
  raw_id_base64?: string | null;
  finger_label?: string | null;
  enrolled_at?: string | null;
  today_status?: "in" | "out" | "completed" | null;
  punched_at?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  shift_completed?: boolean;
  duration_hours?: number | null;
  attendance_status?: string | null;
}

