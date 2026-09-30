/**
 * Canonical Application Route Paths
 */

export const ROUTES = {
  // Public Routes
  HOME: "/",
  LOGIN: "/login",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",

  // Protected Routes
  DASHBOARD: "/dashboard",
  REPORTS: "/reports",
  ORGANIZATION: "/organization",
  EMPLOYEES: "/employees",
  ATTENDANCE: "/attendance",
  LEAVE: "/leave",
  CLIENTS: "/clients",
  PROJECTS: "/projects",
  PROCUREMENT: "/procurement",
  ASSETS: "/assets",
  MAINTENANCE: "/maintenance",
  TRAINING: "/training",
  INTERNSHIPS: "/internships",
  OPERATIONS: "/operations",
  FINANCE: "/finance",
  DOCUMENTS: "/documents",
  NOTIFICATIONS: "/notifications",
  AUDIT_LOGS: "/audit-logs",
  AI: "/ai",
  AUTOMATIONS: "/automations",
  SETTINGS: "/settings",
  SETTINGS_AI: "/settings/ai",
  SETTINGS_ORGANIZATION: "/settings/organization",
  SETTINGS_ORGANIZATION_BRANCHES: "/settings/organization/branches",
} as const;
