import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AISettingsPage from "@/app/(protected)/settings/ai/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { AIConfiguration } from "@/types/ai";

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("AISettingsPage Component", () => {
  const mockOrg = {
    id: "org-123",
    name: "Acme Corp",
    slug: "acme-corp",
  };

  const mockConfig: AIConfiguration = {
    id: "cfg-1",
    organization_id: "org-123",
    is_enabled: true,
    provider: "gemini",
    model_name: "gemini-1.5-flash",
    allowed_capabilities: [
      "workforce_summary",
      "attendance_summary",
      "leave_summary",
      "project_summary",
      "procurement_summary",
      "asset_summary",
      "training_summary",
      "finance_summary",
      "audit_summary",
    ],
    temperature: 0.7,
    max_tokens_per_response: 2048,
    daily_request_limit: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders AI settings and updates configuration successfully", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["ai.manage", "ai.view"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockResolvedValueOnce(mockConfig as any);

    const updatedConfig = { ...mockConfig, daily_request_limit: 250 };
    vi.mocked(apiClient.patch).mockResolvedValueOnce(updatedConfig as any);

    render(<AISettingsPage />);

    expect(screen.getByText("AI Assistant Settings")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Gemini 1.5 Flash (Fast & Balanced)")).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole("button", { name: /Save Configuration/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("AI configuration saved successfully.")).toBeInTheDocument();
    });
  });

  it("renders Access Restricted view when user lacks ai.manage", () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["ai.view"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    render(<AISettingsPage />);

    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    expect(
      screen.getByText(/You do not have administrative permission/i)
    ).toBeInTheDocument();
  });
});
