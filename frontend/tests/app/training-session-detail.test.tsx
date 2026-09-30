import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TrainingSessionDetailPage from "@/app/(protected)/training/sessions/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { TrainingSessionDetail } from "@/types/training";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "sess-1" }),
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

describe("TrainingSessionDetailPage Component", () => {
  const mockSession: TrainingSessionDetail = {
    id: "sess-1",
    organization_id: "org-1",
    training_program_id: "prog-1",
    session_number: "SES-SEC-01",
    title: "Security Bootcamp Session 1",
    session_date: "2025-06-15",
    start_time: "09:00",
    end_time: "17:00",
    location: "Main Auditorium",
    trainer: "Alex Rivers",
    capacity: 40,
    status: "scheduled",
    enrolled_count: 2,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    training_program: {
      id: "prog-1",
      title: "Security Bootcamp",
      code: "TRN-SEC-001",
      delivery_mode: "in_person",
      status: "published",
    },
    enrollments: [
      {
        id: "enr-1",
        organization_id: "org-1",
        training_program_id: "prog-1",
        training_session_id: "sess-1",
        employee_id: "emp-1",
        enrollment_date: "2025-06-01",
        status: "enrolled",
        score: null,
        result: null,
        certificate_number: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        employee: {
          id: "emp-1",
          employee_code: "EMP-101",
          first_name: "Bruce",
          last_name: "Wayne",
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: { id: "org-1", name: "Test Org", slug: "test-org" },
      permissions: ["training.view", "training.manage", "training.update"],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/training-sessions/sess-1")) {
        return Promise.resolve({ data: mockSession }) as any;
      }
      return Promise.resolve({ data: { items: [] } }) as any;
    });
  });

  it("renders training session details and attendees correctly", async () => {
    render(<TrainingSessionDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/SES-SEC-01: Security Bootcamp Session 1/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Main Auditorium")).toBeInTheDocument();
    expect(screen.getByText("Bruce Wayne (EMP-101)")).toBeInTheDocument();
  });
});
