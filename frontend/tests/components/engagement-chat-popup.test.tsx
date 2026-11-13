import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EngagementChatPopup } from "@/components/engagements/engagement-chat-popup";
import { apiClient } from "@/lib/api/client";
import type { ClientEngagementDetail } from "@/types/engagement";

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 1; // WebSocket.OPEN
  send = vi.fn();
  close = vi.fn();
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 10);
  }
}

// @ts-expect-error Mocking WebSocket in node/jsdom environment
global.WebSocket = MockWebSocket;

let mockUser = { id: "00000000-0000-0000-0000-000000000001", email: "osofficesupport@gmail.com" };
let mockMembership: any = { id: "mem-1", role: "owner" };

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: () => ({
    currentOrganization: { id: "org-test-123", name: "Acme Corp" },
    membership: mockMembership,
    permissions: ["engagements.view"],
  }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: true,
  }),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("EngagementChatPopup Component - Two Separate Windows", () => {
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
    proposals: [],
    agreements: [],
    weekly_reports: [],
    uat_sessions: [],
    issues: [],
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

  const mockClientMessages = [
    {
      id: "msg-client-1",
      organization_id: "org-test-123",
      engagement_id: "eng-100",
      project_id: "proj-1",
      sender_name: "Dr. Smith",
      sender_role: "Chief Information Officer",
      sender_type: "client",
      channel: "general",
      visibility: "client",
      message: "Client update: SOW approved and milestones acknowledged.",
      created_at: "2026-10-20T10:00:00Z",
    },
  ];

  const mockInternalMessages = [
    {
      id: "msg-team-1",
      organization_id: "org-test-123",
      engagement_id: "eng-100",
      project_id: "proj-1",
      sender_name: "Aritra Das",
      sender_role: "Lead Engineer",
      sender_type: "member",
      channel: "general",
      visibility: "internal",
      message: "Internal team only: Backend deployment planned for 11 PM tonight.",
      created_at: "2026-10-20T11:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: "00000000-0000-0000-0000-000000000001", email: "osofficesupport@gmail.com" };
    mockMembership = { id: "mem-1", role: "owner" };
    MockWebSocket.instances = [];

    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/chat-participants")) {
        return Promise.resolve(mockParticipants);
      }
      if (url.includes("/messages")) {
        if (url.includes("conversation=internal")) {
          return Promise.resolve(mockInternalMessages);
        }
        return Promise.resolve(mockClientMessages);
      }
      return Promise.resolve([]);
    });

    (apiClient.post as unknown as ReturnType<typeof vi.fn>).mockImplementation((url: string, body?: any) => {
      if (url.includes("/ws-ticket")) {
        const isInternal = url.includes("conversation=internal");
        return Promise.resolve({
          ticket: isInternal ? "ticket-internal-xyz" : "ticket-client-abc",
          expires_in: 60,
          engagement_id: "eng-100",
          conversation: isInternal ? "internal" : "client",
        });
      }
      return Promise.resolve({
        id: "msg-created-rest",
        organization_id: "org-test-123",
        engagement_id: "eng-100",
        sender_name: body?.sender_name || "Aritra Das",
        sender_role: body?.sender_role || "Lead Engineer",
        sender_type: body?.sender_type || "member",
        channel: "general",
        visibility: body?.visibility || "client",
        message: body?.message || "Rest sent message",
        client_msg_id: body?.client_msg_id,
        created_at: new Date().toISOString(),
      });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the floating chat trigger button", () => {
    render(<EngagementChatPopup engagement={mockEngagement} />);
    const trigger = screen.getByRole("button", { name: /open project & client chat window/i });
    expect(trigger).toBeInTheDocument();
  });

  it("opens the chatting window with two toggleable tabs: Client Chat and Team Chat", async () => {
    render(<EngagementChatPopup engagement={mockEngagement} initialOpen={true} />);

    await waitFor(() => {
      expect(screen.getByTitle(/Client Chat - Visible to project team/i)).toBeInTheDocument();
      expect(screen.getByTitle(/Team Chat - Exclusively for internal project team/i)).toBeInTheDocument();
    });

    // Default active tab is Client Chat
    expect(
      screen.getByText("Client update: SOW approved and milestones acknowledged.")
    ).toBeInTheDocument();

    // Verify visibility toggle button is NOT rendered
    expect(screen.queryByText(/Client & Team Visible/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Internal Team Only/i)).not.toBeInTheDocument();
  });

  it("switches to Team Chat tab and loads internal messages independently", async () => {
    const user = userEvent.setup();
    render(<EngagementChatPopup engagement={mockEngagement} initialOpen={true} />);

    await waitFor(() => {
      expect(screen.getByTitle(/Team Chat - Exclusively for internal project team/i)).toBeInTheDocument();
    });

    const teamTab = screen.getByTitle(/Team Chat - Exclusively for internal project team/i);
    await user.click(teamTab);

    await waitFor(() => {
      expect(
        screen.getByText("Internal team only: Backend deployment planned for 11 PM tonight.")
      ).toBeInTheDocument();
    });

    // Verify Client Chat messages are not shown in Team Chat
    expect(
      screen.queryByText("Client update: SOW approved and milestones acknowledged.")
    ).not.toBeInTheDocument();
  });

  it("hides Team Chat tab when switched to Client Contact perspective in testing account", async () => {
    const user = userEvent.setup();
    render(<EngagementChatPopup engagement={mockEngagement} initialOpen={true} />);

    await waitFor(() => {
      expect(screen.getByTitle(/Team Chat - Exclusively for internal project team/i)).toBeInTheDocument();
      expect(screen.getByTitle(/Test as Client Contact/i)).toBeInTheDocument();
    });

    const clientPerspectiveBtn = screen.getByTitle(/Test as Client Contact/i);
    await user.click(clientPerspectiveBtn);

    // In Client Contact perspective, Team Chat tab must be hidden
    await waitFor(() => {
      expect(screen.queryByTitle(/Team Chat - Exclusively for internal project team/i)).not.toBeInTheDocument();
    });
  });

  it("sends message over WebSocket to the active conversation tab", async () => {
    const user = userEvent.setup();
    render(<EngagementChatPopup engagement={mockEngagement} initialOpen={true} />);

    // Wait until WebSocket is connected (Live)
    await waitFor(() => {
      expect(screen.getByTitle("WebSocket connected (real-time active)")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Type message to client & team/i);
    await user.type(input, "Checking in on milestone deliveries");

    const sendBtn = screen.getByTitle(/Send message/i);
    await user.click(sendBtn);

    const activeWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(activeWs).toBeDefined();
    if (activeWs) {
      expect(activeWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"visibility":"client"')
      );
    }
  });

  it("receives real-time broadcast message over WebSocket into active conversation without refresh", async () => {
    render(<EngagementChatPopup engagement={mockEngagement} initialOpen={true} />);

    await waitFor(() => {
      expect(screen.getByTitle("WebSocket connected (real-time active)")).toBeInTheDocument();
    });

    const activeWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(activeWs).toBeDefined();

    const incomingBroadcast = {
      type: "chat_message",
      data: {
        id: "broadcast-msg-client-999",
        organization_id: "org-test-123",
        engagement_id: "eng-100",
        sender_name: "Dr. Smith",
        sender_role: "Chief Information Officer",
        sender_type: "client",
        channel: "general",
        visibility: "client",
        message: "Real-time client broadcast: Milestone accepted.",
        client_msg_id: "client-token-999",
        created_at: new Date().toISOString(),
      },
    };

    act(() => {
      activeWs?.onmessage?.({ data: JSON.stringify(incomingBroadcast) });
    });

    await waitFor(() => {
      expect(screen.getByText("Real-time client broadcast: Milestone accepted.")).toBeInTheDocument();
    });
  });
});
