import { redirect } from "next/navigation";
import { ROUTES } from "@/constants/routes";

export default function SettingsRedirectPage() {
  redirect(ROUTES.SETTINGS_ORGANIZATION);
}
