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
    types: "/leave-types",
    typeDetail: (id: string) => `/leave-types/${id}`,
    requests: "/leave-requests",
    requestDetail: (id: string) => `/leave-requests/${id}`,
    approve: (id: string) => `/leave-requests/${id}/approve`,
    reject: (id: string) => `/leave-requests/${id}/reject`,
    cancel: (id: string) => `/leave-requests/${id}/cancel`,
    summary: "/leave-requests/summary",
    holidays: "/holidays",
    holidayDetail: (id: string) => `/holidays/${id}`,
    list: "/leave-requests",
    balance: "/leave-requests/summary",
  },
  clients: {
    list: "/clients",
    create: "/clients",
    detail: (id: string) => `/clients/${id}`,
    update: (id: string) => `/clients/${id}`,
    delete: (id: string) => `/clients/${id}`,
    contacts: (clientId: string) => `/clients/${clientId}/contacts`,
    contactDetail: (clientId: string, contactId: string) => `/clients/${clientId}/contacts/${contactId}`,
  },
  projects: {
    list: "/projects",
    create: "/projects",
    detail: (id: string) => `/projects/${id}`,
    update: (id: string) => `/projects/${id}`,
    delete: (id: string) => `/projects/${id}`,
    members: (projectId: string) => `/projects/${projectId}/members`,
    memberDetail: (projectId: string, memberId: string) => `/projects/${projectId}/members/${memberId}`,
  },
  finance: {
    overview: "/finance/overview",
  },
  settings: {
    general: "/settings/general",
  },
} as const;
