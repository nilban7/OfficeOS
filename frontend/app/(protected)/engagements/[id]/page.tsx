"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Handshake,
  FileText,
  FileCheck2,
  Layers,
  CalendarDays,
  ShieldCheck,
  HelpCircle,
  Award,
  Plus,
  Play,
  PenTool,
  Check,
  Trash2,
  Download,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { LoadingState } from "@/components/feedback/loading-state";
import { useOrganization } from "@/hooks/use-organization";
import { apiClient } from "@/lib/api/client";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { SignaturePadModal } from "@/components/engagements/signature-pad-modal";
import {
  EngagementReportModal,
  type ReportType,
} from "@/components/engagements/engagement-report-modal";
import type {
  ClientEngagementDetail,
  EngagementStage,
  AgreementItem,
} from "@/types/engagement";

const STAGES: { key: EngagementStage; label: string; icon: any }[] = [
  { key: "proposal", label: "Proposal", icon: FileText },
  { key: "agreement", label: "Agreement & Sign", icon: FileCheck2 },
  { key: "kickoff", label: "Kickoff", icon: Play },
  { key: "delivery", label: "Active Dev", icon: Layers },
  { key: "weekly_reporting", label: "Weekly Progress", icon: CalendarDays },
  { key: "uat", label: "Mock Run (UAT)", icon: ShieldCheck },
  { key: "issues_triage", label: "Client Queries", icon: HelpCircle },
  { key: "acceptance_handover", label: "Final Delivery", icon: Award },
  { key: "maintenance_support", label: "Warranty & SLA", icon: Handshake },
];

export default function EngagementDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { currentOrganization } = useOrganization();
  const [engagement, setEngagement] = React.useState<ClientEngagementDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<string>("overview");

  // Modals
  const [isProposalModalOpen, setIsProposalModalOpen] = React.useState(false);
  const [isAgreementModalOpen, setIsAgreementModalOpen] = React.useState(false);
  const [isWeeklyReportModalOpen, setIsWeeklyReportModalOpen] = React.useState(false);
  const [isUatModalOpen, setIsUatModalOpen] = React.useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = React.useState(false);
  const [isSignModalOpen, setIsSignModalOpen] = React.useState(false);
  const [isHandoverModalOpen, setIsHandoverModalOpen] = React.useState(false);
  const [selectedAgreement, setSelectedAgreement] = React.useState<AgreementItem | null>(null);

  // Report viewer modal
  const [reportModalOpen, setReportModalOpen] = React.useState(false);
  const [reportType, setReportType] = React.useState<ReportType>("agreement");
  const [reportData, setReportData] = React.useState<any>(null);

  const openReport = (type: ReportType, data: any) => {
    setReportType(type);
    setReportData(data);
    setReportModalOpen(true);
  };

  // Handover form state
  const [handoverSignoffName, setHandoverSignoffName] = React.useState("");
  const [handoverDeliverables, setHandoverDeliverables] = React.useState(true);
  const [handoverDocs, setHandoverDocs] = React.useState(true);
  const [handoverWarrantyStart, setHandoverWarrantyStart] = React.useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [handoverWarrantyEnd, setHandoverWarrantyEnd] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().split("T")[0];
  });
  const [handoverSlaTier, setHandoverSlaTier] = React.useState("Tier 1 - Standard SLA");
  const [handoverNotes, setHandoverNotes] = React.useState("");

  // Form states
  const [propTitle, setPropTitle] = React.useState("");
  const [propAmount, setPropAmount] = React.useState("");
  const [propScope, setPropScope] = React.useState("");

  const [agrTitle, setAgrTitle] = React.useState("");
  const [agrType, setAgrType] = React.useState("sow");
  const [agrValue, setAgrValue] = React.useState("");
  const [agrContent, setAgrContent] = React.useState("");

  const [repSummary, setRepSummary] = React.useState("");
  const [repAccomplishments, setRepAccomplishments] = React.useState("");
  const [repNextPlans, setRepNextPlans] = React.useState("");

  const [uatTitle, setUatTitle] = React.useState("");
  const [uatVersion, setUatVersion] = React.useState("v1.0.0");
  const [uatStagingUrl, setUatStagingUrl] = React.useState("");
  const [uatInstruction, setUatInstruction] = React.useState("");
  const [uatExpected, setUatExpected] = React.useState("");

  const [issTitle, setIssTitle] = React.useState("");
  const [issDesc, setIssDesc] = React.useState("");
  const [issPriority, setIssPriority] = React.useState("medium");
  const [issType, setIssType] = React.useState("bug");
  const [issReporter, setIssReporter] = React.useState("");

  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isActionSubmitting, setIsActionSubmitting] = React.useState(false);

  const fetchEngagement = React.useCallback(async () => {
    if (!currentOrganization?.id || !id) return;
    setIsLoading(true);
    try {
      const res = await apiClient.get<ClientEngagementDetail>(
        API_ENDPOINTS.engagements.detail(id),
        { organizationId: currentOrganization.id }
      );
      setEngagement(res);
    } catch {
      //
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id, id]);

  React.useEffect(() => {
    fetchEngagement();
  }, [fetchEngagement]);

  // Stage transition
  const handleTransitionStage = async (newStage: EngagementStage, progress: number) => {
    if (!currentOrganization?.id || !id) return;
    try {
      await apiClient.patch(
        API_ENDPOINTS.engagements.update(id),
        { current_stage: newStage, progress_percentage: progress },
        { organizationId: currentOrganization.id }
      );
      fetchEngagement();
    } catch {
      //
    }
  };

  const [isKickoffSubmitting, setIsKickoffSubmitting] = React.useState(false);

  // Kickoff Bridge
  const handleKickoff = async () => {
    if (!currentOrganization?.id || !id) return;
    setIsKickoffSubmitting(true);
    try {
      await apiClient.post(
        API_ENDPOINTS.engagements.kickoff(id),
        {},
        { organizationId: currentOrganization.id }
      );
      await fetchEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to kickoff project";
      alert(msg);
    } finally {
      setIsKickoffSubmitting(false);
    }
  };

  // Create Proposal
  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !id) return;
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.engagements.createProposal(id),
        {
          title: propTitle,
          total_amount: parseFloat(propAmount) || 0,
          scope_of_work: propScope,
          currency: "INR",
        },
        { organizationId: currentOrganization.id }
      );
      setIsProposalModalOpen(false);
      setPropTitle("");
      setPropAmount("");
      setPropScope("");
      fetchEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create proposal";
      setActionError(msg);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Create Agreement
  const handleCreateAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !id) return;
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.engagements.createAgreement(id),
        {
          title: agrTitle,
          agreement_type: agrType,
          contract_value: parseFloat(agrValue) || 0,
          currency: "INR",
          document_content: agrContent,
        },
        { organizationId: currentOrganization.id }
      );
      setIsAgreementModalOpen(false);
      setAgrTitle("");
      setAgrValue("");
      setAgrContent("");
      fetchEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create agreement";
      setActionError(msg);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Sign Agreement
  const handleSignAgreement = async (data: any) => {
    if (!currentOrganization?.id || !selectedAgreement) return;
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.engagements.signAgreement(selectedAgreement.id),
        data,
        { organizationId: currentOrganization.id }
      );
      setIsSignModalOpen(false);
      fetchEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record signature";
      setActionError(msg);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Delete Agreement
  const handleDeleteAgreement = async (agrId: string) => {
    if (!currentOrganization?.id || !id) return;
    if (!confirm("Are you sure you want to delete this agreement?")) return;
    setIsActionSubmitting(true);
    try {
      await apiClient.delete(
        API_ENDPOINTS.engagements.deleteAgreement(id, agrId),
        { organizationId: currentOrganization.id }
      );
      fetchEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete agreement";
      alert(msg);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Create Weekly Report
  const handleCreateWeeklyReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !id) return;
    const now = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(now.getDate() - 7);
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.engagements.createWeeklyReport(id),
        {
          week_start_date: lastWeek.toISOString().split("T")[0],
          week_end_date: now.toISOString().split("T")[0],
          executive_summary: repSummary,
          accomplishments: repAccomplishments ? [repAccomplishments] : [],
          next_week_plans: repNextPlans ? [repNextPlans] : [],
          delivery_health: "on_track",
          is_published: true,
        },
        { organizationId: currentOrganization.id }
      );
      setIsWeeklyReportModalOpen(false);
      setRepSummary("");
      setRepAccomplishments("");
      setRepNextPlans("");
      fetchEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to publish weekly report";
      setActionError(msg);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Create UAT Session
  const handleCreateUat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !id) return;
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.engagements.createUatSession(id),
        {
          session_title: uatTitle,
          build_version: uatVersion,
          staging_url: uatStagingUrl || null,
          test_cases: uatInstruction
            ? [
                {
                  title: `${uatTitle} Primary Test Case`,
                  instructions: uatInstruction,
                  expected_outcome: uatExpected || "Verification successful",
                },
              ]
            : [],
        },
        { organizationId: currentOrganization.id }
      );
      setIsUatModalOpen(false);
      setUatTitle("");
      setUatInstruction("");
      setUatExpected("");
      fetchEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate UAT session";
      setActionError(msg);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Create Issue
  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !id) return;
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.engagements.createIssue(id),
        {
          title: issTitle,
          description: issDesc,
          priority: issPriority,
          issue_type: issType,
          reported_by_name: issReporter || "Client Stakeholder",
        },
        { organizationId: currentOrganization.id }
      );
      setIsIssueModalOpen(false);
      setIssTitle("");
      setIssDesc("");
      setIssReporter("");
      fetchEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to log issue";
      setActionError(msg);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Final Delivery & Handover
  const handleRecordHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganization?.id || !id) return;
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      await apiClient.post(
        API_ENDPOINTS.engagements.recordHandover(id),
        {
          deliverables_accepted: handoverDeliverables,
          documentation_provided: handoverDocs,
          client_signoff_name: handoverSignoffName || "Authorized Client Stakeholder",
          warranty_start_date: handoverWarrantyStart || undefined,
          warranty_end_date: handoverWarrantyEnd || undefined,
          sla_tier: handoverSlaTier,
          notes: handoverNotes || "Formal handover signoff completed.",
        },
        { organizationId: currentOrganization.id }
      );
      setIsHandoverModalOpen(false);
      fetchEngagement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record final handover";
      setActionError(msg);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState fullPage message="Loading engagement workspace..." />;
  }

  if (!engagement) {
    return (
      <div className="p-8 text-center text-slate-500">
        Engagement not found or access restricted.
      </div>
    );
  }

  const currentStageIndex = STAGES.findIndex((s) => s.key === engagement.current_stage);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/engagements"
              className="text-xs text-primary-600 hover:underline flex items-center gap-1"
            >
              <Handshake className="h-3.5 w-3.5" />
              <span>Engagements</span>
            </Link>
            <span className="text-slate-400 text-xs">/</span>
            <span className="font-mono text-xs font-semibold text-slate-600">
              {engagement.engagement_code}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {engagement.title}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Client: <strong className="text-slate-700">{engagement.client_name || "Client"}</strong> • Contract Value:{" "}
            <strong className="text-slate-700">₹{Number(engagement.contract_value || 0).toLocaleString("en-IN")}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!engagement.project_id && (engagement.current_stage === "agreement" || engagement.current_stage === "kickoff" || (engagement.agreements && engagement.agreements.length > 0)) && (
            <Button
              size="sm"
              onClick={handleKickoff}
              disabled={isKickoffSubmitting}
              className="flex items-center gap-1.5 shadow-subtle bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Play className="h-4 w-4" />
              <span>{isKickoffSubmitting ? "Starting Delivery..." : "Kickoff Project"}</span>
            </Button>
          )}
          {engagement.project_id && (
            <Link href={`/projects/${engagement.project_id}`}>
              <Button size="sm" variant="outline" className="flex items-center gap-1.5 shadow-subtle">
                <Layers className="h-4 w-4 text-primary-600" />
                <span>Open Linked Project →</span>
              </Button>
            </Link>
          )}
          {engagement.project_id && !engagement.handover?.deliverables_accepted && (
            <Button
              size="sm"
              onClick={() => setIsHandoverModalOpen(true)}
              className="flex items-center gap-1.5 shadow-subtle bg-primary-600 hover:bg-primary-700 text-white"
            >
              <Award className="h-4 w-4" />
              <span>Final Delivery & Handover</span>
            </Button>
          )}
          {engagement.handover?.deliverables_accepted && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-subtle">
              <Check className="h-4 w-4 text-emerald-600" />
              <span>Delivered & Warranty Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Interactive 9-Stage Visual Lifecycle Stepper */}
      <Card className="p-4 sm:p-5 overflow-x-auto">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Lifecycle Progression Stepper
        </div>
        <div className="flex items-center justify-between min-w-[700px] gap-2">
          {STAGES.map((stg, idx) => {
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            const Icon = stg.icon;

            return (
              <button
                key={stg.key}
                type="button"
                onClick={() => {
                  handleTransitionStage(stg.key, Math.round(((idx + 1) / STAGES.length) * 100));
                  const stageTabMap: Record<string, string> = {
                    proposal: "proposals",
                    agreement: "agreements",
                    weekly_reporting: "reports",
                    uat: "uat",
                    issues_triage: "issues",
                    acceptance_handover: "handover",
                    maintenance_support: "handover",
                  };
                  const targetTab = stageTabMap[stg.key];
                  if (targetTab) {
                    setActiveTab(targetTab);
                  }
                }}
                className="flex flex-col items-center flex-1 group focus:outline-none"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold transition-all ${
                    isCompleted
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                      : isCurrent
                      ? "bg-primary-600 border-primary-600 text-white shadow-md ring-4 ring-primary-500/15"
                      : "bg-slate-100 border-slate-200 text-slate-400 group-hover:border-slate-300"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span
                  className={`mt-2 text-[11px] font-medium text-center truncate max-w-[85px] ${
                    isCurrent
                      ? "font-bold text-primary-700"
                      : isCompleted
                      ? "text-slate-800"
                      : "text-slate-400"
                  }`}
                >
                  {stg.label}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Workspace Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto text-xs sm:text-sm font-medium">
        {[
          { key: "overview", label: "Overview" },
          { key: "proposals", label: `Proposals (${engagement.proposals.length})` },
          { key: "agreements", label: `Agreements & e-Sign (${engagement.agreements.length})` },
          { key: "reports", label: `Weekly Reports (${engagement.weekly_reports.length})` },
          { key: "uat", label: `Mock Runs / UAT (${engagement.uat_sessions.length})` },
          { key: "issues", label: `Client Queries & Issues (${engagement.issues.length})` },
          {
            key: "handover",
            label: `Final Delivery & Handover${engagement.handover?.deliverables_accepted ? " (Delivered ✓)" : ""}`,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "border-primary-600 text-primary-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Quick Lifecycle Actions Banner */}
          <div className="md:col-span-3 bg-gradient-to-r from-primary-50/60 via-slate-50 to-emerald-50/60 border border-slate-200/90 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-subtle">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-primary-600 animate-pulse" />
                <h4 className="text-sm font-semibold text-slate-900">Recommended Next Step</h4>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                {engagement.agreements.length === 0
                  ? "Draft a formal SOW or contract agreement to proceed with client digital signing and unlock project kickoff."
                  : !engagement.agreements.some((a) => a.status === "active")
                  ? "Agreements are pending. Draw digital signature with canvas e-Sign to execute the contract and activate delivery."
                  : !engagement.project_id
                  ? "Contract signed and active! Click 'Kickoff Project' in the header to instantiate an operational project."
                  : "Operational project active! Submit Weekly Progress Reports, execute UAT Mock Runs, or triage Client Queries."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveTab("proposals");
                  setIsProposalModalOpen(true);
                }}
                className="text-xs flex items-center gap-1.5 bg-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Proposal</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setActiveTab("agreements");
                  setIsAgreementModalOpen(true);
                }}
                className="text-xs flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Draft Agreement</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveTab("reports");
                  setIsWeeklyReportModalOpen(true);
                }}
                className="text-xs flex items-center gap-1.5 bg-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Weekly Report</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveTab("uat");
                  setIsUatModalOpen(true);
                }}
                className="text-xs flex items-center gap-1.5 bg-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Mock Run (UAT)</span>
              </Button>
            </div>
          </div>

          <Card className="md:col-span-2 p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 text-base">Scope & Commercial Objectives</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {engagement.description || "No scoping details recorded for this engagement."}
            </p>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
              <div>
                <span className="text-xs text-slate-400 block uppercase tracking-wider">Linked Project</span>
                <span className="text-sm font-semibold text-slate-800">
                  {engagement.project_id ? (
                    <Link href={`/projects/${engagement.project_id}`} className="text-primary-600 hover:underline">
                      View Operational Project →
                    </Link>
                  ) : (
                    "Pending Agreement Sign-off"
                  )}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block uppercase tracking-wider">Current Delivery Health</span>
                <Badge variant={engagement.delivery_health === "on_track" ? "success" : "warning"}>
                  {engagement.delivery_health}
                </Badge>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 text-base">Key Milestones</h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Proposal Signed</span>
                <span className="font-medium text-slate-800">
                  {engagement.proposals.some((p) => p.status === "accepted") ? "✓ Accepted" : "Pending"}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Agreement Execution</span>
                <span className="font-medium text-slate-800">
                  {engagement.agreements.some((a) => a.status === "active") ? "✓ Executed" : "Awaiting e-Sign"}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">UAT Mock Runs</span>
                <span className="font-medium text-slate-800">
                  {engagement.uat_sessions.length} sessions
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "proposals" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Commercial Proposals</h3>
            <Button size="sm" onClick={() => setIsProposalModalOpen(true)} className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              <span>Create Proposal</span>
            </Button>
          </div>

          {(engagement.proposals || []).length === 0 ? (
            <Card className="p-8 text-center text-slate-500 text-sm">
              No proposals drafted. Create one to begin scoping.
            </Card>
          ) : (
            (engagement.proposals || []).map((p) => (
              <Card key={p.id} className="p-4 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-700">{p.proposal_number}</span>
                    <h4 className="font-semibold text-slate-900 text-sm">{p.title}</h4>
                    <Badge variant={p.status === "accepted" ? "success" : "default"}>{p.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{p.scope_of_work}</p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 text-base">
                    ₹{Number(p.total_amount).toLocaleString("en-IN")}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "agreements" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Contracts, SOWs & Digital Signatures</h3>
            <Button size="sm" onClick={() => setIsAgreementModalOpen(true)} className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              <span>Draft Agreement</span>
            </Button>
          </div>

          {(engagement.agreements || []).length === 0 ? (
            <Card className="p-8 text-center text-slate-500 text-sm">
              No legal agreements generated.
            </Card>
          ) : (
            (engagement.agreements || []).map((a) => (
              <Card key={a.id} className="p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-primary-600">{a.agreement_number}</span>
                      <h4 className="font-semibold text-slate-900 text-base">{a.title}</h4>
                      <Badge variant={a.status === "active" ? "success" : "warning"}>{a.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Type: <strong className="uppercase">{a.agreement_type}</strong> • Value:{" "}
                      <strong>₹{Number(a.contract_value).toLocaleString("en-IN")}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openReport("agreement", a)}
                      className="flex items-center gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download Report</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedAgreement(a);
                        setIsSignModalOpen(true);
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <PenTool className="h-3.5 w-3.5" />
                      <span>e-Sign Document</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteAgreement(a.id)}
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 h-auto"
                      title="Delete Agreement"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Signatures List */}
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Recorded Signatures ({(a.signatures || []).length})
                  </span>
                  {(a.signatures || []).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No digital signatures recorded yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(a.signatures || []).map((sig) => (
                        <div key={sig.id} className="p-2.5 rounded-lg border border-slate-200/80 bg-slate-50/50 text-xs">
                          <div className="flex justify-between font-semibold text-slate-800">
                            <span>{sig.signer_name}</span>
                            <span className="text-emerald-600 font-normal">✓ Signed</span>
                          </div>
                          <div className="text-slate-400 text-[10px] truncate">{sig.signer_email} ({sig.signer_role})</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Weekly Progress Reports</h3>
            <Button size="sm" onClick={() => setIsWeeklyReportModalOpen(true)} className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              <span>Create Weekly Report</span>
            </Button>
          </div>

          {(engagement.weekly_reports || []).length === 0 ? (
            <Card className="p-8 text-center text-slate-500 text-sm">
              No weekly reports compiled yet.
            </Card>
          ) : (
            (engagement.weekly_reports || []).map((r) => (
              <Card key={r.id} className="p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-700">{r.report_number}</span>
                    <span className="text-xs text-slate-500 font-medium">{r.week_start_date} to {r.week_end_date}</span>
                    <Badge variant="success">Published</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openReport("weekly_report", r)}
                    className="flex items-center gap-1.5 text-xs h-8"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Report</span>
                  </Button>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{r.executive_summary}</p>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "uat" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Client Mock Runs & UAT Test Sessions</h3>
            <Button size="sm" onClick={() => setIsUatModalOpen(true)} className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              <span>New Mock Run</span>
            </Button>
          </div>

          {(engagement.uat_sessions || []).length === 0 ? (
            <Card className="p-8 text-center text-slate-500 text-sm">
              No UAT test runs created.
            </Card>
          ) : (
            (engagement.uat_sessions || []).map((u) => (
              <Card key={u.id} className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-900 text-sm">{u.session_title}</h4>
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                      {u.build_version}
                    </span>
                    <Badge variant="default">{u.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.staging_url && (
                      <a
                        href={u.staging_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary-600 hover:underline mr-1"
                      >
                        Open Staging URL ↗
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openReport("uat_session", u)}
                      className="flex items-center gap-1.5 text-xs h-8"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download Test Report</span>
                    </Button>
                  </div>
                </div>

                <div className="text-xs space-y-2 pt-2 border-t border-slate-100">
                  {(u.test_cases || []).map((tc) => (
                    <div key={tc.id} className="flex justify-between p-2 bg-slate-50 rounded border border-slate-200/60">
                      <div>
                        <span className="font-semibold text-slate-800">{tc.title}</span>
                        <p className="text-slate-500 mt-0.5">{tc.instructions}</p>
                      </div>
                      <Badge variant={tc.status === "pass" ? "success" : "default"}>{tc.status}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "issues" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Client Queries & Defect Triage</h3>
            <Button size="sm" onClick={() => setIsIssueModalOpen(true)} className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              <span>Log Issue / Query</span>
            </Button>
          </div>

          {(engagement.issues || []).length === 0 ? (
            <Card className="p-8 text-center text-slate-500 text-sm">
              No open client issues or defects recorded.
            </Card>
          ) : (
            (engagement.issues || []).map((i) => (
              <Card key={i.id} className="p-4 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-700">{i.issue_number}</span>
                    <h4 className="font-semibold text-slate-900 text-sm">{i.title}</h4>
                    <Badge variant={i.priority === "critical" ? "destructive" : "warning"}>{i.priority}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{i.description}</p>
                </div>
                <Badge variant={i.status === "resolved" ? "success" : "default"}>{i.status}</Badge>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "handover" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Final Delivery Signoff & SLA Warranty</h3>
            <div className="flex items-center gap-2">
              {engagement.handover && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openReport("handover", engagement.handover)}
                  className="flex items-center gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Handover Certificate</span>
                </Button>
              )}
              {!engagement.handover?.deliverables_accepted && (
                <Button
                  size="sm"
                  onClick={() => setIsHandoverModalOpen(true)}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Award className="h-4 w-4" />
                  <span>Execute Final Delivery & Handover</span>
                </Button>
              )}
            </div>
          </div>

          <Card className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-2">
              <div>
                <span className="text-xs font-mono font-bold text-primary-600">
                  {engagement.handover?.handover_number || "HND-DRAFT"}
                </span>
                <h4 className="text-lg font-bold text-slate-900 mt-0.5">
                  Client Project Delivery & Handover Certificate
                </h4>
              </div>
              <div className="flex items-center gap-2">
                {engagement.handover && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openReport("handover", engagement.handover)}
                    className="flex items-center gap-1.5 text-xs h-8"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Certificate</span>
                  </Button>
                )}
                <Badge variant={engagement.handover?.deliverables_accepted ? "success" : "warning"}>
                  {engagement.handover?.deliverables_accepted ? "✓ Delivered & Accepted" : "Pending Signoff"}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block uppercase tracking-wider mb-1">Deliverables Status</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  {engagement.handover?.deliverables_accepted ? "✓ Accepted by Client" : "Awaiting Verification"}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block uppercase tracking-wider mb-1">Documentation & Assets</span>
                <span className="font-semibold text-slate-800">
                  {engagement.handover?.documentation_provided ? "✓ Transferred" : "Pending Transfer"}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block uppercase tracking-wider mb-1">Warranty Term</span>
                <span className="font-semibold text-slate-800">
                  {engagement.handover?.warranty_start_date && engagement.handover?.warranty_end_date
                    ? `${engagement.handover.warranty_start_date} to ${engagement.handover.warranty_end_date}`
                    : "Standard 90-Day Coverage"}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block uppercase tracking-wider mb-1">SLA Tier</span>
                <span className="font-semibold text-slate-800">
                  {engagement.handover?.sla_tier || "Tier 1 - Standard Business Support"}
                </span>
              </div>
            </div>

            {engagement.handover?.client_signoff_name && (
              <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-emerald-900 block">Authorized Client Sign-off</span>
                  <span className="text-emerald-700">
                    Signed by <strong>{engagement.handover.client_signoff_name}</strong>
                    {engagement.handover.client_signoff_at ? ` on ${new Date(engagement.handover.client_signoff_at).toLocaleDateString()}` : ""}
                  </span>
                </div>
                <div className="text-emerald-800 font-mono text-[11px] bg-emerald-100/70 px-2.5 py-1 rounded-md">
                  Status: Delivery Completed & In Warranty
                </div>
              </div>
            )}

            {engagement.handover?.notes && (
              <div className="text-xs text-slate-600 border-t border-slate-100 pt-3">
                <strong className="text-slate-800 block mb-0.5">Handover & Delivery Notes:</strong>
                <p className="leading-relaxed">{engagement.handover.notes}</p>
              </div>
            )}

            {!engagement.handover?.deliverables_accepted && (
              <div className="pt-2 text-center">
                <Button
                  size="md"
                  onClick={() => setIsHandoverModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-card"
                >
                  <Award className="h-4 w-4 mr-2" />
                  <span>Execute Final Delivery Signoff Now</span>
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Signature Pad Modal */}
      {selectedAgreement && (
        <SignaturePadModal
          isOpen={isSignModalOpen}
          onClose={() => setIsSignModalOpen(false)}
          agreementTitle={selectedAgreement.title}
          onSign={handleSignAgreement}
        />
      )}

      {/* Modal: Create Proposal */}
      <Modal
        isOpen={isProposalModalOpen}
        onClose={() => setIsProposalModalOpen(false)}
        title="Draft Commercial Proposal"
        description="Create a versioned commercial proposal with line items and scope."
      >
        <form onSubmit={handleCreateProposal} className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Proposal Title *</Label>
            <Input
              required
              value={propTitle}
              onChange={(e) => setPropTitle(e.target.value)}
              placeholder="e.g. Phase 1 Architecture Blueprint"
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700">Proposed Total Amount (₹) *</Label>
            <Input
              required
              type="number"
              value={propAmount}
              onChange={(e) => setPropAmount(e.target.value)}
              placeholder="e.g. 450000"
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700">Scope of Work</Label>
            <textarea
              rows={3}
              value={propScope}
              onChange={(e) => setPropScope(e.target.value)}
              placeholder="Key deliverables, timeline, milestones..."
              className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsProposalModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">Save Proposal</Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Draft Agreement */}
      <Modal
        isOpen={isAgreementModalOpen}
        onClose={() => setIsAgreementModalOpen(false)}
        title="Draft Contract / SOW"
        description="Create a formal contract ready for electronic digital signatures."
      >
        <form onSubmit={handleCreateAgreement} className="space-y-4">
          {actionError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
              {actionError}
            </div>
          )}
          <div>
            <Label className="text-xs font-semibold text-slate-700">Agreement Title *</Label>
            <Input
              required
              value={agrTitle}
              onChange={(e) => setAgrTitle(e.target.value)}
              placeholder="e.g. Master Statement of Work #1"
              className="mt-1 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Agreement Type</Label>
              <select
                value={agrType}
                onChange={(e) => setAgrType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle"
              >
                <option value="sow">Statement of Work (SOW)</option>
                <option value="msa">Master Service Agreement (MSA)</option>
                <option value="nda">Non-Disclosure Agreement (NDA)</option>
                <option value="amendment">Contract Amendment</option>
              </select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Contract Value (₹) *</Label>
              <Input
                required
                type="number"
                value={agrValue}
                onChange={(e) => setAgrValue(e.target.value)}
                placeholder="e.g. 450000"
                className="mt-1 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700">Legal Document Terms & Content</Label>
            <textarea
              rows={4}
              value={agrContent}
              onChange={(e) => setAgrContent(e.target.value)}
              placeholder="Enter agreement terms, payment clauses, and execution conditions..."
              className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAgreementModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isActionSubmitting || !agrTitle || !agrValue}>
              {isActionSubmitting ? "Creating..." : "Create Agreement"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Weekly Report */}
      <Modal
        isOpen={isWeeklyReportModalOpen}
        onClose={() => setIsWeeklyReportModalOpen(false)}
        title="Compile Weekly Status Report"
        description="Generate an executive status report for client stakeholders."
      >
        <form onSubmit={handleCreateWeeklyReport} className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Executive Summary *</Label>
            <textarea
              required
              rows={2}
              value={repSummary}
              onChange={(e) => setRepSummary(e.target.value)}
              placeholder="High-level progress summary for this week..."
              className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700">Key Accomplishments This Week</Label>
            <Input
              value={repAccomplishments}
              onChange={(e) => setRepAccomplishments(e.target.value)}
              placeholder="e.g. Database schemas provisioned, Auth flow completed"
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700">Planned for Next Week</Label>
            <Input
              value={repNextPlans}
              onChange={(e) => setRepNextPlans(e.target.value)}
              placeholder="e.g. UAT test suite launch and client demo"
              className="mt-1 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsWeeklyReportModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">Publish Report</Button>
          </div>
        </form>
      </Modal>

      {/* Modal: UAT Session */}
      <Modal
        isOpen={isUatModalOpen}
        onClose={() => setIsUatModalOpen(false)}
        title="Setup Client Mock Run / UAT"
        description="Provide a staging build for client testing and acceptance."
      >
        <form onSubmit={handleCreateUat} className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Session Title *</Label>
            <Input
              required
              value={uatTitle}
              onChange={(e) => setUatTitle(e.target.value)}
              placeholder="e.g. Sprint 2 Feature Verification"
              className="mt-1 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Build Version *</Label>
              <Input
                required
                value={uatVersion}
                onChange={(e) => setUatVersion(e.target.value)}
                placeholder="e.g. v1.1.0-rc"
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Staging URL</Label>
              <Input
                value={uatStagingUrl}
                onChange={(e) => setUatStagingUrl(e.target.value)}
                placeholder="https://staging.client.app"
                className="mt-1 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700">Initial Test Case Instructions</Label>
            <textarea
              rows={2}
              value={uatInstruction}
              onChange={(e) => setUatInstruction(e.target.value)}
              placeholder="Step-by-step instructions for the client tester..."
              className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsUatModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">Launch UAT Session</Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Client Issue */}
      <Modal
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        title="Log Client Query or Defect"
        description="Record an inquiry, bug, or scope change request from the client."
      >
        <form onSubmit={handleCreateIssue} className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Issue Title *</Label>
            <Input
              required
              value={issTitle}
              onChange={(e) => setIssTitle(e.target.value)}
              placeholder="e.g. Login button disabled on Safari"
              className="mt-1 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Issue Type</Label>
              <select
                value={issType}
                onChange={(e) => setIssType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle"
              >
                <option value="bug">Defect / Bug</option>
                <option value="clarification">Clarification / Query</option>
                <option value="enhancement">Enhancement Request</option>
                <option value="scope_change">Scope Change (CR)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Priority</Label>
              <select
                value={issPriority}
                onChange={(e) => setIssPriority(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-700">Description *</Label>
            <textarea
              required
              rows={2}
              value={issDesc}
              onChange={(e) => setIssDesc(e.target.value)}
              placeholder="Details of the inquiry or defect..."
              className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsIssueModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">Log Issue</Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Final Delivery & Handover */}
      <Modal
        isOpen={isHandoverModalOpen}
        onClose={() => setIsHandoverModalOpen(false)}
        title="Execute Final Delivery & Client Handover"
        description="Formalize project delivery, record client acceptance, and activate the warranty & SLA period."
      >
        <form onSubmit={handleRecordHandover} className="space-y-4">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Client Signoff Signatory Name *</Label>
            <Input
              required
              value={handoverSignoffName}
              onChange={(e) => setHandoverSignoffName(e.target.value)}
              placeholder="e.g. Ananya Sen (VP Operations)"
              className="mt-1 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Warranty Start Date</Label>
              <Input
                type="date"
                value={handoverWarrantyStart}
                onChange={(e) => setHandoverWarrantyStart(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Warranty End Date</Label>
              <Input
                type="date"
                value={handoverWarrantyEnd}
                onChange={(e) => setHandoverWarrantyEnd(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">SLA Support Tier</Label>
            <select
              value={handoverSlaTier}
              onChange={(e) => setHandoverSlaTier(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
            >
              <option value="Tier 1 - Standard SLA">Tier 1 - Standard Business Hours Support</option>
              <option value="Tier 2 - Premium Managed SLA">Tier 2 - 24/7 Priority Support (4h SLA)</option>
              <option value="Enterprise SLA">Enterprise Managed Services (1h SLA)</option>
            </select>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={handoverDeliverables}
                onChange={(e) => setHandoverDeliverables(e.target.checked)}
                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
              />
              <span className="font-medium">All Project Deliverables Tested & Accepted by Client</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={handoverDocs}
                onChange={(e) => setHandoverDocs(e.target.checked)}
                className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
              />
              <span className="font-medium">Technical Documentation & Deployment Artifacts Transferred</span>
            </label>
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-700">Delivery Notes</Label>
            <textarea
              rows={2}
              value={handoverNotes}
              onChange={(e) => setHandoverNotes(e.target.value)}
              placeholder="e.g. Staging approved with zero critical defects. Deployed to production."
              className="mt-1 w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs text-slate-800 shadow-subtle focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/15 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button size="sm" variant="outline" type="button" onClick={() => setIsHandoverModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={isActionSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isActionSubmitting ? "Executing Handover..." : "Execute Delivery & Activate Warranty"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Structured Report Download / Print Modal */}
      <EngagementReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        reportType={reportType}
        data={reportData}
        organizationName={currentOrganization?.name || "OfficeOS Enterprise"}
        engagementTitle={engagement?.title || "Client Engagement"}
        clientName={engagement?.client_name || "Client"}
      />
    </div>
  );
}
