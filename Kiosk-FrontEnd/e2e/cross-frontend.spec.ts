import { expect, test, type Page } from "@playwright/test";

const dashboardUrl = process.env.VMS_E2E_DASHBOARD_URL ?? "http://127.0.0.1:3000";
const kioskUrl = process.env.VMS_E2E_KIOSK_URL ?? "http://127.0.0.1:3001";
const apiUrl = (process.env.VMS_E2E_API_URL ?? "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
const hostEmail = process.env.VMS_E2E_HOST_EMAIL;
const hostPassword = process.env.VMS_E2E_HOST_PASSWORD;
const adminEmail = process.env.VMS_E2E_ADMIN_EMAIL;
const adminPassword = process.env.VMS_E2E_ADMIN_PASSWORD;

function requireTestAccounts() {
  const missing = [
    ["VMS_E2E_HOST_EMAIL", hostEmail],
    ["VMS_E2E_HOST_PASSWORD", hostPassword],
    ["VMS_E2E_ADMIN_EMAIL", adminEmail],
    ["VMS_E2E_ADMIN_PASSWORD", adminPassword],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new Error(`Configure test-only accounts first: ${missing.join(", ")}`);
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${dashboardUrl}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Authenticate Portal" }).click();
}

async function dashboardVisits(page: Page) {
  return page.evaluate(async (root) => {
    const token = localStorage.getItem("visitorhub_access_token");
    const response = await fetch(`${root}/visits?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Visit verification failed: ${response.status}`);
    return response.json();
  }, apiUrl) as Promise<
    Array<{ id: string; visitor_name: string; status: string; pass_code: string | null }>
  >;
}

test("host, administrator, and kiosk share the persisted visit lifecycle", async ({ browser }) => {
  requireTestAccounts();
  const hostContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const kioskContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const adminPage = await adminContext.newPage();
  const kioskPage = await kioskContext.newPage();
  const apiFailures: string[] = [];
  for (const page of [hostPage, adminPage, kioskPage]) {
    page.on("pageerror", (error) => apiFailures.push(`page error: ${error.message}`));
    page.on("requestfailed", (request) => {
      if (request.url().startsWith(apiUrl))
        apiFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
    });
  }

  try {
    // Guarded routing and invalid credentials use the actual login screen.
    await hostPage.goto(`${dashboardUrl}/host`);
    await expect(hostPage).toHaveURL(/\/login$/);
    await hostPage.locator('input[type="email"]').fill(`invalid-${Date.now()}@example.com`);
    await hostPage.locator('input[type="password"]').fill("wrong-test-password");
    await hostPage.getByRole("button", { name: "Authenticate Portal" }).click();
    await expect(hostPage.getByText("Email or password is incorrect")).toBeVisible();

    // Host creates a uniquely named request in the dashboard.
    const visitorName = `E2E Visitor ${Date.now()}`;
    await login(hostPage, hostEmail!, hostPassword!);
    await expect(hostPage).toHaveURL(/\/host$/);
    await hostPage.getByRole("button", { name: /Invite Visitor/ }).click();
    await hostPage.getByPlaceholder("e.g. Elena Rostova").fill(visitorName);
    await hostPage.getByPlaceholder("elena@domain.com").fill(`e2e-${Date.now()}@example.com`);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await hostPage.locator('input[type="date"]').fill(tomorrow.toISOString().slice(0, 10));
    await hostPage.locator('input[type="time"]').fill("10:00");
    await hostPage
      .getByPlaceholder("e.g. Q3 Architecture Milestone Review")
      .fill("Cross-frontend smoke test");
    await hostPage.getByRole("button", { name: "Submit Invitation & Request Pass" }).click();
    await expect(hostPage.getByText(visitorName, { exact: true })).toBeVisible();

    // A different browser context authenticates as an administrator and approves it.
    await login(adminPage, adminEmail!, adminPassword!);
    await expect(adminPage).toHaveURL(/\/site-admin$/);
    const queue = adminPage
      .getByRole("heading", { name: "Access Clearance Queue" })
      .locator("xpath=../../..");
    const requestCard = queue
      .getByText(visitorName, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await expect(requestCard.getByRole("button", { name: "Approve Pass" })).toBeVisible();
    await requestCard.getByRole("button", { name: "Approve Pass" }).click();
    await expect
      .poll(
        async () =>
          (await dashboardVisits(adminPage)).find((row) => row.visitor_name === visitorName)
            ?.status,
      )
      .toBe("scheduled");

    // The host's independent session refreshes the approved state and exposes the real pass code.
    const hostRequest = hostPage
      .getByText(visitorName, { exact: true })
      .last()
      .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(hostRequest.getByText("Approved", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await hostRequest.getByRole("button", { name: "View QR" }).click();
    const passCode = (await hostPage.getByTestId("pass-code").textContent())?.trim();
    expect(passCode).toBeTruthy();

    // The kiosk uses its own browser context and validates/checks in through its UI.
    await kioskPage.goto(kioskUrl);
    await kioskPage.getByRole("button", { name: /Sign in/ }).click();
    await kioskPage.getByRole("button", { name: /Enter pass code instead/ }).click();
    await kioskPage.getByLabel("Visitor pass code").fill(passCode!);
    await kioskPage.getByRole("button", { name: "Verify" }).click();
    await expect(kioskPage.getByRole("button", { name: /Print my badge/ })).toBeVisible();
    await kioskPage.getByRole("button", { name: /Print my badge/ }).click();
    await kioskPage.getByRole("button", { name: "I have my badge" }).click();
    await expect(kioskPage.getByText("You are signed in.")).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(
        async () =>
          (await dashboardVisits(adminPage)).find((row) => row.visitor_name === visitorName)
            ?.status,
      )
      .toBe("checked-in");
    await adminPage.reload();
    await expect(
      adminPage
        .getByText(visitorName, { exact: true })
        .last()
        .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
        .getByText("Checked In", { exact: true }),
    ).toBeVisible();

    // The visitor uses the kiosk sign-out UI for the same pass.
    await kioskPage.getByRole("button", { name: "Done" }).click();
    await kioskPage.getByRole("button", { name: /Sign out/ }).click();
    await kioskPage.getByRole("button", { name: /Enter pass code instead/ }).click();
    await kioskPage.getByLabel("Visitor pass code").fill(passCode!);
    await kioskPage.getByRole("button", { name: "Verify" }).click();
    await kioskPage.getByRole("button", { name: "I am done with my visit" }).click();
    for (const digit of "123456")
      await kioskPage.getByRole("button", { name: digit, exact: true }).click();
    await expect(kioskPage.getByRole("button", { name: "Confirm sign-out" })).toBeVisible();
    await kioskPage.getByRole("button", { name: "Confirm sign-out" }).click();
    await expect(
      kioskPage.getByText(new RegExp(`Thank you for visiting, ${visitorName.split(" ")[0]}`)),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await dashboardVisits(adminPage)).find((row) => row.visitor_name === visitorName)
            ?.status,
      )
      .toBe("checked-out");
    await adminPage.reload();
    await expect(
      adminPage
        .getByText(visitorName, { exact: true })
        .last()
        .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
        .getByText("Checked Out", { exact: true }),
    ).toBeVisible();

    // Invalid pass is rejected through the kiosk UI and does not create a backend visit.
    await kioskPage.getByRole("button", { name: "Done" }).click();
    await kioskPage.getByRole("button", { name: /Sign in/ }).click();
    await kioskPage.getByRole("button", { name: /Enter pass code instead/ }).click();
    await kioskPage.getByLabel("Visitor pass code").fill("invalid-pass-code-1234567890");
    await kioskPage.getByRole("button", { name: "Verify" }).click();
    await expect(kioskPage.getByText("We could not find this pass.")).toBeVisible();

    expect(apiFailures, apiFailures.join("\n")).toEqual([]);
  } finally {
    await Promise.all([hostContext.close(), adminContext.close(), kioskContext.close()]);
  }
});

test("kiosk walk-in is persisted pending until an administrator approves it", async ({
  browser,
}) => {
  requireTestAccounts();
  const kioskContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const kioskPage = await kioskContext.newPage();
  const adminPage = await adminContext.newPage();
  // Keep the name short because the kiosk intentionally accepts input through
  // its on-screen keyboard and returns home after 45 seconds without approval.
  const visitorName = "Walk In QA";
  const employeeSuffix =
    process.env.VMS_E2E_HOST_EMPLOYEE_SUFFIX ?? process.env.VMS_E2E_HOST_EMPLOYEE_ID?.slice(-4);
  if (!employeeSuffix || !/^\d{4}$/.test(employeeSuffix)) {
    throw new Error(
      "Set VMS_E2E_HOST_EMPLOYEE_SUFFIX to the four digit suffix for a configured kiosk host.",
    );
  }

  try {
    await adminPage.goto(`${dashboardUrl}/login`);
    await adminPage.locator('input[type="email"]').fill(adminEmail!);
    await adminPage.locator('input[type="password"]').fill(adminPassword!);
    await adminPage.getByRole("button", { name: "Authenticate Portal" }).click();
    await expect(adminPage).toHaveURL(/\/site-admin$/);

    await kioskPage.goto(kioskUrl);
    await kioskPage.getByRole("button", { name: /Walk-in/ }).click();
    for (const character of visitorName.toUpperCase()) {
      const key = character === " " ? "space" : character;
      await kioskPage.getByRole("button", { name: key, exact: true }).click();
    }
    await kioskPage.getByRole("button", { name: "Next", exact: true }).click();
    await kioskPage.getByRole("button", { name: "Mobile number" }).click();
    for (const digit of "9845012345")
      await kioskPage.getByRole("button", { name: digit, exact: true }).click();
    await kioskPage.getByRole("button", { name: "Next field" }).click();
    await kioskPage.getByRole("button", { name: "Continue", exact: true }).first().click();
    await kioskPage.getByRole("button", { name: "Meeting", exact: true }).click();
    await kioskPage.getByRole("button", { name: "Continue", exact: true }).first().click();
    for (const digit of employeeSuffix)
      await kioskPage.getByRole("button", { name: digit, exact: true }).click();
    await kioskPage.getByRole("button", { name: "Look up host" }).click();
    await expect(kioskPage.getByText("Employee found")).toBeVisible();
    await kioskPage.getByRole("button", { name: /Yes, this is my host/ }).click();
    await kioskPage.getByRole("button", { name: /I agree to the privacy notice/ }).click();
    await kioskPage
      .getByRole("button", { name: /I agree to the non-disclosure agreement/ })
      .click();
    await kioskPage.getByRole("button", { name: "Continue", exact: true }).click();
    await kioskPage.getByRole("button", { name: "Submit" }).click();
    await expect(kioskPage.getByText("Waiting for approval")).toBeVisible();

    // The dashboard does not poll the queue continuously; refresh it after the
    // kiosk has persisted the request so the newly created row is loaded.
    await adminPage.reload();
    await expect(adminPage).toHaveURL(/\/site-admin$/);
    const queue = adminPage
      .getByRole("heading", { name: "Access Clearance Queue" })
      .locator("xpath=../../..");
    const requestCard = queue
      .getByText(visitorName, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await expect(requestCard.getByRole("button", { name: "Approve Pass" })).toBeVisible();
    await requestCard.getByRole("button", { name: "Approve Pass" }).click();
    await expect(kioskPage.getByText("Your visit is approved.")).toBeVisible({ timeout: 20_000 });
  } finally {
    await Promise.all([kioskContext.close(), adminContext.close()]);
  }
});
