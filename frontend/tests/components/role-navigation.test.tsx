import { describe, it, expect } from "vitest";
import { MAIN_NAVIGATION } from "@/constants/navigation";

describe("Role-Based Navigation Filtering", () => {
  const employeePermissions = new Set([
    "attendance.view_own",
    "leave.view_own",
    "assets.view_own",
    "payslips.view_own",
    "reimbursements.view_own",
    "reimbursements.create",
    "travel.view_own",
    "travel.create",
    "training.view_own",
    "training.enroll",
    "notifications.view",
  ]);

  const hrManagerPermissions = new Set([
    "employees.view",
    "employees.create",
    "employees.update",
    "attendance.view",
    "leave.view",
    "payroll.view",
    "internships.view",
    "reports.view",
    "notifications.view",
  ]);

  const directorPermissions = new Set([
    "reports.view",
    "clients.view",
    "engagements.view",
    "projects.view",
    "finance.view",
    "audit_logs.view",
    "notifications.view",
  ]);

  const superownerPermissions = new Set([
    "saas.view",
    "saas.manage",
    "organizations.view",
    "employees.view",
    "attendance.view",
  ]);

  function getVisibleHrefs(userPermissions: Set<string>): string[] {
    const visible: string[] = [];
    for (const section of MAIN_NAVIGATION) {
      for (const item of section.items) {
        if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
          visible.push(item.href);
          continue;
        }
        if (item.requiredPermissions.some((p) => userPermissions.has(p))) {
          visible.push(item.href);
        }
      }
    }
    return visible;
  }

  it("employee only sees self-service modules and dashboard", () => {
    const visible = getVisibleHrefs(employeePermissions);
    
    // Must see self-service items
    expect(visible).toContain("/dashboard");
    expect(visible).toContain("/attendance");
    expect(visible).toContain("/leave");
    expect(visible).toContain("/payroll");
    expect(visible).toContain("/reimbursements");
    expect(visible).toContain("/travel");
    expect(visible).toContain("/assets");
    expect(visible).toContain("/training");
    expect(visible).toContain("/notifications");

    // Must NOT see admin/management modules
    expect(visible).not.toContain("/organization");
    expect(visible).not.toContain("/employees");
    expect(visible).not.toContain("/clients");
    expect(visible).not.toContain("/engagements");
    expect(visible).not.toContain("/finance");
    expect(visible).not.toContain("/audit-logs");
    expect(visible).not.toContain("/automations");
    expect(visible).not.toContain("/admin");
    expect(visible).not.toContain("/admin/organizations");
    expect(visible).not.toContain("/admin/kiosks");
  });

  it("hr manager sees people management and workforce operations", () => {
    const visible = getVisibleHrefs(hrManagerPermissions);
    expect(visible).toContain("/employees");
    expect(visible).toContain("/attendance");
    expect(visible).toContain("/leave");
    expect(visible).toContain("/payroll");
    expect(visible).toContain("/internships");
    expect(visible).toContain("/reports");

    // Must NOT see SaaS Admin
    expect(visible).not.toContain("/admin");
    expect(visible).not.toContain("/admin/settings");
  });

  it("director sees executive reports, engagements, and finance", () => {
    const visible = getVisibleHrefs(directorPermissions);
    expect(visible).toContain("/reports");
    expect(visible).toContain("/clients");
    expect(visible).toContain("/engagements");
    expect(visible).toContain("/projects");
    expect(visible).toContain("/finance");
    expect(visible).toContain("/audit-logs");

    // Must NOT see SaaS Admin
    expect(visible).not.toContain("/admin");
  });

  it("superowner sees platform administration", () => {
    const visible = getVisibleHrefs(superownerPermissions);
    expect(visible).toContain("/admin");
    expect(visible).toContain("/admin/organizations");
    expect(visible).toContain("/admin/usage");
    expect(visible).toContain("/admin/health");
    expect(visible).toContain("/admin/settings");
    expect(visible).toContain("/admin/kiosks");
  });
});
