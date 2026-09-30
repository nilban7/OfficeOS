import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationsPage from "@/app/(protected)/notifications/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Notification, NotificationPreference } from "@/types/notification";
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

describe("NotificationsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockNotifications: Notification[] = [
    {
      id: "notif-1",
      organization_id: "org-uuid-1",
      recipient_id: "user-1",
      notification_type: "task",
      title: "New Task Assigned",
      message: "You have been assigned to Review Security Compliance",
      action_url: "/operations/tasks/task-123",
      read_at: null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "notif-2",
      organization_id: "org-uuid-1",
      recipient_id: "user-1",
      notification_type: "document",
      title: "Document Approved",
      message: "The NDA document has been signed and approved",
      action_url: "/documents/doc-456",
      read_at: "2025-01-01T00:00:00Z",
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockPreferences: NotificationPreference[] = [
    {
      id: "pref-1",
      organization_id: "org-uuid-1",
      recipient_id: "user-1",
      notification_type: "task",
      in_app_enabled: true,
      email_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "pref-2",
      organization_id: "org-uuid-1",
      recipient_id: "user-1",
      notification_type: "finance",
      in_app_enabled: true,
      email_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: ["notifications.view", "notifications.preferences"],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/notifications/unread-count")) {
        return Promise.resolve({
          data: { unread_count: 1 },
        }) as any;
      }
      if (url.includes("/notifications/preferences")) {
        return Promise.resolve({
          data: mockPreferences,
        }) as any;
      }
      if (url.includes("/notifications")) {
        return Promise.resolve({
          data: {
            items: mockNotifications,
            meta: { total_items: 2, page: 1, page_size: 20, total_pages: 1 },
          },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });

    vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as any);
    vi.mocked(apiClient.put).mockResolvedValue({ data: mockPreferences } as any);
  });

  it("renders notifications list and unread count badge", async () => {
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("New Task Assigned")).toBeInTheDocument();
      expect(screen.getByText("Document Approved")).toBeInTheDocument();
      expect(screen.getByText("1 unread")).toBeInTheDocument();
    });
  });

  it("marks a notification as read", async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("New Task Assigned")).toBeInTheDocument();
    });

    const markReadBtn = screen.getByRole("button", { name: /mark read/i });
    await user.click(markReadBtn);

    expect(apiClient.post).toHaveBeenCalledWith("/notifications/notif-1/read");
  });

  it("marks all notifications as read", async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Mark All Read")).toBeInTheDocument();
    });

    const markAllBtn = screen.getByRole("button", { name: /mark all read/i });
    await user.click(markAllBtn);

    expect(apiClient.post).toHaveBeenCalledWith("/notifications/mark-all-read");
  });

  it("archives a notification", async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("New Task Assigned")).toBeInTheDocument();
    });

    const archiveButtons = screen.getAllByRole("button", { name: /archive notification/i });
    expect(archiveButtons[0]).toBeDefined();
    await user.click(archiveButtons[0]!);

    expect(apiClient.post).toHaveBeenCalledWith("/notifications/notif-1/archive");
  });

  it("opens preferences modal and allows updating preferences", async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Preferences")).toBeInTheDocument();
    });

    const prefBtn = screen.getByRole("button", { name: /preferences/i });
    await user.click(prefBtn);

    await waitFor(() => {
      expect(screen.getByText("Notification Preferences")).toBeInTheDocument();
      expect(screen.getByText("Save Preferences")).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole("button", { name: /save preferences/i });
    await user.click(saveBtn);

    expect(apiClient.put).toHaveBeenCalledWith(
      "/notifications/preferences",
      expect.objectContaining({ preferences: expect.any(Array) })
    );
  });

  it("shows empty state when no notifications are returned", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/notifications/unread-count")) {
        return Promise.resolve({ data: { unread_count: 0 } }) as any;
      }
      if (url.includes("/notifications")) {
        return Promise.resolve({
          data: { items: [], meta: { total_items: 0, page: 1, page_size: 20, total_pages: 1 } },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("No notifications found")).toBeInTheDocument();
    });
  });
});
