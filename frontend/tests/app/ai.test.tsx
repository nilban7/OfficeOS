import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIAssistantPage from "@/app/(protected)/ai/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization } from "@/types/organization";
import type {
  AIConfiguration,
  AIConversation,
  AIConversationDetail,
} from "@/types/ai";

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

describe("AIAssistantPage Component", () => {
  const mockOrg: Organization = {
    id: "org-123",
    name: "Acme Corp",
    slug: "acme-corp",
  };

  const mockConfig: AIConfiguration = {
    id: "cfg-1",
    organization_id: "org-123",
    is_enabled: true,
    provider: "system_gemini",
    model_name: "gemini-1.5-flash",
    temperature: "0.70",
    max_tokens_per_response: 2048,
    allowed_capabilities: ["workforce", "attendance", "leave"],
    daily_request_limit: 1000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockConv: AIConversation = {
    id: "conv-1",
    organization_id: "org-123",
    user_id: "user-1",
    title: "Headcount Strategy",
    is_archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    message_count: 2,
    last_message: "Here is your headcount breakdown.",
  };

  const mockDetail: AIConversationDetail = {
    ...mockConv,
    messages: [
      {
        id: "msg-1",
        conversation_id: "conv-1",
        sender_role: "user",
        content: "What is our current headcount?",
        tokens_used: 6,
        metadata: {},
        created_at: new Date().toISOString(),
      },
      {
        id: "msg-2",
        conversation_id: "conv-1",
        sender_role: "assistant",
        content: "You have 42 active employees across 4 departments.",
        tokens_used: 10,
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders AI Assistant interface and displays existing conversation", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["ai.view", "ai.use"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/ai/configuration")) {
        return Promise.resolve(mockConfig) as any;
      }
      if (url.includes("/ai/conversations/conv-1")) {
        return Promise.resolve(mockDetail) as any;
      }
      if (url.includes("/ai/conversations")) {
        return Promise.resolve([mockConv]) as any;
      }
      return Promise.resolve(null) as any;
    });

    render(<AIAssistantPage />);

    expect(screen.getByText("OfficeOS AI Assistant")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Headcount Strategy")[0]).toBeInTheDocument();
      expect(screen.getByText("What is our current headcount?")).toBeInTheDocument();
      expect(screen.getByText("You have 42 active employees across 4 departments.")).toBeInTheDocument();
    });
  });

  it("sends a message and renders the updated assistant response", async () => {
    const user = userEvent.setup();

    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      membership: null,
      organizations: [mockOrg],
      permissions: ["ai.view", "ai.use"],
      isLoading: false,
      error: null,
      selectOrganization: vi.fn(),
      setOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/ai/configuration")) return Promise.resolve(mockConfig) as any;
      if (url.includes("/ai/conversations/conv-1")) return Promise.resolve(mockDetail) as any;
      if (url.includes("/ai/conversations")) return Promise.resolve([mockConv]) as any;
      return Promise.resolve(null) as any;
    });

    const updatedDetail: AIConversationDetail = {
      ...mockDetail,
      messages: [
        ...mockDetail.messages,
        {
          id: "msg-3",
          conversation_id: "conv-1",
          sender_role: "user",
          content: "Show engineering department count",
          tokens_used: 4,
          metadata: {},
          created_at: new Date().toISOString(),
        },
        {
          id: "msg-4",
          conversation_id: "conv-1",
          sender_role: "assistant",
          content: "Engineering has 18 active team members.",
          tokens_used: 7,
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ],
    };

    vi.mocked(apiClient.post).mockResolvedValueOnce(updatedDetail as any);

    render(<AIAssistantPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Headcount Strategy")[0]).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Ask OfficeOS Assistant...");
    await user.type(input, "Show engineering department count");

    const sendBtn = screen.getByRole("button", { name: /Send/i });
    await user.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText("Engineering has 18 active team members.")).toBeInTheDocument();
    });
  });

  it("renders Access Restricted view when user lacks ai.view", () => {
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

    render(<AIAssistantPage />);

    expect(screen.getByText("Access Restricted")).toBeInTheDocument();
    expect(screen.getByText(/You do not have permission to access the OfficeOS AI Assistant/i)).toBeInTheDocument();
  });
});
