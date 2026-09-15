"use client";

import { useState, useCallback } from "react";
import type { Organization, OrganizationMembership } from "@/types/organization";

// Sample initial organization data for development shell
const DEFAULT_ORGS: Organization[] = [
  {
    id: "org-demo-1",
    name: "Acme Corporation",
    slug: "acme-corp",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "org-demo-2",
    name: "Stark Industries",
    slug: "stark-industries",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function useOrganization() {
  const [organizations, setOrganizations] = useState<Organization[]>(DEFAULT_ORGS);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(DEFAULT_ORGS[0] ?? null);
  const [membership, setMembership] = useState<OrganizationMembership | null>({
    id: "mem-demo-1",
    organizationId: DEFAULT_ORGS[0]?.id || "",
    organization: DEFAULT_ORGS[0]!,
    userId: "user-1",
    role: "org_admin",
    permissions: ["org:read", "employee:read", "attendance:read", "project:read", "finance:read"],
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  const selectOrganization = useCallback(
    (orgId: string) => {
      const selected = organizations.find((o) => o.id === orgId) || null;
      setCurrentOrganization(selected);
      if (selected) {
        setMembership((prev) =>
          prev
            ? {
                ...prev,
                organizationId: selected.id,
                organization: selected,
              }
            : null
        );
      }
    },
    [organizations]
  );

  return {
    organizations,
    currentOrganization,
    membership,
    selectOrganization,
    setOrganizations,
  };
}
