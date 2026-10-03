import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuditLogsPage from "@/app/(protected)/audit-logs/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { AuditLog } from "@/types/audit";
import type { Organization } from "@/types/organization";

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

describe("AuditLogsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockLogs: AuditLog[] = [
    {
      id: "log-1",
      organization_id: "org-uuid-1",
      actor_id: "user-1",
      actor: {
        id: "user-1",
        email: "alice@acme.com",
        first_name: "Alice",
        last_name: "Smith",
      },
      actor_email: "alice@acme.com",
      action: "documents.create",
      entity_type: "document",
      entity_id: "doc-101",
      details: {
        title: "Master Services Agreement",
        version: 1,
      },
      ip_address: "192.168.1.50",
      created_at: "2025-01-01T12:00:00Z",
    },
    {
      id: "log-2",
      organization_id: "org-uuid-1",
      actor_id: "user-2",
      actor: {
        id: "user-2",
        email: "bob@acme.com",
        first_name: "Bob",
        last_name: "Jones",
      },
      actor_email: "bob@acme.com",
      action: "employees.terminate",
      entity_type: "employee",
      entity_id: "emp-202",
      details: {
        reason: "Contract ended",
      },
      ip_address: "10.0.0.5",
      created_at: "2025-01-02T15:30:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: ["audit_logs.view"],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/audit-logs")) {
        return Promise.resolve({
          data: {
            items: mockLogs,
            meta: { total: 2, page: 1, page_size: 20, total_pages: 1 },
          },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });
  });

  it("renders audit logs table with actor and action data", async () => {
    render(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText("documents.create")).toBeInTheDocument();
      expect(screen.getByText("employees.terminate")).toBeInTheDocument();
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });
  });

  it("shows Access Restricted when user lacks audit_logs.view permission", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: ["employees.view"], // lacks audit_logs.view
      isLoading: false,
    } as any);

    render(<AuditLogsPage />);

    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    expect(
      screen.getByText(/You do not have permission to view organization audit logs/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("documents.create")).not.toBeInTheDocument();
  });

  it("opens inspect modal and displays log details", async () => {
    const user = userEvent.setup();
    render(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText("documents.create")).toBeInTheDocument();
    });

    const inspectButtons = screen.getAllByRole("button", { name: /inspect/i });
    expect(inspectButtons[0]).toBeDefined();
    await user.click(inspectButtons[0]!);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText("Audit Log Record")).toBeInTheDocument();
    expect(within(modal).getByText("alice@acme.com")).toBeInTheDocument();
    expect(within(modal).getByText("192.168.1.50")).toBeInTheDocument();
    expect(within(modal).getByText(/Master Services Agreement/i)).toBeInTheDocument();
  });

  it("shows empty state when no logs match filters", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { items: [], meta: { total: 0, page: 1, page_size: 20, total_pages: 1 } },
    } as any);

    render(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText("No audit logs found")).toBeInTheDocument();
    });
  });

  it("handles error state and provides retry", async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("Server error loading logs"));

    render(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText("Server error loading logs")).toBeInTheDocument();
    });
  });
});
