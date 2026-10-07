import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SimulationsPage from "@/app/(protected)/simulations/page";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import type { Organization } from "@/types/organization";
import type { SimulationPreset, SimulationRunResponse } from "@/types/simulation";

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

describe("SimulationsPage Component", () => {
  const mockOrg: Organization = {
    id: "org-123",
    name: "Acme Corp",
    slug: "acme-corp",
  };

  const mockPresets: SimulationPreset[] = [
    {
      id: "hire_trainees",
      category: "workforce",
      title: "Hire 5 Trainees (3 Months @ ₹15k/mo)",
      description: "Workload redistribution, mentor bottleneck, and net ROI.",
      prompt: "What if I hire 5 trainees for 3 months at ₹15,000/month stipend?",
      parameters: { count: 5 },
    },
  ];

  const mockSimulationResult: SimulationRunResponse = {
    title: "Workforce Simulation: Hiring 5 Interns",
    summary: "Simulating adding 5 interns with live payroll metrics.",
    category: "workforce",
    confidence_score: 82,
    assumptions: ["Intern stipend held constant."],
    baseline_metrics: [
      {
        label: "Monthly Payroll",
        current_value: "₹18.4L",
        projected_value: "₹19.15L",
        delta: "+₹0.75L/mo",
      },
    ],
    scenarios: [
      {
        scenario_id: "scenario_b",
        name: "Scenario B — Hire 3 Interns (Optimal)",
        description: "Optimal workload absorption.",
        cost: "₹1.35L",
        expected_value: "₹2.7L – ₹3.5L",
        roi_range: "100% – 159%",
        risk_level: "Low",
        is_recommended: true,
        timeline: [
          {
            period: "Month 1",
            title: "Integration",
            impact: "Smooth ramp-up.",
          },
        ],
      },
    ],
    recommendation: "Scenario B provides optimal return.",
    narrative: "### Executive Analysis\n\nOptimal risk adjusted path.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrganization).mockReturnValue({
      currentOrganization: mockOrg,
      organizations: [mockOrg],
      membership: null,
      permissions: ["ai.view", "ai.use"],
      isLoading: false,
      error: null,
      setCurrentOrganization: vi.fn(),
      refreshOrganizations: vi.fn(),
    } as any);

    vi.mocked(apiClient.get).mockResolvedValue(mockPresets as any);
    vi.mocked(apiClient.post).mockResolvedValue(mockSimulationResult as any);
  });

  it("renders page header and presets", async () => {
    render(<SimulationsPage />);

    expect(
      screen.getByText("OfficeOS — What If? Simulator")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("Hire 5 Trainees (3 Months @ ₹15k/mo)")
      ).toBeInTheDocument();
    });
  });

  it("executes simulation on button click and displays results", async () => {
    const user = userEvent.setup();
    render(<SimulationsPage />);

    const simulateBtn = screen.getByRole("button", { name: /Simulate Decision/i });
    await user.click(simulateBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.getByText("Workforce Simulation: Hiring 5 Interns")
      ).toBeInTheDocument();
      expect(screen.getByText("82%")).toBeInTheDocument();
      expect(
        screen.getByText("Scenario B — Hire 3 Interns (Optimal)")
      ).toBeInTheDocument();
      expect(
        screen.getByText("★ Best Risk-Adjusted Return")
      ).toBeInTheDocument();
    });
  });
});
