"use client";

import * as React from "react";
import {
  Sparkles,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Loader2,
  Play,
  Award,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MarkdownMessage } from "@/components/ai/markdown-message";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  SimulationPreset,
  SimulationRunResponse,
} from "@/types/simulation";

export default function SimulationsPage() {
  const { currentOrganization, permissions } = useOrganization();
  const canView = permissions.includes("ai.view") || permissions.includes("reports.view") || permissions.includes("ai.use");

  const [presets, setPresets] = React.useState<SimulationPreset[]>([]);
  const [selectedCategory, setSelectedCategory] = React.useState<string>("compensation");
  const [prompt, setPrompt] = React.useState<string>(
    "What if we introduce an 8% company-wide salary increase next month?"
  );
  const [isSimulating, setIsSimulating] = React.useState<boolean>(false);
  const [simulationResult, setSimulationResult] = React.useState<SimulationRunResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Load presets on mount
  React.useEffect(() => {
    if (!currentOrganization) return;
    const fetchPresets = async () => {
      try {
        const res = await apiClient.get<SimulationPreset[]>(
          API_ENDPOINTS.simulations.presets,
          { headers: { "X-Organization-Id": currentOrganization.id } }
        );
        if (Array.isArray(res)) {
          setPresets(res);
        }
      } catch (err) {
        // Fallback default presets if offline
        setPresets([
          {
            id: "hire_interns",
            category: "workforce",
            title: "Hire 5 Interns (3 Months @ ₹15k/mo)",
            description: "Workload redistribution, mentor bottleneck, and net ROI.",
            prompt: "What if I hire 5 interns for 3 months at ₹15,000/month stipend?",
            parameters: { count: 5, duration_months: 3, stipend: 15000 },
          },
          {
            id: "salary_hike",
            category: "compensation",
            title: "8% Company-wide Salary Increase",
            description: "Payroll burn delta, cash runway, and retention savings.",
            prompt: "What if we introduce an 8% company-wide salary increase next month?",
            parameters: { percentage: 8 },
          },
          {
            id: "project_delay",
            category: "project_delay",
            title: "30-Day Critical Project Delay",
            description: "Milestone billing delay and contractor mitigation.",
            prompt: "What if our primary project is delayed by 30 days due to client scope changes?",
            parameters: { delay_days: 30 },
          },
          {
            id: "satellite_office",
            category: "operations",
            title: "Open Satellite Office (10 Staff)",
            description: "Capex, break-even period, and operational risk.",
            prompt: "What if we open a Bangalore satellite branch with 10 employees?",
            parameters: { headcount: 10 },
          },
        ]);
      }
    };
    fetchPresets();
  }, [currentOrganization]);

  const handleRunSimulation = async (queryPrompt?: string, category?: string) => {
    const activePrompt = queryPrompt || prompt;
    if (!activePrompt.trim() || !currentOrganization) return;

    setIsSimulating(true);
    setError(null);

    try {
      const res = await apiClient.post<SimulationRunResponse>(
        API_ENDPOINTS.simulations.run,
        {
          prompt: activePrompt,
          category: category || selectedCategory,
        },
        { headers: { "X-Organization-Id": currentOrganization.id } }
      );
      if (res) {
        setSimulationResult(res);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to run simulation.";
      setError(msg);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSelectPreset = (p: SimulationPreset) => {
    setPrompt(p.prompt);
    setSelectedCategory(p.category);
    handleRunSimulation(p.prompt, p.category);
  };

  if (!canView) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <ShieldCheck className="h-12 w-12 text-slate-300 mb-3" />
        <h2 className="text-base font-semibold text-slate-800">Access Restricted</h2>
        <p className="mt-1 text-xs text-slate-500 max-w-sm">
          You do not have permission to run strategic organizational simulations. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white shadow-subtle">
              <Sparkles className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              OfficeOS — What If? Simulator
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Before you make a business decision, simulate it against real organizational data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
            Live Database Anchored
          </Badge>
          <Badge variant="outline" className="bg-primary-50 text-primary-700 border-primary-200 text-xs">
            Scenario Modeling V1
          </Badge>
        </div>
      </div>

      {/* Preset Quick-Picks */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Executive Simulation Scenarios
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              disabled={isSimulating}
              className="text-left p-3.5 rounded-xl border border-slate-200 bg-white hover:border-primary-300 hover:shadow-subtle transition-all duration-150 group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Badge variant="secondary" className="text-[10px] uppercase font-bold text-slate-600">
                    {preset.category}
                  </Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-primary-600 transition-colors" />
                </div>
                <h4 className="text-xs font-semibold text-slate-900 line-clamp-1">
                  {preset.title}
                </h4>
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                  {preset.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Scenario Builder Input */}
      <Card className="border-slate-200/80 shadow-subtle bg-slate-50/50">
        <CardContent className="p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="scenario-prompt" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Play className="h-3.5 w-3.5 text-primary-600" />
              Hypothesis / What If Query
            </label>
            <div className="flex items-center gap-1.5">
              {["workforce", "compensation", "project_delay", "operations", "custom"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors capitalize ${
                    selectedCategory === cat
                      ? "bg-primary-600 text-white shadow-xs"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {cat.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              id="scenario-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. What if I hire 5 interns this month? Or what if Project Phoenix is delayed by 30 days?"
              className="h-10 text-xs bg-white border-slate-200"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleRunSimulation();
                }
              }}
            />
            <Button
              onClick={() => handleRunSimulation()}
              disabled={isSimulating || !prompt.trim()}
              className="h-10 px-5 text-xs font-semibold flex-shrink-0"
            >
              {isSimulating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Simulating...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Simulate Decision
                </>
              )}
            </Button>
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md p-2">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Simulation Results Display */}
      {isSimulating && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-subtle space-y-3">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">
            Simulating Decision Against Live Tenant Data
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            OfficeOS is calculating payroll deltas, mentor workload ratios, project dependency chains, and cash flow impacts...
          </p>
        </div>
      )}

      {simulationResult && !isSimulating && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Top Simulation Summary Card */}
          <Card className="border-slate-200 shadow-subtle overflow-hidden">
            <div className="bg-gradient-to-r from-primary-700 via-primary-600 to-indigo-700 p-5 text-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary-200">
                      Simulation Verdict
                    </span>
                    <Badge className="bg-white/20 hover:bg-white/30 text-white text-[10px] border-0">
                      {simulationResult.category.toUpperCase()}
                    </Badge>
                  </div>
                  <h2 className="text-lg font-bold mt-1 text-white">
                    {simulationResult.title}
                  </h2>
                </div>
                <div className="flex items-center gap-3 bg-white/10 rounded-xl px-3.5 py-2 backdrop-blur-sm self-start sm:self-auto">
                  <div className="text-right">
                    <span className="block text-[10px] uppercase font-bold text-primary-200">Confidence</span>
                    <span className="text-base font-extrabold text-white">{simulationResult.confidence_score}%</span>
                  </div>
                  <div className="h-8 w-8 rounded-full border-2 border-emerald-400 flex items-center justify-center bg-emerald-500/20 text-emerald-300 font-bold text-xs">
                    ✓
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-primary-100 leading-relaxed max-w-4xl">
                {simulationResult.summary}
              </p>
            </div>

            {/* Baseline Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100 bg-white">
              {simulationResult.baseline_metrics.map((metric, idx) => (
                <div key={idx} className="p-4 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    {metric.label}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {metric.projected_value}
                    </span>
                    <span className="text-[11px] text-slate-400 line-through">
                      {metric.current_value}
                    </span>
                  </div>
                  <span className="inline-block text-[11px] font-bold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
                    {metric.delta}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Strategic Recommendation Banner */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-start gap-3 shadow-xs">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white flex-shrink-0 mt-0.5 shadow-xs">
              <Award className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                OfficeOS Recommended Path
              </h4>
              <div className="text-xs text-emerald-900 mt-1 leading-relaxed">
                <MarkdownMessage content={simulationResult.recommendation} />
              </div>
            </div>
          </div>

          {/* Scenario Comparison Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Scenario Comparisons & Risk Modeling
              </h3>
              <span className="text-[11px] text-slate-500 font-medium">
                {simulationResult.scenarios.length} Scenarios Evaluated
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {simulationResult.scenarios.map((sc) => {
                const isRec = sc.is_recommended;
                return (
                  <Card
                    key={sc.scenario_id}
                    className={`relative overflow-hidden transition-all duration-200 flex flex-col justify-between ${
                      isRec
                        ? "border-primary-500 ring-2 ring-primary-500/20 shadow-md bg-white"
                        : "border-slate-200 bg-white shadow-subtle hover:border-slate-300"
                    }`}
                  >
                    {isRec && (
                      <div className="bg-primary-600 text-white text-[10px] font-extrabold uppercase tracking-widest text-center py-1">
                        ★ Best Risk-Adjusted Return
                      </div>
                    )}
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-xs font-bold text-slate-900">
                          {sc.name}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            sc.risk_level === "Low"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : sc.risk_level === "Medium"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          {sc.risk_level} Risk
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                        {sc.description}
                      </p>
                    </CardHeader>

                    <CardContent className="p-4 pt-2 space-y-3.5 flex-1 flex flex-col justify-between">
                      {/* Cost & ROI Stats */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] font-medium text-slate-400 block">Outlay</span>
                          <span className="font-bold text-slate-800">{sc.cost}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-medium text-slate-400 block">ROI</span>
                          <span className="font-bold text-primary-700">{sc.roi_range}</span>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-slate-200/60">
                          <span className="text-[10px] font-medium text-slate-400 block">Expected Value</span>
                          <span className="font-semibold text-slate-700">{sc.expected_value}</span>
                        </div>
                      </div>

                      {/* Timeline Progression */}
                      {sc.timeline && sc.timeline.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Milestone Projection
                          </span>
                          <div className="space-y-1.5">
                            {sc.timeline.map((event, eIdx) => (
                              <div key={eIdx} className="text-[11px] bg-slate-50/80 rounded p-1.5 border border-slate-100">
                                <span className="font-bold text-slate-700 mr-1.5">{event.period}:</span>
                                <span className="text-slate-600 font-medium">{event.title} — </span>
                                <span className="text-slate-500">{event.impact}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Deep Narrative Briefing */}
          <Card className="border-slate-200 shadow-subtle">
            <CardHeader className="p-4 pb-2 border-b border-slate-100">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary-600" />
                Strategic Executive Briefing
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-xs text-slate-800 leading-relaxed">
              <MarkdownMessage content={simulationResult.narrative} />
            </CardContent>
          </Card>

          {/* Assumptions & Methodology Footer */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-[11px] text-slate-500">
                Simulation Model Assumptions & Baseline Constraints
              </span>
              <span className="text-[11px] text-slate-400">
                Confidence: {simulationResult.confidence_score}%
              </span>
            </div>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-500">
              {simulationResult.assumptions.map((asm, aIdx) => (
                <li key={aIdx}>{asm}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
