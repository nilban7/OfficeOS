import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TrainingProgramDetailPage from "@/app/(protected)/training/programs/[id]/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { TrainingProgramDetail } from "@/types/training";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "prog-1" }),
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

describe("TrainingProgramDetailPage Component", () => {
  const mockProgram: TrainingProgramDetail = {
    id: "prog-1",
    organization_id: "org-1",
    title: "Kubernetes Mastery",
    code: "TRN-K8S-01",
    description: "Deep dive into production clusters",
    category: "Cloud",
    provider: "Cloud Academy",
    trainer: "Dave Tech",
    delivery_mode: "hybrid",
    duration_hours: 16,
    capacity: 30,
    cost: 499,
    start_date: "2025-05-01",
    end_date: "2025-05-05",
    status: "published",
    enrolled_count: 5,
    sessions_count: 1,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    sessions: [
      {
        id: "sess-1",
        organization_id: "org-1",
        training_program_id: "prog-1",
        session_number: "SES-K8S-01",
        title: "Session 1",
        session_date: "2025-05-01",
        start_time: "10:00",
        end_time: "18:00",
        location: "Lab A",
        trainer: "Dave Tech",
        capacity: 30,
        status: "scheduled",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
    ],
    enrollments: [
      {
        id: "enr-1",
        organization_id: "org-1",
        training_program_id: "prog-1",
        employee_id: "emp-1",
        enrollment_date: "2025-05-01",
        status: "enrolled",
        score: null,
        result: null,
        certificate_number: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        employee: {
          id: "emp-1",
          employee_code: "EMP-007",
          first_name: "James",
          last_name: "Bond",
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: { id: "org-1", name: "Test Org", slug: "test-org" },
      permissions: ["training.view", "training.create", "training.update", "training.delete", "training.complete"],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/training-programs/prog-1")) {
        return Promise.resolve({ data: mockProgram }) as any;
      }
      return Promise.resolve({ data: { items: [] } }) as any;
    });
  });

  it("renders training program details and sub-tables correctly", async () => {
    render(<TrainingProgramDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Kubernetes Mastery")).toBeInTheDocument();
    });

    expect(screen.getByText("TRN-K8S-01")).toBeInTheDocument();
    expect(screen.getByText("SES-K8S-01")).toBeInTheDocument();
    expect(screen.getByText("James Bond (EMP-007)")).toBeInTheDocument();
  });
});
