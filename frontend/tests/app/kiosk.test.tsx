import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KioskPage from "@/app/kiosk/page";
import { apiClient } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("KioskPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders activation screen when terminal is not yet paired", async () => {
    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByText("OfficeOS Kiosk Terminal")).toBeDefined();
      expect(screen.getAllByText("Secret Activation Code").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /Pair.*Activate Tablet/i })).toBeDefined();
    });
  });

  it("pairs tablet successfully when valid activation code is entered", async () => {
    const user = userEvent.setup();
    (apiClient.post as unknown as { mockResolvedValue: (val: unknown) => void }).mockResolvedValue({
      data: {
        kiosk_token: "mock-kiosk-token-123",
        kiosk_id: "kiosk-1",
        organization_id: "org-1",
        organization_name: "Acme Global",
        device_name: "Front Desk Tablet",
        allowed_modes: ["pin", "face", "qr"],
        exit_pin: "9999",
      },
    });

    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("e.g. OS-7241-98")).toBeDefined();
    });

    const codeInput = screen.getByPlaceholderText("e.g. OS-7241-98");
    await user.type(codeInput, "OS-8492-71");

    const pairBtn = screen.getByRole("button", { name: /Pair.*Activate Tablet/i });
    await user.click(pairBtn);

    await waitFor(() => {
      expect(localStorage.getItem("officeos_kiosk_token")).toBe("mock-kiosk-token-123");
      expect(screen.getByText("Acme Global")).toBeDefined();
      expect(screen.getByRole("button", { name: /Check In/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /Check Out/i })).toBeDefined();
    });
  });

  it("renders standby terminal directly when token is already in localStorage", async () => {
    localStorage.setItem("officeos_kiosk_token", "saved-token-abc");
    localStorage.setItem("officeos_kiosk_org_name", "Cyberdyne Systems");
    localStorage.setItem("officeos_kiosk_device_name", "East Wing Terminal");

    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByText("Cyberdyne Systems")).toBeDefined();
      expect(screen.getByText(/East Wing Terminal/)).toBeDefined();
      expect(screen.getByRole("button", { name: /Check In/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /Check Out/i })).toBeDefined();
    });
  });

  it("pairs tablet with DEMO-2026 falling back locally when network fails", async () => {
    const user = userEvent.setup();
    (apiClient.post as unknown as { mockRejectedValueOnce: (err: unknown) => void }).mockRejectedValueOnce(
      new Error("Network Error")
    );

    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByText("DEMO-2026")).toBeDefined();
    });

    const codeInput = screen.getByPlaceholderText("e.g. OS-7241-98");
    await user.type(codeInput, "DEMO-2026");

    const pairBtn = screen.getByRole("button", { name: /Pair.*Activate Tablet/i });
    await user.click(pairBtn);

    await waitFor(() => {
      expect(localStorage.getItem("officeos_kiosk_token")).toBe("kiosk_demo_token_master_2026");
      expect(screen.getByText("OfficeOS Demo Workspace")).toBeDefined();
      expect(screen.getByRole("button", { name: /Check In/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /Check Out/i })).toBeDefined();
    });
  });

  it("renders the 4 organization employees on standby terminal", async () => {
    localStorage.setItem("officeos_kiosk_token", "kiosk-token-active");
    localStorage.setItem("officeos_kiosk_org_name", "Niladri Organization Workflow");
    localStorage.setItem("officeos_kiosk_device_name", "Reception Mobile PWA");

    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByText("Niladri Banerjee")).toBeDefined();
      expect(screen.getByText("EMP-NIL-001")).toBeDefined();
      expect(screen.getByText("Aritra Das")).toBeDefined();
      expect(screen.getByText("EMP-NIL-002")).toBeDefined();
      expect(screen.getByText("Sarah Connor")).toBeDefined();
      expect(screen.getByText("EMP-NIL-003")).toBeDefined();
      expect(screen.getByText("Rudranil Das")).toBeDefined();
      expect(screen.getByText("EMP-NIL-004")).toBeDefined();
    });
  });

  it("handles first-time biometric enrollment and subsequent fingerprint punch", async () => {
    const user = userEvent.setup();
    localStorage.setItem("officeos_kiosk_token", "kiosk-token-active");
    localStorage.setItem("officeos_kiosk_org_name", "Niladri Organization Workflow");

    (apiClient.post as unknown as { mockResolvedValue: (val: unknown) => void }).mockResolvedValue({
      data: {
        success: true,
        message: "Check-in verified successfully for Niladri Banerjee.",
        punch_type: "check_in",
        employee_id: "00000000-0000-0000-0000-000000000041",
        employee_name: "Niladri Banerjee",
        employee_code: "EMP-NIL-001",
        punched_at: "09:00 AM",
        verification_method: "fingerprint",
      },
    });

    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByText("Niladri Banerjee")).toBeDefined();
    });

    // 1. Click on Niladri Banerjee card (un-enrolled) -> opens First-time Enrollment modal
    await user.click(screen.getByText("Niladri Banerjee"));

    await waitFor(() => {
      expect(screen.getByText("First-Time Fingerprint Setup")).toBeDefined();
      expect(screen.getAllByText("Niladri Banerjee").length).toBeGreaterThan(0);
    });

    // 2. Click Enroll Finger
    const enrollBtn = screen.getByRole("button", { name: /Enroll Finger/i });
    await user.click(enrollBtn);

    // 3. Confirm biometric record was stored in localStorage
    await waitFor(() => {
      const bios = JSON.parse(localStorage.getItem("officeos_kiosk_biometrics") || "{}");
      expect(bios["EMP-NIL-001"]).toBeDefined();
      expect(bios["EMP-NIL-001"].employeeCode).toBe("EMP-NIL-001");
    });
  });

  it("requires Master Manager PIN (9999) before unlocking biometric management", async () => {
    const user = userEvent.setup();
    localStorage.setItem("officeos_kiosk_token", "kiosk-token-active");
    localStorage.setItem("officeos_kiosk_org_name", "Niladri Organization");

    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByText("Niladri Banerjee")).toBeDefined();
    });

    // Click Manage Biometrics in footer
    const manageBioBtn = screen.getByRole("button", { name: /Manage Biometrics/i });
    await user.click(manageBioBtn);

    // Should open Manager Security Authentication modal
    await waitFor(() => {
      expect(screen.getByText("Manager Security Authentication")).toBeDefined();
      expect(screen.getByPlaceholderText("Enter 9999")).toBeDefined();
    });

    // Attempting wrong PIN
    const pinInput = screen.getByPlaceholderText("Enter 9999");
    await user.type(pinInput, "1234");
    const unlockBtn = screen.getByRole("button", { name: /Unlock Manager Panel/i });
    await user.click(unlockBtn);

    await waitFor(() => {
      expect(screen.getByText(/Incorrect Master Exit PIN/i)).toBeDefined();
    });

    // Entering correct PIN: 9999
    await user.clear(pinInput);
    await user.type(pinInput, "9999");
    await user.click(unlockBtn);

    // Should unlock Manager Panel
    await waitFor(() => {
      expect(screen.getByText("Manager Access Unlocked")).toBeDefined();
      expect(screen.getByText("Reset All Biometrics")).toBeDefined();
    });
  });

  it("successfully punches attendance when touching sensor and displays live Clocked In badge", async () => {
    const user = userEvent.setup();
    localStorage.setItem("officeos_kiosk_token", "kiosk-token-active");
    localStorage.setItem("officeos_kiosk_org_name", "Niladri Organization");
    localStorage.setItem(
      "officeos_kiosk_biometrics",
      JSON.stringify({
        "EMP-NIL-001": {
          credentialId: "bio-niladri",
          enrolledAt: new Date().toISOString(),
          employeeCode: "EMP-NIL-001",
          employeeName: "Niladri Banerjee",
          fingerLabel: "Fingerprint",
        },
      })
    );

    (apiClient.post as unknown as { mockResolvedValue: (val: unknown) => void }).mockResolvedValue({
      data: {
        success: true,
        message: "Check-in verified successfully for Niladri Banerjee.",
        punch_type: "in",
        employee_id: "00000000-0000-0000-0000-000000000041",
        employee_name: "Niladri Banerjee",
        employee_code: "EMP-NIL-001",
        department: "Executive Management",
        punched_at: "09:30 AM",
        verification_method: "fingerprint",
      },
    });

    render(<KioskPage />);

    await waitFor(() => {
      expect(screen.getByText("Niladri Banerjee")).toBeDefined();
    });

    // Click Niladri Banerjee card (enrolled) -> opens verification modal
    await user.click(screen.getByText("Niladri Banerjee"));

    await waitFor(() => {
      expect(screen.getByText("Verify Check In")).toBeDefined();
      expect(screen.getByRole("button", { name: /Touch Phone Sensor/i })).toBeDefined();
    });

    // Touch sensor button
    const sensorBtn = screen.getByRole("button", { name: /Touch Phone Sensor/i });
    await user.click(sensorBtn);

    // Punch Success card should appear with details and countdown
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.stringContaining("/attendance/punch"),
        expect.anything(),
        expect.anything()
      );
      expect(screen.getByText(/Check-In Verified!/i)).toBeDefined();
      expect(screen.getAllByText("EMP-NIL-001").length).toBeGreaterThan(0);
      expect(screen.getByText(/Returning to standby in/i)).toBeDefined();
    });

    // Close or return to standby
    const returnBtn = screen.getByRole("button", { name: /Return to Standby Now/i });
    await user.click(returnBtn);

    // Standby screen should now show Clocked In badge on Niladri's card
    await waitFor(() => {
      expect(screen.getByText(/Clocked In • 09:30 AM/i)).toBeDefined();
    });
  });
});

