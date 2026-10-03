import { redirect } from "next/navigation";
import { ROUTES } from "@/constants/routes";

export default function OrganizationRedirectPage() {
  redirect(ROUTES.SETTINGS_ORGANIZATION);
}
