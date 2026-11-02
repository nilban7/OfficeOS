export type DashboardWidgetId =
  | "kpi_metrics"
  | "projects"
  | "leave"
  | "attendance"
  | "reports"
  | "workforce"
  | "engagements"
  | "travel"
  | "finance"
  | "procurement"
  | "operations";

export type WidgetCategory = "executive" | "operations" | "people" | "finance";

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  visible: boolean;
  order: number;
  colSpan?: "full" | "half" | "two-thirds" | "one-third";
}

export type DashboardPreset =
  | "master"
  | "projects_only"
  | "manager_pulse"
  | "operations_finance"
  | "custom";

export interface DashboardWidgetMeta {
  id: DashboardWidgetId;
  title: string;
  description: string;
  category: WidgetCategory;
  categoryLabel: string;
  moduleRoute: string;
  iconName: string;
  defaultVisible: boolean;
  defaultOrder: number;
  colSpan: "full" | "half" | "two-thirds" | "one-third";
}

export interface UserDashboardPreference {
  preset: DashboardPreset;
  widgets: DashboardWidgetConfig[];
  updatedAt: string;
}
