/**
 * Canonical backend endpoint paths for the OfficeOS FastAPI API (/api/v1).
 */

export const API_ENDPOINTS = {
  health: "/health",
  me: {
    profile: "/me",
    organizations: "/me/organizations",
    permissions: "/me/permissions",
  },
  organizations: {
    list: "/organizations",
    detail: (id: string) => `/organizations/${id}`,
    members: (id: string) => `/organizations/${id}/members`,
    current: "/organizations/current",
    currentSettings: "/organizations/current/settings",
    currentBranches: "/organizations/current/branches",
    currentBranch: (id: string) => `/organizations/current/branches/${id}`,
    currentRoles: "/organizations/current/roles",
    currentMembers: "/organizations/current/members",
    currentMember: (id: string) => `/organizations/current/members/${id}`,
  },
  departments: {
    list: "/departments",
    detail: (id: string) => `/departments/${id}`,
  },
  employees: {
    list: "/employees",
    detail: (id: string) => `/employees/${id}`,
    managers: "/employees/managers",
  },
  attendance: {
    list: "/attendance",
    clockIn: "/attendance/clock-in",
    clockOut: "/attendance/clock-out",
  },
  leave: {
    list: "/leave/requests",
    balance: "/leave/balance",
  },
  projects: {
    list: "/projects",
    detail: (id: string) => `/projects/${id}`,
  },
  finance: {
    overview: "/finance/overview",
  },
  settings: {
    general: "/settings/general",
  },
} as const;
