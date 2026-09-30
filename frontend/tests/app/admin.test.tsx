import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SaaSAdminOverviewPage from "@/app/(protected)/admin/page";
import SaaSAdminHealthPage from "@/app/(protected)/admin/health/page";
import SaaSAdminSettingsPage from "@/app/(protected)/admin/settings/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { PlatformOverviewResponse, PlatformHealthResponse, PlatformConfiguration } from "@/types/saas";

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin",
  useParams: () => ({}),
}));

describe("SaaS Administration - Overview, Health, and Settings", () => {
  const mockSysAdminContext = {
    currentOrganization: { id: "org-1", name: "System Admin Org", slug: "sys-admin" },
    membership: null,
    organizations: [],
    permissions: ["saas.view", "saas.manage"],
    userRole: "system_admin",
    isLoading: false,
    error: null,
    selectOrganization: vi.fn(),
    refetchOrganizations: vi.fn(),
    switchOrganization: vi.fn(),
  };

  const mockNonAdminContext = {
    currentOrganization: { id: "org-2", name: "Acme Corp", slug: "acme" },
    membership: null,
    organizations: [],
    permissions: ["employees.view"],
    userRole: "employee",
    isLoading: false,
    error: null,
    selectOrganization: vi.fn(),
    refetchOrganizations: vi.fn(),
    switchOrganization: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("SaaSAdminOverviewPage", () => {
    it("renders forbidden state when non-system-admin accesses overview", async () => {
      vi.mocked(useOrganization).mockReturnValue(mockNonAdminContext as any);

      render(<SaaSAdminOverviewPage />);

      expect(screen.getByText("Access Forbidden")).toBeInTheDocument();
      expect(screen.getByText(/Platform Administration is strictly restricted/i)).toBeInTheDocument();
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it("renders overview dashboard and telemetry KPIs for system_admin", async () => {
      vi.mocked(useOrganization).mockReturnValue(mockSysAdminContext as any);

      const mockOverview: PlatformOverviewResponse = {
        total_organizations: 12,
        active_organizations: 11,
        suspended_organizations: 1,
        total_users: 145,
        total_employees: 98,
        recent_organizations: [
          {
            id: "org-recent-1",
            name: "Recent Tech",
            slug: "recent-tech",
            status: "active",
            is_active: true,
            branch_count: 2,
            member_count: 5,
            employee_count: 4,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        system_status: "healthy",
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockOverview as any);

      render(<SaaSAdminOverviewPage />);

      await waitFor(() => {
        expect(screen.getByText("Total Organizations")).toBeInTheDocument();
        expect(screen.getByText("12")).toBeInTheDocument();
        expect(screen.getByText(/11 active/i)).toBeInTheDocument();
        expect(screen.getByText(/1 suspended/i)).toBeInTheDocument();
        expect(screen.getByText("Recent Tech")).toBeInTheDocument();
      });
    });
  });

  describe("SaaSAdminHealthPage", () => {
    it("renders health telemetry probe and DB latency", async () => {
      vi.mocked(useOrganization).mockReturnValue(mockSysAdminContext as any);

      const mockHealth: PlatformHealthResponse = {
        status: "healthy",
        database_connected: true,
        database_latency_ms: 18.45,
        migration_head: "0020_saas_administration_module",
        app_version: "1.0.0",
        environment: "production",
        active_organizations: 11,
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockHealth as any);

      render(<SaaSAdminHealthPage />);

      await waitFor(() => {
        expect(screen.getByText("Platform & Fleet Health")).toBeInTheDocument();
        expect(screen.getByText("Connected")).toBeInTheDocument();
        expect(screen.getByText(/18.45 ms/i)).toBeInTheDocument();
        expect(screen.getByText("0020_saas_administration_module")).toBeInTheDocument();
      });
    });
  });

  describe("SaaSAdminSettingsPage", () => {
    it("renders settings and saves configuration updates", async () => {
      vi.mocked(useOrganization).mockReturnValue(mockSysAdminContext as any);

      const mockConfig: PlatformConfiguration = {
        id: "cfg-1",
        platform_name: "OfficeOS Enterprise",
        support_email: "support@officeos.com",
        maintenance_mode: false,
        allowed_signup_domains: ["acme.com"],
        max_organizations: 500,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockConfig as any);
      vi.mocked(apiClient.patch).mockResolvedValueOnce({
        ...mockConfig,
        platform_name: "OfficeOS Global",
      } as any);

      render(<SaaSAdminSettingsPage />);

      await waitFor(() => {
        expect(screen.getByDisplayValue("OfficeOS Enterprise")).toBeInTheDocument();
        expect(screen.getByDisplayValue("support@officeos.com")).toBeInTheDocument();
      });

      const user = userEvent.setup();
      const nameInput = screen.getByDisplayValue("OfficeOS Enterprise");
      await user.clear(nameInput);
      await user.type(nameInput, "OfficeOS Global");

      const saveBtn = screen.getByRole("button", { name: /Save Platform Settings/i });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(apiClient.patch).toHaveBeenCalledWith(
          expect.stringContaining("/admin/config"),
          expect.objectContaining({
            platform_name: "OfficeOS Global",
          })
        );
      });
    });
  });

  describe("SaaSAdminAnnouncementsPage", () => {
    it("renders announcements and publishes a new platform notice", async () => {
      vi.mocked(useOrganization).mockReturnValue(mockSysAdminContext as any);

      const mockAnnouncements = [
        {
          id: "ann-1",
          title: "System Maintenance Tonight",
          content: "We will undergo planned maintenance from 2 AM to 4 AM UTC.",
          severity: "warning",
          is_active: true,
          target_type: "all",
          target_org_ids: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockAnnouncements as any);
      vi.mocked(apiClient.post).mockResolvedValueOnce({ status: "success" } as any);

      const { default: SaaSAdminAnnouncementsPage } = await import(
        "@/app/(protected)/admin/announcements/page"
      );
      render(<SaaSAdminAnnouncementsPage />);

      await waitFor(() => {
        expect(screen.getByText("System Maintenance Tonight")).toBeInTheDocument();
        expect(screen.getByText(/We will undergo planned maintenance/i)).toBeInTheDocument();
      });

      const user = userEvent.setup();
      const createBtn = screen.getByRole("button", { name: /Create Announcement/i });
      await user.click(createBtn);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Scheduled Maintenance Window/i)).toBeInTheDocument();
      });

      await user.type(screen.getByPlaceholderText(/Scheduled Maintenance Window/i), "Security Update");
      await user.type(screen.getByPlaceholderText(/Write the full announcement text/i), "Immediate security update applied.");

      const publishBtn = screen.getByRole("button", { name: /Publish Notice/i });
      await user.click(publishBtn);

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          expect.stringContaining("/admin/announcements"),
          expect.objectContaining({
            title: "Security Update",
            content: "Immediate security update applied.",
          })
        );
      });
    });
  });

  describe("SaaSAdminAuditLogsPage", () => {
    it("renders cross-tenant platform audit trail with filters", async () => {
      vi.mocked(useOrganization).mockReturnValue(mockSysAdminContext as any);

      const mockAuditLogs = {
        items: [
          {
            id: "evt-1",
            organization_id: "org-1",
            organization_name: "Alpha Corp",
            actor_name: "Admin User",
            actor_email: "admin@alpha.com",
            action: "suspend",
            entity_type: "organization",
            entity_id: "org-1",
            details: { reason: "Terms violation" },
            created_at: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockAuditLogs as any);

      const { default: SaaSAdminAuditLogsPage } = await import(
        "@/app/(protected)/admin/audit-logs/page"
      );
      render(<SaaSAdminAuditLogsPage />);

      await waitFor(() => {
        expect(screen.getByText("Cross-Tenant Platform Audit")).toBeInTheDocument();
        expect(screen.getByText("Alpha Corp")).toBeInTheDocument();
        expect(screen.getByText("Admin User")).toBeInTheDocument();
        expect(screen.getByText("suspend")).toBeInTheDocument();
      });
    });
  });
});
