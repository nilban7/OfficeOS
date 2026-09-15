import type { LucideIcon } from "lucide-react";
import type { Permission, UserRole } from "./organization";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
  disabled?: boolean;
  requiredPermissions?: Permission[];
  requiredRoles?: UserRole[];
  external?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}
