"use client";

import * as React from "react";
import { ChevronDown, Check, Sparkles, RefreshCw } from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import { cn } from "@/lib/utils/cn";

export type RolePersona =
  | "superowner"
  | "organization_owner"
  | "director"
  | "hr_manager"
  | "department_manager"
  | "employee";

interface PersonaConfig {
  id: RolePersona;
  name: string;
  badge: string;
  description: string;
  permissions: string[];
}

const PERSONAS: PersonaConfig[] = [
  {
    id: "superowner",
    name: "Superowner / System Admin",
    badge: "👑 Superowner",
    description: "SaaS Admin, Fleet, Multi-Tenant Onboarding, Full Platform Control",
    permissions: [
      "saas.view",
      "saas.manage",
      "organizations.view",
      "organizations.update",
      "organizations.settings_manage",
      "branches.view",
      "branches.manage",
      "departments.view",
      "departments.manage",
      "roles.view",
      "members.view",
      "members.manage",
      "employees.view",
      "employees.create",
      "employees.update",
      "employees.delete",
      "attendance.view",
      "attendance.view_own",
      "attendance.create",
      "attendance.update",
      "attendance.delete",
      "leave.view",
      "leave.view_own",
      "leave.request",
      "leave.approve",
      "leave.cancel",
      "leave.manage",
      "payroll.view",
      "payslips.view",
      "payslips.view_own",
      "reimbursements.view",
      "reimbursements.view_own",
      "reimbursements.create",
      "travel.view",
      "travel.view_own",
      "travel.create",
      "training.view",
      "training.view_own",
      "training.enroll",
      "internships.view",
      "clients.view",
      "engagements.view",
      "projects.view",
      "procurement.view",
      "assets.view",
      "assets.view_own",
      "maintenance.view",
      "operations.view",
      "finance.view",
      "documents.view",
      "notifications.view",
      "audit_logs.view",
      "automations.view",
      "reports.view",
      "ai.view",
    ],
  },
  {
    id: "organization_owner",
    name: "Company Owner",
    badge: "🏢 Company Owner",
    description: "Full Tenant Authority: Settings, Billing, Members, All Org Modules",
    permissions: [
      "organizations.view",
      "organizations.update",
      "organizations.settings_manage",
      "branches.view",
      "branches.manage",
      "departments.view",
      "departments.manage",
      "roles.view",
      "members.view",
      "members.manage",
      "employees.view",
      "employees.create",
      "employees.update",
      "employees.delete",
      "attendance.view",
      "attendance.view_own",
      "attendance.create",
      "attendance.update",
      "leave.view",
      "leave.view_own",
      "leave.request",
      "leave.approve",
      "leave.manage",
      "payroll.view",
      "payslips.view",
      "payslips.view_own",
      "reimbursements.view",
      "reimbursements.view_own",
      "reimbursements.create",
      "travel.view",
      "travel.view_own",
      "travel.create",
      "training.view",
      "training.view_own",
      "training.enroll",
      "internships.view",
      "clients.view",
      "engagements.view",
      "projects.view",
      "procurement.view",
      "assets.view",
      "assets.view_own",
      "maintenance.view",
      "operations.view",
      "finance.view",
      "documents.view",
      "notifications.view",
      "audit_logs.view",
      "automations.view",
      "reports.view",
      "ai.view",
    ],
  },
  {
    id: "director",
    name: "Executive Director",
    badge: "👔 Director",
    description: "Executive Reports, Strategic Approvals, Contracts, Finance",
    permissions: [
      "reports.view",
      "ai.view",
      "organizations.view",
      "branches.view",
      "departments.view",
      "roles.view",
      "members.view",
      "employees.view",
      "attendance.view",
      "leave.view",
      "leave.approve",
      "payroll.view",
      "payslips.view",
      "reimbursements.view",
      "travel.view",
      "training.view",
      "internships.view",
      "clients.view",
      "engagements.view",
      "projects.view",
      "procurement.view",
      "assets.view",
      "maintenance.view",
      "operations.view",
      "finance.view",
      "documents.view",
      "notifications.view",
      "audit_logs.view",
    ],
  },
  {
    id: "hr_manager",
    name: "HR Manager",
    badge: "👥 HR Manager",
    description: "Employee Directory, Attendance Feed, Leaves, Payroll, Internships",
    permissions: [
      "organizations.view",
      "departments.view",
      "members.view",
      "members.manage",
      "employees.view",
      "employees.create",
      "employees.update",
      "attendance.view",
      "attendance.create",
      "attendance.update",
      "leave.view",
      "leave.request",
      "leave.approve",
      "leave.manage",
      "payroll.view",
      "payslips.view",
      "reimbursements.view",
      "training.view",
      "training.enroll",
      "training.manage",
      "internships.view",
      "internships.create",
      "internships.manage",
      "documents.view",
      "notifications.view",
      "reports.view",
    ],
  },
  {
    id: "department_manager",
    name: "Department / Project Manager",
    badge: "💼 Manager",
    description: "Team Attendance, Task Delivery, Client Engagements, Operations",
    permissions: [
      "departments.view",
      "employees.view",
      "attendance.view",
      "leave.view",
      "leave.request",
      "projects.view",
      "clients.view",
      "engagements.view",
      "assets.view",
      "maintenance.view",
      "operations.view",
      "notifications.view",
      "documents.view",
      "ai.view",
    ],
  },
  {
    id: "employee",
    name: "Employee (Self-Service)",
    badge: "👤 Employee",
    description: "Self-Service Only: My Attendance, My Leaves, My Assets, My Payslips",
    permissions: [
      "attendance.view_own",
      "attendance.create",
      "attendance.update",
      "leave.view_own",
      "leave.request",
      "leave.cancel",
      "assets.view_own",
      "payslips.view_own",
      "reimbursements.view_own",
      "reimbursements.create",
      "travel.view_own",
      "travel.create",
      "training.view_own",
      "training.enroll",
      "notifications.view",
      "notifications.mark_read",
      "documents.view",
    ],
  },
];

export function RoleSwitcher() {
  const { permissions, simulatedRole, setSimulatedRole } = useOrganization();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activePersonaId: RolePersona = React.useMemo(() => {
    if (simulatedRole && PERSONAS.some((p) => p.id === simulatedRole)) {
      return simulatedRole as RolePersona;
    }
    if (permissions.includes("saas.view" as any)) return "superowner";
    if (permissions.includes("organizations.settings_manage" as any)) return "organization_owner";
    if (permissions.includes("payroll.view" as any) && permissions.includes("employees.create" as any)) return "hr_manager";
    if (!permissions.includes("employees.view" as any)) return "employee";
    return "organization_owner";
  }, [simulatedRole, permissions]);

  const activePersona: PersonaConfig = PERSONAS.find((p) => p.id === activePersonaId) ?? PERSONAS[0]!;

  const handleSelectPersona = (persona: PersonaConfig) => {
    setSimulatedRole?.(persona.id, persona.permissions as any);
    setIsOpen(false);
  };

  const handleResetToBackend = () => {
    setSimulatedRole?.(null);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center space-x-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500",
          isOpen && "ring-2 ring-primary-500"
        )}
        title="Simulate Role View"
        aria-expanded={isOpen}
      >
        <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
        <span className="text-slate-400 dark:text-slate-400 font-normal hidden xl:inline">Role:</span>
        <span className="font-medium text-slate-800 dark:text-slate-100 max-w-[130px] truncate">
          {activePersona.badge}
        </span>
        <ChevronDown className={cn("h-3 w-3 text-slate-400 transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 z-50 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-2 space-y-1 animate-in fade-in-0 zoom-in-95">
          <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Simulate Role View</span>
              <button
                type="button"
                onClick={handleResetToBackend}
                className="text-[10px] text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors"
                title="Reset to live database permissions"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                Reset
              </button>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              Instant perspective switch. Verifies that navigation and modules adapt strictly per role without reverting.
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1 py-1">
            {PERSONAS.map((p) => {
              const isSelected = p.id === activePersonaId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPersona(p)}
                  className={cn(
                    "w-full text-left rounded-lg p-2 transition-colors flex items-start justify-between gap-2 text-xs",
                    isSelected
                      ? "bg-primary-50 dark:bg-primary-950/60 border border-primary-200 dark:border-primary-800 text-primary-900 dark:text-primary-100 font-medium"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300"
                  )}
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold flex items-center gap-1.5">
                      <span>{p.badge}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                      {p.description}
                    </div>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
