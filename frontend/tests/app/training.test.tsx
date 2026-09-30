import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TrainingPage from "@/app/(protected)/training/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { TrainingEnrollment, TrainingProgram, TrainingSession } from "@/types/training";
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

describe("TrainingPage Component", () => {
  const mockOrg: Organization = {
    id: "org-uuid-1",
    name: "Acme Enterprises",
    slug: "acme-enterprises",
  };

  const mockPrograms: TrainingProgram[] = [
    {
      id: "prog-1",
      organization_id: "org-uuid-1",
      title: "Security Awareness 2025",
      code: "TRN-SEC-101",
      description: "Annual security training",
      category: "Security",
      provider: "Internal SecOps",
      trainer: "Sarah Connor",
      delivery_mode: "online",
      duration_hours: 4,
      capacity: 50,
      cost: 0,
      start_date: "2025-04-01",
      end_date: "2025-04-02",
      status: "published",
      enrolled_count: 12,
      sessions_count: 2,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
  ];

  const mockSessions: TrainingSession[] = [
    {
      id: "sess-1",
      organization_id: "org-uuid-1",
      training_program_id: "prog-1",
      session_number: "SES-SEC-01",
      title: "Module 1",
      session_date: "2025-04-01",
      start_time: "09:00",
      end_time: "13:00",
      location: "Room 101",
      trainer: "Sarah Connor",
      capacity: 25,
      status: "scheduled",
      enrolled_count: 12,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      training_program: {
        id: "prog-1",
        title: "Security Awareness 2025",
        code: "TRN-SEC-101",
        delivery_mode: "online",
        status: "published",
      },
    },
  ];

  const mockEnrollments: TrainingEnrollment[] = [
    {
      id: "enr-1",
      organization_id: "org-uuid-1",
      training_program_id: "prog-1",
      training_session_id: "sess-1",
      employee_id: "emp-1",
      enrollment_date: "2025-04-01",
      status: "enrolled",
      score: null,
      result: null,
      certificate_number: null,
      notes: "Mandatory compliance",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      training_program: {
        id: "prog-1",
        title: "Security Awareness 2025",
        code: "TRN-SEC-101",
        delivery_mode: "online",
        status: "published",
      },
      employee: {
        id: "emp-1",
        employee_code: "EMP-001",
        first_name: "Alice",
        last_name: "Engineer",
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      permissions: [
        "training.view",
        "training.create",
        "training.update",
        "training.delete",
        "training.enroll",
        "training.manage",
        "training.complete",
      ],
      isLoading: false,
    } as any);

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/training-programs")) {
        return Promise.resolve({ data: { items: mockPrograms } }) as any;
      }
      if (url.includes("/training-sessions")) {
        return Promise.resolve({ data: { items: mockSessions } }) as any;
      }
      if (url.includes("/training-enrollments")) {
        return Promise.resolve({ data: { items: mockEnrollments } }) as any;
      }
      if (url.includes("/employees")) {
        return Promise.resolve({ data: { items: [] } }) as any;
      }
      return Promise.resolve({ data: {} }) as any;
    });
  });

  it("renders training hub, metrics, and programs list correctly", async () => {
    render(<TrainingPage />);

    expect(screen.getByText("Loading training modules...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Training Management")).toBeInTheDocument();
    });

    expect(screen.getByText("Security Awareness 2025")).toBeInTheDocument();
    expect(screen.getByText("TRN-SEC-101")).toBeInTheDocument();
    expect(screen.getByText("Sarah Connor")).toBeInTheDocument();
  });

  it("allows switching between programs, sessions, and enrollments tabs", async () => {
    const user = userEvent.setup();
    render(<TrainingPage />);

    await waitFor(() => {
      expect(screen.getByText("Training Management")).toBeInTheDocument();
    });

    // Switch to Sessions tab
    const sessionsTab = screen.getByRole("button", { name: /Training Sessions/i });
    await user.click(sessionsTab);

    expect(screen.getByText("SES-SEC-01")).toBeInTheDocument();
    expect(screen.getByText("Room 101")).toBeInTheDocument();

    // Switch to Enrollments tab
    const enrollmentsTab = screen.getByRole("button", { name: /Enrollments & Records/i });
    await user.click(enrollmentsTab);

    expect(screen.getByText("Alice Engineer")).toBeInTheDocument();
    expect(screen.getByText("EMP-001")).toBeInTheDocument();
  });

  it("opens create program modal when New Program button is clicked", async () => {
    const user = userEvent.setup();
    render(<TrainingPage />);

    await waitFor(() => {
      expect(screen.getByText("New Program")).toBeInTheDocument();
    });

    const newBtn = screen.getByText("New Program");
    await user.click(newBtn);

    expect(screen.getByText("Create Training Program")).toBeInTheDocument();
    expect(screen.getByLabelText(/Program Code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/i)).toBeInTheDocument();
  });
});
