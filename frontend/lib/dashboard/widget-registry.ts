import { ROUTES } from "@/constants/routes";
import type {
  DashboardWidgetId,
  DashboardWidgetMeta,
  DashboardWidgetConfig,
  DashboardPreset,
  UserDashboardPreference,
} from "@/types/dashboard";

export const WIDGET_REGISTRY: Record<DashboardWidgetId, DashboardWidgetMeta> = {
  kpi_metrics: {
    id: "kpi_metrics",
    title: "Executive KPI Metrics",
    description: "High-level summary of total workforce, today's attendance, active projects, and commercial pipeline.",
    category: "executive",
    categoryLabel: "Executive Overview",
    moduleRoute: ROUTES.REPORTS,
    iconName: "BarChart3",
    defaultVisible: true,
    defaultOrder: 1,
    colSpan: "full",
  },
  attendance: {
    id: "attendance",
    title: "Workday Attendance Velocity",
    description: "Official Monday to Friday presence trends, punctuality rate, and work schedule.",
    category: "people",
    categoryLabel: "Attendance & Time",
    moduleRoute: ROUTES.ATTENDANCE,
    iconName: "Clock",
    defaultVisible: true,
    defaultOrder: 2,
    colSpan: "two-thirds",
  },
  projects: {
    id: "projects",
    title: "Projects & Delivery Health",
    description: "Active delivery milestones, sprint completion percentages, and project health.",
    category: "operations",
    categoryLabel: "Projects & Tasks",
    moduleRoute: ROUTES.PROJECTS,
    iconName: "Layers",
    defaultVisible: true,
    defaultOrder: 3,
    colSpan: "one-third",
  },
  workforce: {
    id: "workforce",
    title: "Department Headcount Distribution",
    description: "Employee headcount and percentage allocation across functional departments.",
    category: "people",
    categoryLabel: "Workforce & HR",
    moduleRoute: ROUTES.EMPLOYEES,
    iconName: "Users",
    defaultVisible: true,
    defaultOrder: 4,
    colSpan: "half",
  },
  engagements: {
    id: "engagements",
    title: "Operational Milestones & RLS",
    description: "Certified client agreements, handover milestones, and PostgreSQL RLS security verification.",
    category: "executive",
    categoryLabel: "Security & Ops",
    moduleRoute: ROUTES.ENGAGEMENTS,
    iconName: "ShieldCheck",
    defaultVisible: true,
    defaultOrder: 5,
    colSpan: "half",
  },
  leave: {
    id: "leave",
    title: "Leave & Time Off",
    description: "Pending leave approval requests, time-off status, and upcoming organization holidays.",
    category: "people",
    categoryLabel: "Leave Management",
    moduleRoute: ROUTES.LEAVE,
    iconName: "Calendar",
    defaultVisible: false,
    defaultOrder: 6,
    colSpan: "half",
  },
  reports: {
    id: "reports",
    title: "Reports & Analytics",
    description: "Executive analytics snapshot, team performance velocity, and audit reports.",
    category: "executive",
    categoryLabel: "Executive Reports",
    moduleRoute: ROUTES.REPORTS,
    iconName: "FileSpreadsheet",
    defaultVisible: false,
    defaultOrder: 7,
    colSpan: "half",
  },
  travel: {
    id: "travel",
    title: "Travel & Expense Approvals",
    description: "Planned and past corporate travel registrations, travel advances, and settlement claims.",
    category: "operations",
    categoryLabel: "Travel & Field",
    moduleRoute: ROUTES.TRAVEL,
    iconName: "Plane",
    defaultVisible: false,
    defaultOrder: 8,
    colSpan: "half",
  },
  finance: {
    id: "finance",
    title: "Finance & Reimbursements",
    description: "Pending reimbursement claims, expense statements, and payroll status.",
    category: "finance",
    categoryLabel: "Finance & Payroll",
    moduleRoute: ROUTES.REIMBURSEMENTS,
    iconName: "Receipt",
    defaultVisible: false,
    defaultOrder: 9,
    colSpan: "half",
  },
  procurement: {
    id: "procurement",
    title: "Procurement & Assets",
    description: "Active purchase requests, asset allocations, and equipment maintenance status.",
    category: "operations",
    categoryLabel: "Procurement & IT",
    moduleRoute: ROUTES.PROCUREMENT,
    iconName: "ShoppingCart",
    defaultVisible: false,
    defaultOrder: 10,
    colSpan: "half",
  },
  operations: {
    id: "operations",
    title: "Operations & Tasks",
    description: "Internal team tasks, workflow execution, and checklist status.",
    category: "operations",
    categoryLabel: "Operations & Tasks",
    moduleRoute: ROUTES.OPERATIONS,
    iconName: "CheckSquare",
    defaultVisible: false,
    defaultOrder: 11,
    colSpan: "half",
  },
};

export const MASTER_DASHBOARD_CONFIG: DashboardWidgetConfig[] = [
  { id: "kpi_metrics", visible: true, order: 1, colSpan: "full" },
  { id: "attendance", visible: true, order: 2, colSpan: "two-thirds" },
  { id: "projects", visible: true, order: 3, colSpan: "one-third" },
  { id: "workforce", visible: true, order: 4, colSpan: "half" },
  { id: "engagements", visible: true, order: 5, colSpan: "half" },
  { id: "leave", visible: false, order: 6, colSpan: "half" },
  { id: "reports", visible: false, order: 7, colSpan: "half" },
  { id: "travel", visible: false, order: 8, colSpan: "half" },
  { id: "finance", visible: false, order: 9, colSpan: "half" },
  { id: "procurement", visible: false, order: 10, colSpan: "half" },
  { id: "operations", visible: false, order: 11, colSpan: "half" },
];

export const PRESET_DEFINITIONS: Record<
  DashboardPreset,
  { name: string; description: string; widgetIds: DashboardWidgetId[] }
> = {
  master: {
    name: "Master Dashboard (Default)",
    description: "The complete executive overview: KPI metrics, attendance velocity, project health, workforce, and milestones.",
    widgetIds: ["kpi_metrics", "attendance", "projects", "workforce", "engagements"],
  },
  projects_only: {
    name: "Projects Only (Contributor)",
    description: "Focus exclusively on active project delivery, sprint milestones, and personal tasks.",
    widgetIds: ["projects"],
  },
  manager_pulse: {
    name: "Manager Pulse",
    description: "Essential manager view: Leave approvals & balance, Projects delivery, Reports & analytics, and Attendance velocity.",
    widgetIds: ["leave", "projects", "reports", "attendance"],
  },
  operations_finance: {
    name: "Operations & Finance",
    description: "Operational control: Travel management, Finance & reimbursements, Procurement & assets, and Workforce.",
    widgetIds: ["travel", "finance", "procurement", "workforce"],
  },
  custom: {
    name: "Custom Workspace",
    description: "Your personalized combination of widgets and layout order.",
    widgetIds: [],
  },
};

/**
 * Creates a complete widget config array based on active IDs
 */
export function buildConfigFromActiveIds(
  activeIds: DashboardWidgetId[]
): DashboardWidgetConfig[] {
  const result: DashboardWidgetConfig[] = [];
  const allIds = Object.keys(WIDGET_REGISTRY) as DashboardWidgetId[];

  // First, add all active widgets in their requested sequence
  activeIds.forEach((id, idx) => {
    const meta = WIDGET_REGISTRY[id];
    if (meta) {
      result.push({
        id,
        visible: true,
        order: idx + 1,
        colSpan: meta.colSpan,
      });
    }
  });

  // Then add inactive widgets at the end with their default ordering
  let nextOrder = activeIds.length + 1;
  allIds.forEach((id) => {
    if (!activeIds.includes(id)) {
      const meta = WIDGET_REGISTRY[id];
      result.push({
        id,
        visible: false,
        order: nextOrder++,
        colSpan: meta?.colSpan || "half",
      });
    }
  });

  return result;
}

export function getStorageKey(userId?: string, orgId?: string): string {
  const u = userId || "default_user";
  const o = orgId || "default_org";
  return `officeos_dashboard_config_${u}_${o}`;
}

export function getStoredDashboardConfig(
  userId?: string,
  orgId?: string
): UserDashboardPreference {
  if (typeof window === "undefined") {
    return {
      preset: "master",
      widgets: MASTER_DASHBOARD_CONFIG,
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const key = getStorageKey(userId, orgId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return {
        preset: "master",
        widgets: MASTER_DASHBOARD_CONFIG,
        updatedAt: new Date().toISOString(),
      };
    }

    const parsed = JSON.parse(raw) as UserDashboardPreference;
    if (!parsed || !Array.isArray(parsed.widgets)) {
      return {
        preset: "master",
        widgets: MASTER_DASHBOARD_CONFIG,
        updatedAt: new Date().toISOString(),
      };
    }

    // Merge any newly introduced widgets that might be missing from saved config
    const existingIds = new Set(parsed.widgets.map((w) => w.id));
    const merged = [...parsed.widgets];
    (Object.keys(WIDGET_REGISTRY) as DashboardWidgetId[]).forEach((id) => {
      if (!existingIds.has(id)) {
        merged.push({
          id,
          visible: false,
          order: merged.length + 1,
          colSpan: WIDGET_REGISTRY[id].colSpan,
        });
      }
    });

    return {
      preset: parsed.preset || "custom",
      widgets: merged.sort((a, b) => a.order - b.order),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      preset: "master",
      widgets: MASTER_DASHBOARD_CONFIG,
      updatedAt: new Date().toISOString(),
    };
  }
}

export function saveStoredDashboardConfig(
  config: UserDashboardPreference,
  userId?: string,
  orgId?: string
): void {
  if (typeof window === "undefined") return;
  try {
    const key = getStorageKey(userId, orgId);
    localStorage.setItem(key, JSON.stringify(config));
  } catch {
    // Graceful fallback if storage is full or disabled
  }
}

export function resetToMasterDashboard(
  userId?: string,
  orgId?: string
): UserDashboardPreference {
  const masterPref: UserDashboardPreference = {
    preset: "master",
    widgets: MASTER_DASHBOARD_CONFIG,
    updatedAt: new Date().toISOString(),
  };
  saveStoredDashboardConfig(masterPref, userId, orgId);
  return masterPref;
}
