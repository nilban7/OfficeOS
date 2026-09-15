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
        requiredPermissions: ["employee:read"],
      },
      {
        title: "Attendance",
        href: ROUTES.ATTENDANCE,
        icon: Clock,
        requiredPermissions: ["attendance:read"],
      },
      {
        title: "Leave Management",
        href: ROUTES.LEAVE,
        icon: CalendarDays,
        requiredPermissions: ["leave:read"],
      },
      {
        title: "Training",
        href: ROUTES.TRAINING,
        icon: GraduationCap,
      },
      {
        title: "Internships",
        href: ROUTES.INTERNSHIPS,
        icon: Award,
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
      },
      {
        title: "Projects",
        href: ROUTES.PROJECTS,
        icon: Layers,
        requiredPermissions: ["project:read"],
      },
      {
        title: "Procurement",
        href: ROUTES.PROCUREMENT,
        icon: ShoppingBag,
      },
      {
        title: "Assets",
        href: ROUTES.ASSETS,
        icon: Box,
      },
      {
        title: "Maintenance",
        href: ROUTES.MAINTENANCE,
        icon: Wrench,
      },
      {
        title: "Operations",
        href: ROUTES.OPERATIONS,
        icon: Activity,
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
        requiredPermissions: ["finance:read"],
      },
      {
        title: "Documents",
        href: ROUTES.DOCUMENTS,
        icon: FileText,
      },
      {
        title: "Notifications",
        href: ROUTES.NOTIFICATIONS,
        icon: Bell,
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
