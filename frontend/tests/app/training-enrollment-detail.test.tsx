import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TrainingEnrollmentDetailPage from "@/app/(protected)/training/enrollments/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { TrainingEnrollmentDetail } from "@/types/training";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "enr-1" }),
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

describe("TrainingEnrollmentDetailPage Component", () => {
  const mockEnrollment: TrainingEnrollmentDetail = {
    id: "enr-1",
    organization_id: "org-1",
    training_program_id: "prog-1",
    training_session_id: "sess-1",
    employee_id: "emp-1",
    enrollment_date: "2025-06-01",
    status: "completed",
    score: 98,
    result: "passed",
    certificate_number: "CERT-SEC-2025-001",
    completion_date: "2025-06-15",
    notes: "Completed all labs with excellence",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    training_program: {
      id: "prog-1",
      title: "Advanced Cyber Defense",
      code: "TRN-CYBER-99",
      delivery_mode: "online",
      status: "published",
    },
    training_session: {
      id: "sess-1",
      session_number: "SES-CYBER-01",
      session_date: "2025-06-15",
      status: "completed",
    },
    employee: {
      id: "emp-1",
      employee_code: "EMP-999",
      first_name: "Diana",
      last_name: "Prince",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: { id: "org-1", name: "Test Org", slug: "test-org" },
      permissions: ["training.view", "training.manage", "training.complete"],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/training-enrollments/enr-1")) {
        return Promise.resolve({ data: mockEnrollment }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });
  });

  it("renders training enrollment and certification details correctly", async () => {
    render(<TrainingEnrollmentDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Diana Prince")).toBeInTheDocument();
    });

    expect(screen.getByText("Advanced Cyber Defense")).toBeInTheDocument();
    expect(screen.getByText("98%")).toBeInTheDocument();
    expect(screen.getByText("CERT-SEC-2025-001")).toBeInTheDocument();
  });
});
