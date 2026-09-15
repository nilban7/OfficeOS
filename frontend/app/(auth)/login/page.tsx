import { LoginForm } from "@/components/auth/login-form";
import Link from "next/link";
import { Building2 } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="mb-6 text-center">
        <Link href="/" className="inline-flex items-center space-x-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white shadow-md">
            <Building2 className="h-6 w-6" />
          </div>
          <span className="font-bold text-2xl text-slate-900 tracking-tight">OfficeOS</span>
        </Link>
      </div>

      <LoginForm />
    </div>
  );
}
