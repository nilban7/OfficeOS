"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { PlatformAnnouncementBanner } from "@/components/admin/announcement-banner";
import { useAuth } from "@/hooks/use-auth";
import { LoadingState } from "@/components/feedback/loading-state";
import { OrganizationProvider } from "@/hooks/use-organization";
import { ROUTES } from "@/constants/routes";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(ROUTES.LOGIN);
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return <LoadingState fullPage message="Authenticating session..." />;
  }

  return (
    <OrganizationProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <AppSidebar />

      {/* Main Content Area */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        <AppHeader />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <PlatformAnnouncementBanner />
          {children}
        </main>
      </div>
    </div>
    </OrganizationProvider>
  );
}
