import {
  LayoutDashboard,
  Building2,
  Users,
  Clock,
  CalendarDays,
  Briefcase,
  Layers,
  ShoppingBag,
  Box,
  Wrench,
  GraduationCap,
  Award,
  Activity,
  DollarSign,
  FileText,
  Bell,
  ShieldCheck,
  Settings,
} from "lucide-react";
import { ROUTES } from "./routes";
import type { NavSection } from "@/types/navigation";

export const MAIN_NAVIGATION: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: ROUTES.DASHBOARD,
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "People & HR",
    items: [
      {
        title: "Organization",
        href: ROUTES.ORGANIZATION,
        icon: Building2,
        requiredPermissions: ["org:read"],
      },
      {
        title: "Employees",
        href: ROUTES.EMPLOYEES,
        icon: Users,
        requiredPermissions: ["employees.view", "employee:read"],
      },
      {
        title: "Attendance",
        href: ROUTES.ATTENDANCE,
        icon: Clock,
        requiredPermissions: ["attendance.view", "attendance:read"],
      },
      {
        title: "Leave Management",
        href: ROUTES.LEAVE,
        icon: CalendarDays,
        requiredPermissions: ["leave.view", "leave:read"],
      },
      {
        title: "Training",
        href: ROUTES.TRAINING,
        icon: GraduationCap,
        requiredPermissions: ["training.view", "training.enroll", "training.create", "training.manage"],
      },
      {
        title: "Internships",
        href: ROUTES.INTERNSHIPS,
        icon: Award,
        requiredPermissions: ["internships.view", "internships.create", "internships.manage"],
      },
    ],
  },
  {
    title: "Operations & Work",
    items: [
      {
        title: "Clients",
        href: ROUTES.CLIENTS,
        icon: Briefcase,
        requiredPermissions: ["clients.view"],
      },
      {
        title: "Projects",
        href: ROUTES.PROJECTS,
        icon: Layers,
        requiredPermissions: ["projects.view", "project:read"],
      },
      {
        title: "Procurement",
        href: ROUTES.PROCUREMENT,
        icon: ShoppingBag,
        requiredPermissions: ["procurement.view", "procurement.create", "purchase_orders.view"],
      },
      {
        title: "Assets",
        href: ROUTES.ASSETS,
        icon: Box,
        requiredPermissions: ["assets.view", "assets.create", "assets.assign"],
      },
      {
        title: "Maintenance",
        href: ROUTES.MAINTENANCE,
        icon: Wrench,
        requiredPermissions: ["maintenance.view", "maintenance.create", "maintenance.update"],
      },
      {
        title: "Operations",
        href: ROUTES.OPERATIONS,
        icon: Activity,
        requiredPermissions: ["operations.view", "operations.create", "operations.manage"],
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        title: "Finance",
        href: ROUTES.FINANCE,
        icon: DollarSign,
        requiredPermissions: ["finance.view", "finance:read"],
      },
      {
        title: "Documents",
        href: ROUTES.DOCUMENTS,
        icon: FileText,
        requiredPermissions: ["documents.view"],
      },
      {
        title: "Notifications",
        href: ROUTES.NOTIFICATIONS,
        icon: Bell,
      },
      {
        title: "Audit Logs",
        href: ROUTES.AUDIT_LOGS,
        icon: ShieldCheck,
        requiredPermissions: ["audit_logs.view"],
      },
      {
        title: "Settings",
        href: ROUTES.SETTINGS,
        icon: Settings,
        requiredPermissions: ["settings:read"],
      },
    ],
  },
];
