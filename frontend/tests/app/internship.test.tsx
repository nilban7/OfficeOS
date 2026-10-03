import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InternshipsPage from "@/app/(protected)/internships/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Internship } from "@/types/internship";
import type { Organization } from "@/types/organization";

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("InternshipsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockInternships: Internship[] = [
    {
      id: "int-1",
      organization_id: "org-uuid-1",
      employee_id: null,
      department_id: null,
      supervisor_id: null,
      title: "Software Dev Internship",
      code: "INT-001",
      intern_name: "Alice Smith",
      intern_email: "alice@uni.edu",
      institution: "State University",
      start_date: "2025-06-01",
      end_date: "2025-08-31",
      status: "active",
      stipend: "500.00",
      description: null,
      notes: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      supervisor: null,
      supervisors_count: 1,
      reviews_count: 2,
    },
    {
      id: "int-2",
      organization_id: "org-uuid-1",
      employee_id: null,
      department_id: null,
      supervisor_id: null,
      title: "QA Testing Internship",
      code: "INT-002",
      intern_name: "Bob Jones",
      intern_email: null,
      institution: "Tech College",
      start_date: "2025-07-01",
      end_date: "2025-09-30",
      status: "planned",
      stipend: "400.00",
      description: null,
      notes: null,
      created_at: "2025-01-02T00:00:00Z",
      updated_at: "2025-01-02T00:00:00Z",
      supervisor: null,
      supervisors_count: 0,
      reviews_count: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "internships.view",
        "internships.create",
        "internships.update",
        "internships.delete",
        "internships.manage",
        "internships.review",
      ],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/internships")) {
        return Promise.resolve({
          data: { items: mockInternships, total: 2, page: 1, page_size: 20, total_pages: 1 },
        }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });
  });

  it("renders internships list with correct data", async () => {
    render(<InternshipsPage />);

    await waitFor(() => {
      expect(screen.getByText("Software Dev Internship")).toBeInTheDocument();
    });

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("INT-001")).toBeInTheDocument();
    expect(screen.getByText("State University")).toBeInTheDocument();
    expect(screen.getByText("QA Testing Internship")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  it("shows empty state when no internships", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20, total_pages: 1 },
    } as any);

    render(<InternshipsPage />);

    await waitFor(() => {
      expect(screen.getByText("No internships found")).toBeInTheDocument();
    });
  });

  it("shows access denied when missing internships.view permission", async () => {
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [],
      isLoading: false,
    } as any);

    render(<InternshipsPage />);

    await waitFor(() => {
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
    });
  });

  it("opens create internship modal when button is clicked", async () => {
    const user = userEvent.setup();
    render(<InternshipsPage />);

    await waitFor(() => {
      expect(screen.getByText("New Internship")).toBeInTheDocument();
    });

    await user.click(screen.getByText("New Internship"));
    expect(screen.getByText("New Internship", { selector: "[role='dialog'] *" })).toBeInTheDocument();
  });

  it("displays status badge for each internship", async () => {
    render(<InternshipsPage />);

    await waitFor(() => {
      expect(screen.getByText("Active", { selector: "span" })).toBeInTheDocument();
    });

    expect(screen.getByText("Planned", { selector: "span" })).toBeInTheDocument();
  });

  it("shows page header with internships title", async () => {
    render(<InternshipsPage />);

    await waitFor(() => {
      expect(screen.getByText("Internships")).toBeInTheDocument();
    });

    expect(screen.getByText("Manage internship programs and intern reviews")).toBeInTheDocument();
  });
});
