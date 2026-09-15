/**
 * Canonical backend endpoint paths for the OfficeOS FastAPI API (/api/v1).
 */

export const API_ENDPOINTS = {
  auth: {
    me: "/auth/me",
    permissions: "/auth/permissions",
  },
  organizations: {
    list: "/organizations",
    detail: (id: string) => `/organizations/${id}`,
    members: (id: string) => `/organizations/${id}/members`,
  },
  employees: {
    list: "/employees",
    detail: (id: string) => `/employees/${id}`,
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
