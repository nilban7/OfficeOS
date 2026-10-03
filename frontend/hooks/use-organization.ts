"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ApiException } from "@/types/api";
import type { Organization, OrganizationMembership, PermissionData, Permission } from "@/types/organization";

export const ALL_CANONICAL_PERMISSIONS: Permission[] = [
  "organizations.view",
  "organizations.update",
  "organizations.settings_manage",
  "branches.view",
  "branches.manage",
  "departments.view",
  "departments.manage",
  "roles.view",
  "members.view",
  "members.manage",
  "employees.view",
  "employees.create",
  "employees.update",
  "employees.delete",
  "attendance.view",
  "attendance.create",
  "attendance.update",
  "attendance.delete",
  "leave.view",
  "leave.request",
  "leave.approve",
  "leave.cancel",
  "leave.manage",
  "leave_types.manage",
  "holidays.view",
  "holidays.manage",
  "clients.view",
  "clients.create",
  "clients.update",
  "clients.delete",
  "client_contacts.view",
  "client_contacts.manage",
  "projects.view",
  "projects.create",
  "projects.update",
  "projects.delete",
  "project_members.view",
  "project_members.manage",
  "procurement.view",
  "procurement.create",
  "procurement.update",
  "procurement.delete",
  "procurement.approve",
  "vendors.view",
  "vendors.manage",
  "purchase_orders.view",
  "purchase_orders.manage",
  "assets.view",
  "assets.create",
  "assets.update",
  "assets.delete",
  "assets.assign",
  "assets.return",
  "maintenance.view",
  "maintenance.create",
  "maintenance.update",
  "maintenance.delete",
  "maintenance.assign",
  "maintenance.complete",
  "training.view",
  "training.create",
  "training.update",
  "training.delete",
  "training.enroll",
  "training.complete",
  "training.manage",
  "internships.view",
  "internships.create",
  "internships.update",
  "internships.delete",
  "internships.review",
  "internships.manage",
  "operations.view",
  "operations.create",
  "operations.update",
  "operations.delete",
  "operations.assign",
  "operations.complete",
  "operations.manage",
  "finance.view",
  "finance.create",
  "finance.update",
  "finance.delete",
  "finance.approve",
  "finance.pay",
  "finance.manage",
  "documents.view",
  "documents.create",
  "documents.update",
  "documents.delete",
  "documents.download",
  "documents.manage",
  "notifications.view",
  "notifications.create",
  "notifications.mark_read",
  "notifications.manage",
  "notifications.preferences",
  "audit_logs.view",
  "reports.view",
  "reports.workforce",
  "reports.attendance",
  "reports.leave",
  "reports.procurement",
  "reports.maintenance",
  "reports.finance",
  "reports.audit",
  "ai.view",
  "ai.use",
  "ai.manage",
  "automations.view",
  "automations.create",
  "automations.update",
  "automations.delete",
  "automations.execute",
  "automations.manage",
  "saas.view",
  "saas.manage",
  "org:read",
  "org:update",
  "org:delete",
  "employee:read",
  "employee:create",
];

export interface OrganizationContextType {
  organizations: Organization[];
  currentOrganization: Organization | null;
  permissions: Permission[];
  membership: OrganizationMembership | null;
  isLoadingOrgs: boolean;
  isLoadingPermissions: boolean;
  isLoading: boolean;
  orgError: string | null;
  permissionError: string | null;
  error: string | null;
  selectOrganization: (orgId: string) => void;
  setOrganizations: React.Dispatch<React.SetStateAction<Organization[]>>;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);
// No hardcoded tenant fallback. Organization selection is populated only from
// the authenticated user's validated memberships returned by the backend.
// Missing context fails closed; X-Organization-Id is never an authz proof.
const DEFAULT_MEMBERSHIP_CREATED_AT = "2026-01-01T00:00:00.000Z";

function useStandaloneOrganization(enabled: boolean): OrganizationContextType {
  const { isAuthenticated, session } = useAuth();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);

  const [isLoadingOrgs, setIsLoadingOrgs] = useState<boolean>(false);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState<boolean>(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // 1. Fetch user's organizations on auth state change
  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    async function fetchOrganizations() {
      if (!isAuthenticated || !session?.accessToken) {
        if (isMounted) {
          setOrganizations([]);
          setCurrentOrganization(null);
          setPermissions([]);
          setMembership(null);
        }
        return;
      }

      setIsLoadingOrgs(true);
      setOrgError(null);

      try {
        const orgs = await apiClient.get<Organization[]>(API_ENDPOINTS.me.organizations);
        if (isMounted) {
          setOrganizations(orgs || []);
          if (orgs && orgs.length > 0) {
            setCurrentOrganization((prev) => {
              if (prev && orgs.some((o) => o.id === prev.id)) {
                return orgs.find((o) => o.id === prev.id) || prev;
              }
              const savedId = typeof window !== "undefined" ? localStorage.getItem("officeos_active_org_id") : null;
              const matched = savedId ? orgs.find((o) => o.id === savedId) : null;
              const chosen = (matched || orgs[0]) ?? null;
              if (chosen && typeof window !== "undefined") {
                localStorage.setItem("officeos_active_org_id", chosen.id);
              }
              return chosen;
            });
          } else {
            setCurrentOrganization(null);
          }
        }
      } catch (err) {
        if (isMounted) {
          const msg = err instanceof ApiException ? err.message : "Failed to load organizations";
          setOrgError(msg);
        }
      } finally {
        if (isMounted) {
          setIsLoadingOrgs(false);
        }
      }
    }

    void fetchOrganizations();

    return () => {
      isMounted = false;
    };
  }, [enabled, isAuthenticated, session?.accessToken]);

  // 2. Fetch permissions when currentOrganization changes
  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    const orgId = currentOrganization?.id;

    async function fetchPermissions(targetOrgId: string) {
      setIsLoadingPermissions(true);
      setPermissionError(null);

      try {
        const permData = await apiClient.get<PermissionData[]>(API_ENDPOINTS.me.permissions, {
          organizationId: targetOrgId,
        });

        if (isMounted) {
          const codes = (permData || []).map((p) => p.code as Permission);
          setPermissions(codes);
          if (currentOrganization) {
            setMembership({
              id: `mem-${targetOrgId}`,
              organizationId: targetOrgId,
              organization: currentOrganization,
              userId: session?.user?.id || "",
              role: null,
              permissions: codes,
              isActive: true,
              createdAt: DEFAULT_MEMBERSHIP_CREATED_AT,
            });
          }
        }
      } catch (err) {
        if (isMounted) {
          setPermissions([]);
          if (err instanceof ApiException) {
            if (err.status === 403) {
              setPermissionError("Access denied for this organization");
            } else if (err.status === 400) {
              setPermissionError("Invalid organization selection");
            } else {
              setPermissionError(err.message);
            }
          } else {
            setPermissionError("Failed to load organization permissions");
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingPermissions(false);
        }
      }
    }

    if (isAuthenticated && session?.accessToken && orgId) {
      void fetchPermissions(orgId);
    } else if (!currentOrganization) {
      setPermissions([]);
      setMembership(null);
    }

    return () => {
      isMounted = false;
    };
  }, [enabled, isAuthenticated, session?.accessToken, session?.user?.id, currentOrganization?.id]);

  useEffect(() => {
    if (!enabled) return;

    if (typeof window !== "undefined" && currentOrganization?.id) {
      localStorage.setItem("officeos_active_org_id", currentOrganization.id);
    }
  }, [enabled, currentOrganization?.id]);

  const selectOrganization = useCallback(
    (orgId: string) => {
      const selected = organizations.find((o) => o.id === orgId) || null;
      if (selected && typeof window !== "undefined") {
        localStorage.setItem("officeos_active_org_id", selected.id);
      }
      setCurrentOrganization(selected);
    },
    [organizations]
  );

  return {
    organizations,
    currentOrganization,
    permissions,
    membership,
    isLoadingOrgs,
    isLoadingPermissions,
    isLoading: isLoadingOrgs || isLoadingPermissions,
    orgError,
    permissionError,
    error: orgError || permissionError,
    selectOrganization,
    setOrganizations,
  };
}

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, session, user } = useAuth();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);

  const [membership, setMembership] = useState<OrganizationMembership | null>(null);

  const [isLoadingOrgs] = useState<boolean>(false);
  const [isLoadingPermissions] = useState<boolean>(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    // Do not hydrate tenant access from browser storage. The authenticated
    // user's memberships returned by /me/organizations are authoritative.
    setIsCacheLoaded(true);
  }, []);

  // Sync background fetch for organizations
  useEffect(() => {
    if (!isCacheLoaded) return;

    let isMounted = true;

    async function syncOrganizations() {
      if (!isAuthenticated || !session?.accessToken) return;

      try {
        const orgs = await apiClient.get<Organization[]>(API_ENDPOINTS.me.organizations);
        if (isMounted) {
          const validatedOrgs = orgs || [];
          setOrganizations(validatedOrgs);
          if (validatedOrgs.length === 0) {
            setCurrentOrganization(null);
            setPermissions([]);
            setMembership(null);
            localStorage.removeItem("officeos_active_org_id");
            localStorage.removeItem("officeos_active_org");
            return;
          }
          setCurrentOrganization((prev) => {
            if (prev && validatedOrgs.some((o) => o.id === prev.id)) {
              const matched = validatedOrgs.find((o) => o.id === prev.id) || prev;
              if (typeof window !== "undefined") {
                localStorage.setItem("officeos_active_org", JSON.stringify(matched));
                localStorage.setItem("officeos_active_org_id", matched.id);
              }
              return matched;
            }
            const savedId = typeof window !== "undefined" ? localStorage.getItem("officeos_active_org_id") : null;
            const matched = savedId ? validatedOrgs.find((o) => o.id === savedId) : null;
            const chosen = (matched || validatedOrgs[0]) ?? null;
            if (chosen && typeof window !== "undefined") {
              localStorage.setItem("officeos_active_org", JSON.stringify(chosen));
              localStorage.setItem("officeos_active_org_id", chosen.id);
            }
            return chosen;
          });
        }
      } catch (err) {
        if (isMounted) {
          const msg = err instanceof ApiException ? err.message : "Failed to load organizations";
          setOrgError(msg);
        }
      }
    }

    void syncOrganizations();

    return () => {
      isMounted = false;
    };
  }, [isCacheLoaded, isAuthenticated, session?.accessToken]);

  // Sync permissions when currentOrganization changes
  useEffect(() => {
    if (!isCacheLoaded) return;

    let isMounted = true;
    const orgId = currentOrganization?.id;

    async function syncPermissions(targetOrgId: string) {
      try {
        const permData = await apiClient.get<PermissionData[]>(API_ENDPOINTS.me.permissions, {
          organizationId: targetOrgId,
        });

        if (isMounted) {
          // Backend is the authorization boundary. Permissions come only from
          // the validated membership; never grant canonical permissions here.
          const codes = (permData || []).map((p) => p.code as Permission);
          setPermissions(codes);
          if (typeof window !== "undefined") {
            localStorage.setItem("officeos_active_perms", JSON.stringify(codes));
          }
          if (currentOrganization) {
            setMembership({
              id: `mem-${targetOrgId}`,
              organizationId: targetOrgId,
              organization: currentOrganization,
              userId: session?.user?.id || user?.id || "",
              role: null,
              permissions: codes,
              isActive: true,
              createdAt: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        if (isMounted) {
          setPermissions([]);
          setMembership(null);
          if (err instanceof ApiException) {
            if (err.status === 403) {
              setPermissionError("Access denied for this organization");
            } else {
              setPermissionError(err.message);
            }
          }
        }
      }
    }

    if (isAuthenticated && session?.accessToken && orgId) {
      void syncPermissions(orgId);
    }

    return () => {
      isMounted = false;
    };
  }, [isCacheLoaded, isAuthenticated, session?.accessToken, session?.user?.id, user?.id, currentOrganization?.id]);

  const selectOrganization = useCallback(
    (orgId: string) => {
      const selected = organizations.find((o) => o.id === orgId) || null;
      if (selected) {
        if (typeof window !== "undefined") {
          localStorage.setItem("officeos_active_org_id", selected.id);
          localStorage.setItem("officeos_active_org", JSON.stringify(selected));
        }
        setCurrentOrganization(selected);
      }
    },
    [organizations]
  );

  const value = useMemo<OrganizationContextType>(
    () => ({
      organizations,
      currentOrganization,
      permissions,
      membership,
      isLoadingOrgs,
      isLoadingPermissions,
      isLoading: false,
      orgError,
      permissionError,
      error: orgError || permissionError,
      selectOrganization,
      setOrganizations,
    }),
    [
      organizations,
      currentOrganization,
      permissions,
      membership,
      isLoadingOrgs,
      isLoadingPermissions,
      orgError,
      permissionError,
      selectOrganization,
    ]
  );

  return React.createElement(OrganizationContext.Provider, { value }, children);
}

export function useOrganization(): OrganizationContextType {
  const context = useContext(OrganizationContext);
  const standalone = useStandaloneOrganization(context === null);
  return context ?? standalone;
}
