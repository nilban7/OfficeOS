import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import InternshipDetailPage from "@/app/(protected)/internships/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { InternshipDetail } from "@/types/internship";
import type { Organization } from "@/types/organization";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "int-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

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

describe("InternshipDetailPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockInternship: InternshipDetail = {
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
    description: "Full-stack development internship",
    notes: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    supervisor: null,
    supervisors_count: 1,
    reviews_count: 1,
    supervisors: [
      {
        id: "sup-1",
        organization_id: "org-uuid-1",
        internship_id: "int-1",
        employee_id: "emp-1",
        role: "primary",
        created_at: "2025-01-01T00:00:00Z",
        employee: {
          id: "emp-1",
          employee_code: "EMP-001",
          first_name: "Jane",
          last_name: "Manager",
          designation: "Engineering Lead",
        },
      },
    ],
    reviews: [
      {
        id: "rev-1",
        organization_id: "org-uuid-1",
        internship_id: "int-1",
        reviewer_id: "emp-1",
        review_date: "2025-07-15",
        rating: 4,
        feedback: "Making great progress on assigned tasks.",
        status: "submitted",
        created_at: "2025-07-15T10:00:00Z",
        updated_at: "2025-07-15T10:00:00Z",
        reviewer: {
          id: "emp-1",
          employee_code: "EMP-001",
          first_name: "Jane",
          last_name: "Manager",
        },
        internship: null,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "internships.view",
        "internships.manage",
        "internships.review",
      ],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockResolvedValue({ data: mockInternship } as any);
  });

  it("renders internship detail with title, status, and intern name", async () => {
    render(<InternshipDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Software Dev Internship")).toBeInTheDocument();
    });

    expect(screen.getByText("INT-001 · Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows overview tab with intern details", async () => {
    render(<InternshipDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Intern Details")).toBeInTheDocument();
    });

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("alice@uni.edu")).toBeInTheDocument();
    expect(screen.getByText("State University")).toBeInTheDocument();
  });

  it("renders lifecycle action buttons for active internship", async () => {
    render(<InternshipDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });

    expect(screen.getByText("Terminate")).toBeInTheDocument();
  });

  it("shows supervisors tab with supervisor count badge", async () => {
    render(<InternshipDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /supervisors/i })).toBeInTheDocument();
    });

    // supervisors count badge
    expect(screen.getByRole("button", { name: /supervisors/i })).toHaveTextContent("1");
  });
});
