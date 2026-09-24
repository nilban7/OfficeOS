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
  SETTINGS: "/settings",
  SETTINGS_ORGANIZATION: "/settings/organization",
} as const;
