import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AutomationsPage from "@/app/(protected)/automations/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization } from "@/types/organization";
import type {
  Automation,
  AutomationExecution,
} from "@/types/automation";

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

describe("AutomationsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-123",
    name: "Acme Corp",
    slug: "acme-corp",
  };

  const mockAutomation: Automation = {
    id: "auto-1",
    organization_id: "org-123",
    name: "Notify on Leave Approval",
    description: "Sends in-app alert when leave is approved",
    is_active: true,
    trigger_type: "event",
    trigger_config: { event_name: "leave.approved" },
    action_type: "notification",
    action_config: { title: "Leave Approved" },
    created_by_id: "user-1",
    last_run_at: new Date().toISOString(),
    last_run_status: "success",
    next_run_at: null,
    run_count: 5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockExecution: AutomationExecution = {
    id: "exec-1",
    organization_id: "org-123",
    automation_id: "auto-1",
    triggered_by_id: "user-1",
    trigger_source: "manual",
    status: "success",
    execution_payload: {},
    result_summary: "Dispatched notification successfully.",
    error_message: null,
    duration_ms: 32,
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders automations dashboard and displays configured workflows", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["automations.view", "automations.create", "automations.execute"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockResolvedValueOnce([mockAutomation] as any);

    render(<AutomationsPage />);

    expect(screen.getByText("Automation Workflows")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Notify on Leave Approval")).toBeInTheDocument();
      expect(screen.getByText("Sends in-app alert when leave is approved")).toBeInTheDocument();
      expect(screen.getByText("event")).toBeInTheDocument();
      expect(screen.getByText("notification")).toBeInTheDocument();
    });
  });

  it("opens create modal and successfully submits a new workflow", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["automations.view", "automations.create"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockResolvedValueOnce([mockAutomation] as any);

    const newAuto: Automation = {
      ...mockAutomation,
      id: "auto-2",
      name: "Daily Operations Review",
      description: "Generates morning operational review tasks",
      trigger_type: "schedule",
      action_type: "task_create",
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(newAuto as any);

    render(<AutomationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Notify on Leave Approval")).toBeInTheDocument();
    });

    const createBtn = screen.getByRole("button", { name: /Create Automation/i });
    await user.click(createBtn);

    expect(screen.getByText("Create Automation Workflow")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/e\.g\. Notify on Leave Approval/i);
    await user.type(nameInput, "Daily Operations Review");

    const submitBtn = screen.getByRole("button", { name: /Create Workflow/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Daily Operations Review")).toBeInTheDocument();
      expect(screen.getByText("Automation workflow created successfully.")).toBeInTheDocument();
    });
  });

  it("manually triggers execution and displays execution success feedback", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["automations.view", "automations.execute"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockResolvedValueOnce([mockAutomation] as any);
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockExecution as any);

    render(<AutomationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Notify on Leave Approval")).toBeInTheDocument();
    });

    const runBtn = screen.getByRole("button", { name: /Run/i });
    await user.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Execution success: Dispatched notification successfully/i)).toBeInTheDocument();
    });
  });

  it("renders Access Restricted view when user lacks automations.view", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: [],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    render(<AutomationsPage />);

    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    expect(screen.getByText(/You do not have permission to view or manage organizational automation workflows/i)).toBeInTheDocument();
  });
});
