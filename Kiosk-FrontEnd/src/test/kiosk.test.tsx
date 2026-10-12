import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KioskProvider, useKiosk, type Screen, type Session } from "@/kiosk/store";
import { CurrentScreen } from "@/kiosk/screens";
import { PointerProvider } from "@/kiosk/pointer";
import { FAQS, FAQ_CATEGORIES } from "@/kiosk/faq-data";
import { EMPLOYEES, PASSES } from "@/kiosk/data";
import { useEffect } from "react";

vi.mock("@/kiosk/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/kiosk/api")>();
  const { EMPLOYEES: employeeFixtures } = await import("@/kiosk/data");
  return {
    ...actual,
    searchKioskHosts: vi.fn(async () => employeeFixtures.map((host) => ({
      id: host.id,
      employee_id: host.employeeId || "",
      name: host.name,
      department: host.dept,
      site_id: "test-site",
    }))),
  };
});

function KioskTestHarness({
  initialScreen,
  sessionPatch,
}: {
  initialScreen?: Screen;
  sessionPatch?: Partial<Session>;
}) {
  const { go, update } = useKiosk();
  useEffect(() => {
    if (sessionPatch) update(sessionPatch);
    if (initialScreen) go(initialScreen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <CurrentScreen />;
}

function renderKiosk(props?: { initialScreen?: Screen; sessionPatch?: Partial<Session> }) {
  return render(
    <PointerProvider>
      <KioskProvider>
        <KioskTestHarness {...props} />
      </KioskProvider>
    </PointerProvider>,
  );
}

describe("Kiosk Suite", () => {
  it("renders Home screen with 3 primary cards and FAQs in footer", () => {
    renderKiosk();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByText("Walk-in")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
    // FAQ button in footer (not a 4th big card)
    expect(screen.getByRole("button", { name: /faqs/i })).toBeInTheDocument();
  });

  it("has rich pass data for VIS-1001 with two-column visit details", () => {
    const vis1001 = PASSES.find((p) => p.id === "VIS-1001");
    expect(vis1001).toBeDefined();
    expect(vis1001?.hostEmployeeId).toBe("EMP-1001");
    expect(vis1001?.designation).toBe("Senior Engineer");
    expect(vis1001?.department).toBe("Engineering");
    expect(vis1001?.location).toContain("Block A");
    expect(vis1001?.extension).toBe("Ext. 4022");
    expect(vis1001?.hostStatus).toBe("In office");
    expect(vis1001?.purposeCategory).toBe("Meeting");
    expect(vis1001?.purposeDetails).toContain("Quarterly product demo");
    expect(vis1001?.bringList).toContain("Government photo ID");
    expect(vis1001?.nextStep).toContain("Floor 3");
  });

  it("renders detailed two-column 'Your visit' welcome screen for VIS-1001", () => {
    const vis1001 = PASSES.find((p) => p.id === "VIS-1001");
    renderKiosk({
      initialScreen: "si-welcome",
      sessionPatch: { pass: vis1001, name: vis1001?.name },
    });

    // Check Welcome title and print button
    expect(screen.getByText(/Welcome, Priya/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print my badge/i })).toBeInTheDocument();

    // Left Column: "Who you are meeting"
    expect(screen.getByText("Who you are meeting")).toBeInTheDocument();
    expect(screen.getByText("Arun Kumar")).toBeInTheDocument();
    expect(screen.getByText(/EMP-1001/)).toBeInTheDocument();
    expect(screen.getByText(/Senior Engineer/)).toBeInTheDocument();
    expect(screen.getByText("In office")).toBeInTheDocument();
    expect(screen.getByText(/Arun has been told you are here/i)).toBeInTheDocument();

    // Right Column: "About your visit"
    expect(screen.getByText("About your visit")).toBeInTheDocument();
    expect(
      screen.getByText(/Quarterly product demo for the engineering team/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Pre-approved")).toBeInTheDocument();
    expect(screen.getByText("1 person")).toBeInTheDocument();

    // Bottom strip: "Before you go in"
    expect(screen.getByText("Before you go in")).toBeInTheDocument();
    expect(screen.getByText(/Government photo ID/i)).toBeInTheDocument();
    expect(screen.getByText(/Please take the lift to Floor 3/i)).toBeInTheDocument();
  });

  it("handles Walk-in 'Other' purpose with required 10-200 char validation", () => {
    renderKiosk({
      initialScreen: "wi-purpose",
      sessionPatch: { name: "Rohan V", phone: "9876543210" },
    });

    // Click 'Other' purpose
    const otherChip = screen.getByRole("button", { name: "Other" });
    fireEvent.click(otherChip);

    // Label and helper
    expect(screen.getByText("Please tell us the reason for your visit")).toBeInTheDocument();
    expect(screen.getByText("A short sentence is enough.")).toBeInTheDocument();

    // Counter shows 0 / 200
    expect(screen.getByText("0 / 200")).toBeInTheDocument();

    // Continue is disabled
    const continueBtns = screen.getAllByRole("button", { name: /continue/i });
    expect(continueBtns[0]).toBeDisabled();

    // Type 1 char on virtual keyboard to trigger under 10 chars error
    const keyP = screen.getByRole("button", { name: "P" });
    fireEvent.click(keyP);
    expect(
      screen.getByText("Please add a few words so we can tell your host."),
    ).toBeInTheDocument();

    // Type rest of characters to reach >= 10 chars
    const keyR = screen.getByRole("button", { name: "R" });
    const keyO = screen.getByRole("button", { name: "O" });
    const keyJ = screen.getByRole("button", { name: "J" });
    const keyE = screen.getByRole("button", { name: "E" });
    const keyC = screen.getByRole("button", { name: "C" });
    const keyT = screen.getByRole("button", { name: "T" });
    const keySpace = screen.getByRole("button", { name: "space" });
    const keyD = screen.getByRole("button", { name: "D" });
    const keyM = screen.getByRole("button", { name: "M" });

    // "PROJECT DEM" (11 chars)
    fireEvent.click(keyP);
    fireEvent.click(keyR);
    fireEvent.click(keyO);
    fireEvent.click(keyJ);
    fireEvent.click(keyE);
    fireEvent.click(keyC);
    fireEvent.click(keyT);
    fireEvent.click(keySpace);
    fireEvent.click(keyD);
    fireEvent.click(keyE);
    fireEvent.click(keyM);

    expect(screen.getByText(/\d+\s\/\s200/)).toBeInTheDocument();
    expect(continueBtns[0]).not.toBeDisabled();
  });

  it("handles Walk-in Host search by employee ID only and displays exact match card", async () => {
    renderKiosk({
      initialScreen: "wi-host",
      sessionPatch: { purpose: "Meeting" },
    });

    expect(screen.getByText("Who are you meeting?")).toBeInTheDocument();
    expect(
      screen.getByText(/Your host can share this with you\. Example: EMP-1001\./i),
    ).toBeInTheDocument();
    expect(screen.getByText("EMP-")).toBeInTheDocument();

    // Enter EMP-1001 using numeric keypad (1, 0, 0, 1)
    const key1 = screen.getByRole("button", { name: "1" });
    const key0 = screen.getByRole("button", { name: "0" });

    fireEvent.click(key1);
    fireEvent.click(key0);
    fireEvent.click(key0);
    fireEvent.click(key1);

    // Exact match confirmation card appears
    expect(await screen.findByText("Employee found")).toBeInTheDocument();
    expect(screen.getByText("Arun Kumar")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();

    // Button to confirm
    expect(screen.getByRole("button", { name: /yes, this is my host/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /not them, search again/i })).toBeInTheDocument();
  });

  it("shows calm error on invalid employee ID and pauses after 5 attempts", async () => {
    renderKiosk({
      initialScreen: "wi-host",
      sessionPatch: { purpose: "Meeting" },
    });

    const key9 = screen.getByRole("button", { name: "9" });
    const clearBtn = screen.getByRole("button", { name: /clear/i });

    // Enter non-matching ID: 9999
    fireEvent.click(key9);
    fireEvent.click(key9);
    fireEvent.click(key9);
    fireEvent.click(key9);

    // Shows not found error with Need help
    expect(await screen.findByText(/We could not find that employee ID/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /need help\?/i })).toBeInTheDocument();

    // Perform 4 more failed attempts to reach 5
    for (let i = 0; i < 4; i++) {
      fireEvent.click(clearBtn);
      fireEvent.click(key9);
      fireEvent.click(key9);
      fireEvent.click(key9);
      fireEvent.click(key9);
      if (i < 3) await screen.findByText(/We could not find that employee ID/i);
    }

    // After 5 failed attempts: 30-second security cooldown
    expect(await screen.findByText(/Lookups paused for security/i)).toBeInTheDocument();
    expect(screen.getByText(/Multiple attempts did not match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask reception/i })).toBeInTheDocument();
  });

  it("contains 16 FAQ items covering all categories", () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(16);
    expect(FAQ_CATEGORIES).toContain("Check-in");
    expect(FAQ_CATEGORIES).toContain("Walk-in");
    expect(FAQ_CATEGORIES).toContain("Pass and QR");
    expect(FAQ_CATEGORIES).toContain("Sign-out");
    expect(FAQ_CATEGORIES).toContain("Badge");
    expect(FAQ_CATEGORIES).toContain("Help");
  });

  it("can navigate to FAQs screen, search questions, filter categories, and toggle accordion", () => {
    renderKiosk();
    const faqBtn = screen.getByRole("button", { name: /faqs/i });
    fireEvent.click(faqBtn);

    expect(screen.getByText("Frequently asked questions")).toBeInTheDocument();
    expect(screen.getByText("How do I check in with an invitation?")).toBeInTheDocument();

    // First question is open by default: answer and receptionist link are visible
    expect(screen.getByText(/Tap 'Sign in' on the home screen/i)).toBeInTheDocument();
    expect(screen.getByText(/Still need help\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /call reception/i })).toBeInTheDocument();

    // Clicking second question closes the first and opens the second
    const secondQuestionBtn = screen.getByRole("button", {
      name: /i do not have an invitation\. what should i do\?/i,
    });
    fireEvent.click(secondQuestionBtn);
    expect(screen.getByText(/Tap 'Walk-in' on the home screen/i)).toBeInTheDocument();
    expect(screen.queryByText(/Tap 'Sign in' on the home screen/i)).not.toBeInTheDocument();
  });

  it("renders Scan screen with laser scanner animation and QR code alignment guide", () => {
    renderKiosk({ initialScreen: "si-scan" });
    expect(screen.getByText("Scan your pass")).toBeInTheDocument();
    expect(screen.getByText("Hold your QR code in front of the camera.")).toBeInTheDocument();
    expect(screen.getByText("Align QR Code")).toBeInTheDocument();
    expect(document.querySelector(".animate-laser-scan")).toBeInTheDocument();
    expect(document.querySelector(".laser-line-blue")).toBeInTheDocument();
  });
});
