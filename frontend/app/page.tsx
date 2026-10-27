"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  ShieldCheck,
  Zap,
  ArrowRight,
  Layers,
  Clock,
  CheckCircle2,
  LayoutDashboard,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Automatically transition authenticated users directly to their dashboard
  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(ROUTES.DASHBOARD);
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-primary-500 selection:text-white">
      {/* Top Navigation */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-indigo-700 text-white shadow-sm shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="flex items-center">
              <span className="font-bold text-lg sm:text-xl text-slate-900 tracking-tight">OfficeOS</span>
              <span className="ml-2 rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 uppercase tracking-wider">
                SaaS
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            {isAuthenticated ? (
              <Link href={ROUTES.DASHBOARD}>
                <Button size="sm" className="min-h-[40px] flex items-center gap-1.5 shadow-sm">
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Go to Dashboard</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href={ROUTES.LOGIN} className="hidden xs:inline-block">
                  <Button variant="outline" size="sm" className="min-h-[40px] text-xs sm:text-sm">
                    Sign In
                  </Button>
                </Link>
                <Link href={ROUTES.LOGIN}>
                  <Button size="sm" className="min-h-[40px] flex items-center gap-1.5 shadow-sm text-xs sm:text-sm">
                    <LogIn className="h-3.5 w-3.5 xs:hidden" />
                    <span>Enter App</span>
                    <ArrowRight className="hidden xs:inline-block h-3.5 w-3.5" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 pb-16 sm:pb-20 text-center">
          <div className="inline-flex items-center space-x-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 mb-6 max-w-full">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Multi-Tenant Platform with Strict Organization Isolation</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight max-w-4xl mx-auto leading-tight">
            The Modern Operating System for <span className="text-primary-600">Offices & Teams</span>
          </h1>

          <p className="mt-4 sm:mt-6 text-base sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed px-2">
            Manage your organization, employees, attendance, leave, projects, finance, and operations in a single, unified enterprise platform.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto sm:max-w-none">
            <Link href={isAuthenticated ? ROUTES.DASHBOARD : ROUTES.LOGIN} className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto min-h-[46px] text-base shadow-sm">
                {isAuthenticated ? "Launch Dashboard" : "Get Started / Sign In"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href={ROUTES.DASHBOARD} className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full sm:w-auto min-h-[46px] text-base">
                Explore Dashboard Demo
              </Button>
            </Link>
          </div>

          {/* Feature Highlights Grid */}
          <div className="mt-14 sm:mt-20 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 text-left">
            <Card className="border-slate-200 shadow-sm hover:border-slate-300 transition-all bg-white">
              <CardContent className="p-5 sm:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-600 mb-4">
                  <Users className="h-5 w-5" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900">People & Organization</h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Centralized directory for departments, positions, employee profiles, and multi-tenant access controls.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm hover:border-slate-300 transition-all bg-white">
              <CardContent className="p-5 sm:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 mb-4">
                  <Clock className="h-5 w-5" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900">Attendance & Leave</h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Real-time clock in/out, automated work hours calculation, WebAuthn mobile biometrics, and multi-stage approval workflows.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm hover:border-slate-300 transition-all bg-white">
              <CardContent className="p-5 sm:p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 mb-4">
                  <Layers className="h-5 w-5" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900">Operations & Projects</h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Complete client management, project milestones, procurement pipelines, and asset lifecycle tracking.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Architecture Pillars */}
          <div className="mt-12 sm:mt-16 rounded-2xl bg-white border border-slate-200 p-5 sm:p-8 shadow-sm text-left">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4 flex items-center">
              <Zap className="mr-2 h-5 w-5 text-amber-500 shrink-0" />
              <span>Built for Enterprise Reliability</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Next.js & App Router</h4>
                  <p className="text-xs text-slate-500">Modern, reactive UI with mobile optimization</p>
                </div>
              </div>
              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">FastAPI Backend</h4>
                  <p className="text-xs text-slate-500">High-performance async Python APIs</p>
                </div>
              </div>
              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Supabase Auth & RLS</h4>
                  <p className="text-xs text-slate-500">Secure auth tokens & PostgreSQL RLS</p>
                </div>
              </div>
              <div className="flex items-start space-x-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">WebAuthn Biometrics</h4>
                  <p className="text-xs text-slate-500">Native Android & iOS fingerprint sensor support</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3 text-center sm:text-left">
          <p>© {new Date().getFullYear()} OfficeOS. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
            <span>Next.js App Router</span>
            <span>•</span>
            <span>FastAPI Backend</span>
            <span>•</span>
            <span>Supabase Auth</span>
            <span>•</span>
            <span>Mobile Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
