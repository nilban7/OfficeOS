"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { ApiException } from "@/types/api";
import type { Organization, OrganizationMembership, PermissionData, Permission } from "@/types/organization";

export function useOrganization() {
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
            // Keep existing selected org if valid, else default to first
            setCurrentOrganization((prev) => {
              if (prev && orgs.some((o) => o.id === prev.id)) {
                return prev;
              }
              return orgs[0] ?? null;
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
  }, [isAuthenticated, session?.accessToken]);

  // 2. Fetch permissions when currentOrganization changes
  useEffect(() => {
    let isMounted = true;

    async function fetchPermissions(orgId: string) {
      setIsLoadingPermissions(true);
      setPermissionError(null);

      try {
        const permData = await apiClient.get<PermissionData[]>(API_ENDPOINTS.me.permissions, {
          organizationId: orgId,
        });

        if (isMounted) {
          const codes = (permData || []).map((p) => p.code as Permission);
          setPermissions(codes);
          if (currentOrganization) {
            setMembership({
              id: `mem-${orgId}`,
              organizationId: orgId,
              organization: currentOrganization,
              userId: session?.user?.id || "",
              role: "org_admin",
              permissions: codes,
              isActive: true,
              createdAt: new Date().toISOString(),
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

    if (isAuthenticated && session?.accessToken && currentOrganization?.id) {
      void fetchPermissions(currentOrganization.id);
    } else if (!currentOrganization) {
      setPermissions([]);
      setMembership(null);
    }

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, session?.accessToken, session?.user?.id, currentOrganization]);

  const selectOrganization = useCallback(
    (orgId: string) => {
      const selected = organizations.find((o) => o.id === orgId) || null;
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
