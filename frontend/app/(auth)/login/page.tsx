import { LoginForm } from "@/components/auth/login-form";
import Link from "next/link";
import { Building2 } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="mb-6 text-center">
        <Link href="/" className="inline-flex items-center space-x-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white shadow-md">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="text-left">
            <span className="font-bold text-2xl text-slate-900 tracking-tight block leading-tight">OfficeOS</span>
            <span className="text-[10px] text-primary-600 font-semibold uppercase tracking-wider block">Enterprise Workspace</span>
          </div>
        </Link>
      </div>

      <LoginForm />
    </div>
  );
}
