import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/auth-provider";

export const metadata: Metadata = {
  title: "OfficeOS — Multi-Tenant Office Management System",
  description: "Enterprise SaaS platform for organizations, HR, operations, and finance management.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-primary-500 selection:text-white">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
