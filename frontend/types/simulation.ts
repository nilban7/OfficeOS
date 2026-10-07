export interface SimulationMetric {
  label: string;
  current_value: string;
  projected_value: string;
  delta: string;
  unit?: string;
}

export interface SimulationTimelineEvent {
  period: string;
  title: string;
  impact: string;
}

export interface SimulationScenario {
  scenario_id: string;
  name: string;
  description: string;
  cost: string;
  expected_value: string;
  roi_range: string;
  risk_level: "Low" | "Medium" | "High" | string;
  is_recommended: boolean;
  timeline: SimulationTimelineEvent[];
}

export interface SimulationRunResponse {
  title: string;
  summary: string;
  category: string;
  confidence_score: number;
  assumptions: string[];
  baseline_metrics: SimulationMetric[];
  scenarios: SimulationScenario[];
  recommendation: string;
  narrative: string;
}

export interface SimulationPreset {
  id: string;
  category: string;
  title: string;
  description: string;
  prompt: string;
  parameters: Record<string, unknown>;
}

export interface SimulationRunRequest {
  prompt: string;
  category?: string;
  parameters?: Record<string, unknown>;
}
