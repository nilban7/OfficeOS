import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminKiosksManagementPage from "@/app/(protected)/admin/kiosks/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/kiosks",
  useParams: () => ({}),
}));

describe("AdminKiosksManagementPage Component", () => {
  const mockOrgContext = {
    currentOrganization: { id: "org-1", name: "Acme Corp", slug: "acme" },
    membership: { role: "owner" },
    organizations: [],
    permissions: ["saas.view", "organizations.settings_manage"],
    userRole: "owner",
    isLoading: false,
    error: null,
    selectOrganization: vi.fn(),
    refetchOrganizations: vi.fn(),
    switchOrganization: vi.fn(),
  };

  const mockKiosks = [
    {
      id: "kiosk-1",
      organization_id: "org-1",
      name: "Main Lobby Tablet",
      device_identifier: "DEV-1001",
      device_model: "Samsung Galaxy Tab",
      ip_address: "192.168.1.50",
      battery_level: 95,
      is_charging: true,
      is_active: true,
      last_heartbeat_at: new Date().toISOString(),
      allowed_modes: ["pin", "face", "qr"],
      created_at: new Date().toISOString(),
    },
  ];

  const mockCodes = [
    {
      id: "code-1",
      organization_id: "org-1",
      code: "OS-8492-71",
      is_used: false,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
    },
  ];

  const mockPunches = [
    {
      id: "punch-1",
      employee_id: "emp-1",
      employee_name: "Jane Doe",
      employee_code: "EMP-001",
      punch_type: "in",
      timestamp: new Date().toISOString(),
      verification_method: "face",
      kiosk_device_name: "Main Lobby Tablet",
      client_ip: "192.168.1.50",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useOrganization as unknown as { mockReturnValue: (val: unknown) => void }).mockReturnValue(
      mockOrgContext
    );
    (apiClient.get as unknown as { mockImplementation: (fn: (url: string) => Promise<unknown>) => void }).mockImplementation(
      async (url: string) => {
        if (url.includes("activation-codes")) return { data: mockCodes };
        if (url.includes("punches")) return { data: mockPunches };
        return { data: mockKiosks };
      }
    );
  });

  it("renders page header and metric cards properly", async () => {
    render(<AdminKiosksManagementPage />);

    expect(screen.getByText("Attendance Kiosks Management")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Main Lobby Tablet")).toBeDefined();
      expect(screen.getByText("DEV-1001")).toBeDefined();
    });
  });

  it("switches to Secret Activation Codes tab and shows generated code", async () => {
    const user = userEvent.setup();
    render(<AdminKiosksManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Main Lobby Tablet")).toBeDefined();
    });

    const codesTab = screen.getByText(/Secret Activation Codes/);
    await user.click(codesTab);

    expect(screen.getByText("OS-8492-71")).toBeDefined();
  });

  it("switches to Live Punch Audit Feed and displays audit records", async () => {
    const user = userEvent.setup();
    render(<AdminKiosksManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Main Lobby Tablet")).toBeDefined();
    });

    const punchesTab = screen.getByText(/Live Punch Audit Feed/);
    await user.click(punchesTab);

    expect(screen.getByText("Jane Doe")).toBeDefined();
    expect(screen.getByText("EMP-001")).toBeDefined();
  });
});
