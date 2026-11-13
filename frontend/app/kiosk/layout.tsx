import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export const metadata: Metadata = {
  title: "OsOffice Kiosk Terminal",
  description: "Touch Attendance Terminal & Mobile Biometric Scanner",
  manifest: "/kiosk-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OsOffice Kiosk",
  },
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] w-full overflow-hidden select-none touch-manipulation overscroll-none bg-slate-50 dark:bg-slate-950">
      {children}
    </div>
  );
}
