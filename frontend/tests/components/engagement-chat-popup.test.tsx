import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EngagementChatPopup } from "@/components/engagements/engagement-chat-popup";
import { apiClient } from "@/lib/api/client";
import type { ClientEngagementDetail } from "@/types/engagement";

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: () => ({
    currentOrganization: { id: "org-test-123", name: "Acme Corp" },
    permissions: ["engagements.view"],
  }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", fullName: "Niladri Banerjee", email: "officeos@gmail.com" },
  }),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/client", () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockImplementation((cb) => {
      if (typeof cb === "function") cb("SUBSCRIBED");
      return mockChannel;
    }),
    send: vi.fn().mockResolvedValue("ok"),
    unsubscribe: vi.fn(),
  };

  return {
    getSupabaseBrowserClient: () => ({
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn(),
    }),
  };
});

describe("EngagementChatPopup Component", () => {
  const mockEngagement: ClientEngagementDetail = {
    id: "eng-100",
    engagement_code: "ENG-0001",
    title: "Healthcare SaaS Platform",
    client_id: "client-1",
    client_name: "Apex Healthcare",
    project_id: "proj-1",
    current_stage: "delivery",
    delivery_health: "on_track",
    progress_percentage: 65,
    contract_value: 120000,
    currency: "INR",
    created_at: "2026-10-01T00:00:00Z",
    invoiced_amount: 50000,
    collected_amount: 40000,
    proposals: [
      {
        id: "prop-1",
        organization_id: "org-test-123",
        engagement_id: "eng-100",
        proposal_number: "PRP-0001",
        title: "Sprint Delivery & SOW",
        version: 1,
        status: "accepted",
        total_amount: 120000,
        currency: "INR",
        created_at: "2026-10-02T00:00:00Z",
      },
    ],
    agreements: [],
    weekly_reports: [],
    uat_sessions: [],
    issues: [
      {
        id: "issue-1",
        engagement_id: "eng-100",
        issue_number: "ISS-0001",
        title: "Auth Token Expiration Delay",
        description: "Need shorter refresh window",
        issue_type: "clarification",
        priority: "medium",
        status: "open",
        reported_by_name: "Dr. Smith",
        created_at: "2026-10-15T00:00:00Z",
      },
    ],
    change_requests: [],
    handover: null,
  };

  const mockParticipants = {
    project_id: "proj-1",
    project_name: "Healthcare SaaS Project",
    client_id: "client-1",
    client_name: "Apex Healthcare",
    members: [
      {
        id: "emp-1",
        name: "Aritra Das",
        role: "Lead Engineer",
        participant_type: "member",
        email: "aritra@example.com",
      },
      {
        id: "contact-1",
        name: "Dr. Smith",
        role: "Chief Information Officer",
        participant_type: "client",
        email: "smith@apex.com",
      },
    ],
  };

  const mockMessages = [
    {
      id: "msg-1",
      organization_id: "org-test-123",
      engagement_id: "eng-100",
      project_id: "proj-1",
      sender_name: "Aritra Das",
      sender_role: "Lead Engineer",
      sender_type: "member",
      channel: "general",
      message: "Sprint 2 development on track for delivery next Tuesday.",
      created_at: "2026-10-20T10:30:00Z",
    },
    {
      id: "msg-2",
      organization_id: "org-test-123",
      engagement_id: "eng-100",
      project_id: "proj-1",
      sender_name: "Dr. Smith",
      sender_role: "Chief Information Officer",
      sender_type: "client",
      channel: "proposal",
      proposal_title: "Sprint Delivery & SOW",
      message: "We have reviewed proposal deliverables and accepted milestones.",
      created_at: "2026-10-20T11:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/chat-participants")) {
        return Promise.resolve(mockParticipants);
      }
      if (url.includes("/messages")) {
        return Promise.resolve(mockMessages);
      }
      return Promise.resolve([]);
    });
    (apiClient.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "msg-new",
      organization_id: "org-test-123",
      engagement_id: "eng-100",
      project_id: "proj-1",
      sender_name: "Aritra Das",
      sender_role: "Lead Engineer",
      sender_type: "member",
      channel: "general",
      message: "New update sent successfully",
      created_at: new Date().toISOString(),
    });
  });

  it("renders the floating chat trigger button in the bottom right corner", () => {
    render(<EngagementChatPopup engagement={mockEngagement} />);
    const trigger = screen.getByRole("button", { name: /open project & client chat window/i });
    expect(trigger).toBeInTheDocument();
  });

  it("opens the chatting window when clicking the floating symbol", async () => {
    render(<EngagementChatPopup engagement={mockEngagement} />);
    const trigger = screen.getByRole("button", { name: /open project & client chat window/i });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Healthcare SaaS Platform")).toBeInTheDocument();
      expect(screen.getByText(/ENG-0001 • Apex Healthcare/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Sprint 2 development on track/i)).toBeInTheDocument();
    expect(screen.getByText(/We have reviewed proposal deliverables/i)).toBeInTheDocument();
  });

  it("renders channel tabs for proposal discussions and clearing disputes", async () => {
    render(<EngagementChatPopup engagement={mockEngagement} initialOpen={true} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /📋 Proposals/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /⚖️ Disputes/i })).toBeInTheDocument();
    });

    // Click Proposals tab
    fireEvent.click(screen.getByRole("button", { name: /📋 Proposals/i }));
    expect(screen.getByText(/Discuss Proposal:/i)).toBeInTheDocument();

    // Click Disputes tab
    fireEvent.click(screen.getByRole("button", { name: /⚖️ Disputes/i }));
    expect(screen.getByText(/Clear Dispute \/ Issue:/i)).toBeInTheDocument();
  });

  it("toggles the participants list showing project members and client contacts", async () => {
    render(<EngagementChatPopup engagement={mockEngagement} initialOpen={true} />);

    await waitFor(() => {
      expect(screen.getByTitle("View Project Members and Client Contacts")).toBeInTheDocument();
    });

    const participantsBtn = screen.getByTitle("View Project Members and Client Contacts");
    fireEvent.click(participantsBtn);

    await waitFor(() => {
      expect(screen.getByText(/Project Team Members/i)).toBeInTheDocument();
      expect(screen.getAllByText("Aritra Das").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Client Stakeholders/i)).toBeInTheDocument();
      expect(screen.getAllByText("Dr. Smith").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("allows typing and sending a chat message between project members and client", async () => {
    const user = userEvent.setup();
    render(<EngagementChatPopup engagement={mockEngagement} initialOpen={true} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type message to project members/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Type message to project members/i);
    await user.type(input, "Checking in on project status with client");

    const sendBtn = screen.getByTitle("Send message");
    await user.click(sendBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/engagements/eng-100/messages",
        expect.objectContaining({
          message: "Checking in on project status with client",
          channel: "general",
        }),
        expect.anything()
      );
    });
  });

  it("subscribes to Supabase Realtime channel and displays the Live status indicator", async () => {
    render(<EngagementChatPopup engagement={mockEngagement} initialOpen={true} />);

    await waitFor(() => {
      expect(screen.getByText("Live")).toBeInTheDocument();
      expect(screen.getByTitle("Connected to Supabase Live Realtime Database")).toBeInTheDocument();
    });
  });

  it("optimistically renders sent message immediately in the UI without waiting for server response", async () => {
    const user = userEvent.setup();
    // Simulate a slow post response
    (apiClient.post as any).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 5000))
    );

    render(<EngagementChatPopup engagement={mockEngagement} initialOpen={true} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type message to project members/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Type message to project members/i);
    await user.type(input, "Instant optimistic message test!");

    const sendBtn = screen.getByTitle("Send message");
    await user.click(sendBtn);

    // The message should appear immediately on screen even though the API response is still pending
    expect(screen.getByText("Instant optimistic message test!")).toBeInTheDocument();
  });
});

