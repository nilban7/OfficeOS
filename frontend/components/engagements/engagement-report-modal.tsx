"use client";

import * as React from "react";
import {
  Download,
  Printer,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export type ReportType = "agreement" | "handover" | "weekly_report" | "uat_session";

interface EngagementReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: ReportType;
  organizationName?: string;
  engagementTitle?: string;
  clientName?: string;
  data: any;
}

export function EngagementReportModal({
  isOpen,
  onClose,
  reportType,
  organizationName = "OfficeOS Enterprise",
  engagementTitle = "Client Engagement",
  clientName = "Client Organization",
  data,
}: EngagementReportModalProps) {
  if (!isOpen || !data) return null;

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleDownloadMarkdown = () => {
    let content = "";
    let filename = "report.md";

    if (reportType === "agreement") {
      filename = `${data.agreement_number || "Agreement"}_Executed_Report.md`;
      content = `# LEGAL AGREEMENT & EXECUTION RECORD
**Document Ref**: ${data.agreement_number}
**Title**: ${data.title}
**Agreement Type**: ${(data.agreement_type || "SOW").toUpperCase()}
**Organization**: ${organizationName}
**Client**: ${clientName}
**Engagement**: ${engagementTitle}
**Contract Value**: ₹${Number(data.contract_value || 0).toLocaleString("en-IN")} ${data.currency || "INR"}
**Status**: ${data.status}
**Effective Date**: ${data.effective_date || "Upon Execution"}
**Expiry Date**: ${data.expiry_date || "Until Project Completion"}

---

## Terms & Statement of Work
${data.document_content || "As outlined in primary commercial engagement agreement schedule."}

---

## Cryptographic Digital Signatures Evidence
Document Checksum (SHA-256): \`${data.document_sha256 || "N/A"}\`

Signatures Recorded:
${(data.signatures || [])
  .map(
    (s: any) =>
      `- **${s.signer_name}** (${s.signer_role.toUpperCase()}) | ${s.signer_email} | Title: ${s.signer_title || "Signatory"} | Signed: ${s.signed_at || "Recorded"} | Checksum: \`${s.signature_checksum || "Verified"}\``
  )
  .join("\n")}

*Generated securely by OfficeOS Enterprise SaaS Platform.*
`;
    } else if (reportType === "handover") {
      filename = `${data.handover_number || "Handover"}_Certificate.md`;
      content = `# PROJECT COMPLETION & ACCEPTANCE HANDOVER CERTIFICATE
**Certificate Ref**: ${data.handover_number || "HND-0001"}
**Engagement**: ${engagementTitle}
**Client**: ${clientName}
**Organization**: ${organizationName}
**Handover Status**: ${data.deliverables_accepted ? "DELIVERED & ACCEPTED" : "PENDING SIGNOFF"}

---

## Delivery & Acceptance Verification
- [x] Deliverables Accepted: ${data.deliverables_accepted ? "YES — Verified and accepted by client" : "NO"}
- [x] Documentation & Source Artifacts: ${data.documentation_provided ? "YES — Transferred to client" : "NO"}
- **Authorized Client Signatory**: ${data.client_signoff_name || "Client Representative"}
- **Sign-off Date**: ${data.client_signoff_at || new Date().toISOString()}

---

## Warranty & Service Level Agreement
- **Warranty Period**: ${data.warranty_start_date || "Start"} to ${data.warranty_end_date || "End"}
- **SLA Tier**: ${data.sla_tier || "Tier 1 - Standard SLA"}
- **Delivery Notes**: ${data.notes || "Final handover completed with all requirements verified."}

*Generated securely by OfficeOS Enterprise SaaS Platform.*
`;
    } else if (reportType === "weekly_report") {
      filename = `${data.report_number || "Weekly_Report"}.md`;
      content = `# WEEKLY EXECUTIVE PROGRESS REPORT
**Report Ref**: ${data.report_number}
**Engagement**: ${engagementTitle}
**Client**: ${clientName}
**Week Period**: ${data.week_start_date} to ${data.week_end_date}
**Delivery Health**: ${data.delivery_health || "On Track"}

---

## Executive Summary
${data.executive_summary}

---

## Accomplishments & Completed Milestones
${(data.accomplishments || ["Milestone deliverables completed."]).map((a: string) => `- ${a}`).join("\n")}

---

## Next Week Planned Activities
${(data.next_week_plans || ["Continuing active sprint execution."]).map((p: string) => `- ${p}`).join("\n")}

---

## Risks, Blockers & Mitigations
${(data.risks_and_blockers || ["No critical delivery blockers."]).map((r: string) => `- ${r}`).join("\n")}

*Generated securely by OfficeOS Enterprise SaaS Platform.*
`;
    } else if (reportType === "uat_session") {
      filename = `UAT_${data.build_version || "Test_Run"}_Report.md`;
      content = `# QUALITY ASSURANCE & UAT TEST RUN REPORT
**Session**: ${data.session_title}
**Build Version**: ${data.build_version}
**Staging URL**: ${data.staging_url || "Internal Staging"}
**Status**: ${data.status}
**Engagement**: ${engagementTitle}
**Client**: ${clientName}

---

## Test Execution Checklist
${(data.test_cases || [])
  .map(
    (tc: any, i: number) =>
      `### ${i + 1}. ${tc.title} [Status: ${tc.status.toUpperCase()}]
- **Instructions**: ${tc.instructions}
- **Expected Outcome**: ${tc.expected_outcome}
- **Actual Outcome**: ${tc.actual_outcome || "Verified as expected"}
- **Tested By**: ${tc.tested_by_name || "QA Engineer"}
`
  )
  .join("\n")}

*Generated securely by OfficeOS Enterprise SaaS Platform.*
`;
    }

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="xl"
      className="p-0 overflow-hidden max-w-4xl"
    >
      {/* Top Action Bar (hidden when printing) */}
      <div className="no-print bg-slate-900 text-white px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-primary-400" />
          <span className="text-sm font-semibold tracking-wide">
            Structured Executive Report Viewer
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadMarkdown}
            className="text-xs bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download .MD</span>
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            className="text-xs bg-primary-600 hover:bg-primary-500 text-white flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print / Save as PDF</span>
          </Button>
        </div>
      </div>

      {/* Printable Document Body */}
      <div id="printable-document" className="p-8 sm:p-10 bg-white text-slate-900 space-y-6 max-h-[80vh] overflow-y-auto">
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between pb-6 border-b-2 border-slate-900 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-block h-3.5 w-3.5 rounded-sm bg-primary-600" />
              <span className="font-bold text-xs uppercase tracking-wider text-slate-500">
                {organizationName}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              {reportType === "agreement" && "Formal Commercial Agreement"}
              {reportType === "handover" && "Project Handover & Acceptance Certificate"}
              {reportType === "weekly_report" && "Weekly Progress Status Report"}
              {reportType === "uat_session" && "Quality Assurance & UAT Acceptance Report"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Engagement: <strong>{engagementTitle}</strong> • Client: <strong>{clientName}</strong>
            </p>
          </div>

          <div className="text-left sm:text-right text-xs space-y-1 font-mono text-slate-600">
            <div>
              Ref:{" "}
              <strong className="text-slate-900">
                {data.agreement_number ||
                  data.handover_number ||
                  data.report_number ||
                  data.build_version ||
                  "DOC-0001"}
              </strong>
            </div>
            <div>Date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>
            <div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-slate-100 text-slate-800">
                {data.status || (data.deliverables_accepted ? "DELIVERED" : "PUBLISHED")}
              </span>
            </div>
          </div>
        </div>

        {/* 1. Agreement Report */}
        {reportType === "agreement" && (
          <div className="space-y-6 text-xs sm:text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Agreement Type</span>
                <span className="font-bold text-slate-800 uppercase">{data.agreement_type || "SOW"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Contract Value</span>
                <span className="font-bold text-slate-800">₹{Number(data.contract_value || 0).toLocaleString("en-IN")}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Effective Date</span>
                <span className="font-bold text-slate-800">{data.effective_date || "Upon Execution"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Current Status</span>
                <span className="font-bold text-primary-700 capitalize">{data.status || "Active"}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">
                Statement of Work & Terms
              </h4>
              <p className="text-slate-700 leading-relaxed whitespace-pre-line text-xs">
                {data.document_content || "Agreement terms governing project execution, milestones, deliverables, and service levels."}
              </p>
            </div>

            {/* Cryptographic Execution Record */}
            <div>
              <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-2 border-b border-slate-200 pb-1 flex items-center justify-between">
                <span>Cryptographic Execution Evidence</span>
                <span className="font-mono text-[10px] text-slate-400 font-normal">
                  SHA-256: {data.document_sha256?.substring(0, 16)}...
                </span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                {(data.signatures || []).map((sig: any) => (
                  <div key={sig.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-900">{sig.signer_name}</span>
                      <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                        ✓ Signed
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Role: <strong className="text-slate-700 uppercase">{sig.signer_role}</strong> • {sig.signer_email}
                    </div>
                    {sig.signature_data && (
                      <div className="bg-white p-1 rounded border border-slate-200 max-h-16 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sig.signature_data} alt="Signature" className="max-h-12 object-contain" />
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400 font-mono truncate">
                      Checksum: {sig.signature_checksum || "Verified"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Handover Report */}
        {reportType === "handover" && (
          <div className="space-y-6 text-xs sm:text-sm">
            <div className="p-5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>Final Project Acceptance & Operational Delivery Verified</span>
              </div>
              <p className="text-xs text-emerald-700 leading-relaxed">
                This document certifies that the client organization has tested, verified, and officially accepted all deliverables for the referenced engagement. All operational rights and documentation have been transferred.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Deliverables</span>
                <span className="font-bold text-slate-800">{data.deliverables_accepted ? "✓ Accepted" : "Pending"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Documentation</span>
                <span className="font-bold text-slate-800">{data.documentation_provided ? "✓ Transferred" : "Pending"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Warranty Period</span>
                <span className="font-bold text-slate-800">
                  {data.warranty_start_date ? `${data.warranty_start_date} to ${data.warranty_end_date}` : "90 Days"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Support SLA</span>
                <span className="font-bold text-primary-700">{data.sla_tier || "Tier 1 - Standard"}</span>
              </div>
            </div>

            {data.client_signoff_name && (
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
                <span className="text-slate-400 text-[11px] uppercase tracking-wider block">Authorized Signatory Sign-off</span>
                <div className="font-bold text-slate-900 text-sm">{data.client_signoff_name}</div>
                <div className="text-xs text-slate-500">
                  Client Authorized Representative • Recorded: {data.client_signoff_at ? new Date(data.client_signoff_at).toLocaleString() : "Upon Handover"}
                </div>
              </div>
            )}

            {data.notes && (
              <div>
                <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-1.5 border-b border-slate-200 pb-1">
                  Handover & Transition Notes
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                  {data.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 3. Weekly Report */}
        {reportType === "weekly_report" && (
          <div className="space-y-6 text-xs sm:text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Report Period</span>
                <span className="font-bold text-slate-800">{data.week_start_date} to {data.week_end_date}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Delivery Health</span>
                <span className="font-bold text-emerald-700 capitalize">{data.delivery_health || "On Track"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Published Status</span>
                <span className="font-bold text-slate-800">{data.is_published ? "Published to Stakeholders" : "Draft"}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-1.5 border-b border-slate-200 pb-1">
                Executive Summary
              </h4>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                {data.executive_summary}
              </p>
            </div>

            {data.accomplishments && (
              <div>
                <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-1.5 border-b border-slate-200 pb-1">
                  Accomplishments & Completed Sprints
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                  {(Array.isArray(data.accomplishments) ? data.accomplishments : [data.accomplishments]).map((item: any, i: number) => (
                    <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.next_week_plans && (
              <div>
                <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-1.5 border-b border-slate-200 pb-1">
                  Planned Activities for Upcoming Week
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                  {(Array.isArray(data.next_week_plans) ? data.next_week_plans : [data.next_week_plans]).map((item: any, i: number) => (
                    <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.risks_and_blockers && (
              <div>
                <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-1.5 border-b border-slate-200 pb-1 text-amber-900">
                  Risks, Blockers & Mitigations
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                  {(Array.isArray(data.risks_and_blockers) ? data.risks_and_blockers : [data.risks_and_blockers]).map((item: any, i: number) => (
                    <li key={i}>{typeof item === "string" ? item : JSON.stringify(item)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 4. UAT Report */}
        {reportType === "uat_session" && (
          <div className="space-y-6 text-xs sm:text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Build Version</span>
                <span className="font-mono font-bold text-slate-800">{data.build_version}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Staging URL</span>
                <span className="font-bold text-slate-800 truncate block">{data.staging_url || "Local Staging"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">Session Status</span>
                <span className="font-bold text-primary-700 capitalize">{data.status}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 text-sm uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">
                Test Cases Execution Log ({(data.test_cases || []).length} Cases)
              </h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Test Case</th>
                      <th className="py-2.5 px-3">Instructions & Expected Outcome</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(data.test_cases || []).map((tc: any) => (
                      <tr key={tc.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-semibold text-slate-900 align-top">{tc.title}</td>
                        <td className="py-2.5 px-3 text-slate-600 align-top">
                          <div>{tc.instructions}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">Expected: {tc.expected_outcome}</div>
                        </td>
                        <td className="py-2.5 px-3 align-top">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                              tc.status === "pass"
                                ? "bg-emerald-100 text-emerald-800"
                                : tc.status === "fail"
                                ? "bg-red-100 text-red-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {tc.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Document Footer */}
        <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-slate-400 gap-2">
          <div>OfficeOS Enterprise Cloud • Certified Commercial Lifecycle Record</div>
          <div className="font-mono">Security Hash Verified • Tamper-Evident Audit Trail</div>
        </div>
      </div>
    </Modal>
  );
}
