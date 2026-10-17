import { expect, test, type Browser, type Page } from "@playwright/test";

const dashboardUrl = process.env.VMS_E2E_DASHBOARD_URL ?? "http://127.0.0.1:3000";
const kioskUrl = process.env.VMS_E2E_KIOSK_URL ?? "http://127.0.0.1:3001";
const apiUrl = (process.env.VMS_E2E_API_URL ?? "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
const hostEmail = process.env.VMS_E2E_HOST_EMAIL;
const hostPassword = process.env.VMS_E2E_HOST_PASSWORD;
const adminEmail = process.env.VMS_E2E_ADMIN_EMAIL;
const adminPassword = process.env.VMS_E2E_ADMIN_PASSWORD;
const superadminEmail = process.env.VMS_E2E_SUPERADMIN_EMAIL;
const superadminPassword = process.env.VMS_E2E_SUPERADMIN_PASSWORD;
const siteId = process.env.VMS_E2E_SITE_ID;

function requireTestAccounts() {
  const missing = [
    ["VMS_E2E_HOST_EMAIL", hostEmail],
    ["VMS_E2E_HOST_PASSWORD", hostPassword],
    ["VMS_E2E_ADMIN_EMAIL", adminEmail],
    ["VMS_E2E_ADMIN_PASSWORD", adminPassword],
    ["VMS_E2E_SUPERADMIN_EMAIL", superadminEmail],
    ["VMS_E2E_SUPERADMIN_PASSWORD", superadminPassword],
    ["VMS_E2E_SITE_ID", siteId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new Error(`Configure test-only accounts first: ${missing.join(", ")}`);
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${dashboardUrl}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Sign in/ }).click();
}

type PairedDevice = { key: string; siteId: string; siteName: string; name: string };

/** Registers a kiosk through the admin API and pairs it, exactly as an administrator would. */
async function pairDevice(): Promise<PairedDevice> {
  const json = async (path: string, body: unknown, token?: string) => {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
    return response.json();
  };
  const { access_token } = await json("/auth/login", { email: adminEmail, password: adminPassword });
  const registered = await json("/devices", { name: `E2E kiosk ${Date.now()}-${Math.random()}`, site_id: siteId }, access_token);
  const paired = await json("/kiosk/pair", { pairing_code: registered.pairing_code });
  return { key: paired.device_key, siteId: paired.device.site_id, siteName: paired.site_name, name: paired.device.name };
}

/** A browser context whose kiosk is already paired (the pairing is stored in localStorage). */
async function pairedKioskContext(browser: Browser) {
  const device = await pairDevice();
  const context = await browser.newContext();
  await context.addInitScript((value) => window.localStorage.setItem("visitorhub_kiosk_device", value), JSON.stringify(device));
  return context;
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
    Array<{ id: string; visitor_name: string; host_id: string; status: string; pass_code: string | null }>
  >;
}

async function dashboardApi(page: Page, path: string, method = "GET", body?: unknown) {
  return page.evaluate(
    async ({ root, requestPath, requestMethod, requestBody }) => {
      const token = localStorage.getItem("visitorhub_access_token");
      const response = await fetch(`${root}${requestPath}`, {
        method: requestMethod,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(requestBody ? { "Content-Type": "application/json" } : {}),
        },
        ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
      });
      return {
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
      };
    },
    { root: apiUrl, requestPath: path, requestMethod: method, requestBody: body },
  );
}

test("all demo roles restore sessions and backend permissions remain scoped", async ({
  browser,
}) => {
  requireTestAccounts();
  const superadminContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const hostContext = await browser.newContext();
  const anonymousContext = await browser.newContext();
  const superadminPage = await superadminContext.newPage();
  const adminPage = await adminContext.newPage();
  const hostPage = await hostContext.newPage();
  const anonymousPage = await anonymousContext.newPage();
  let createdAccountId: string | undefined;

  try {
    await login(superadminPage, superadminEmail!, superadminPassword!);
    await expect(superadminPage).toHaveURL(/\/super-admin$/);
    await superadminPage.reload();
    await expect(superadminPage).toHaveURL(/\/super-admin$/);
    expect((await dashboardApi(superadminPage, "/auth/me")).body.role).toBe("super-admin");
    expect((await dashboardApi(superadminPage, "/organizations")).status).toBe(200);

    // Create and then remove one synthetic Receptionist through the real account screen.
    const stamp = Date.now();
    const testName = `Temporary E2E Receptionist ${stamp}`;
    const testEmail = `e2e-receptionist-${stamp}@example.com`;
    const testPassword = `E2E-User-${stamp}-A!`;
    await superadminPage.getByRole("button", { name: "Accounts", exact: false }).click();
    await superadminPage.getByRole("button", { name: "Add account" }).click();
    await superadminPage.getByLabel("Account type").selectOption("receptionist");
    // The form selects the only provisioned site by default.
    await superadminPage.getByLabel("Full name").fill(testName);
    await superadminPage.getByLabel("Email").fill(testEmail);
    await superadminPage.getByLabel("Initial password").fill(testPassword);
    await superadminPage.getByRole("button", { name: "Create receptionist" }).click();
    await expect(superadminPage.getByText(testName, { exact: true })).toBeVisible();
    await expect
      .poll(async () => {
        const users = await dashboardApi(superadminPage, "/users");
        return users.body.find((user: { email: string }) => user.email === testEmail)?.role;
      })
      .toBe("receptionist");
    const users = await dashboardApi(superadminPage, "/users");
    const createdUser = users.body.find((user: { email: string }) => user.email === testEmail);
    createdAccountId = createdUser?.id;

    await login(adminPage, adminEmail!, adminPassword!);
    await expect(adminPage).toHaveURL(/\/site-admin$/);
    await adminPage.reload();
    expect((await dashboardApi(adminPage, "/auth/me")).body.role).toBe("site-admin");
    expect((await dashboardApi(adminPage, "/organizations")).status).toBe(403);
    expect(
      (
        await dashboardApi(adminPage, "/users", "POST", {
          email: `e2e-escalation-${Date.now()}@example.com`,
          full_name: "Rejected Escalation",
          password: "Test-Only-Password-123!",
          role: "super-admin",
          organization_id: (await dashboardApi(adminPage, "/auth/me")).body.organization_id,
          site_id: siteId,
        })
      ).status,
    ).toBe(403);

    await login(hostPage, hostEmail!, hostPassword!);
    await expect(hostPage).toHaveURL(/\/host$/);
    await hostPage.reload();
    expect((await dashboardApi(hostPage, "/auth/me")).body.role).toBe("host");
    expect((await dashboardApi(hostPage, "/users")).status).toBe(403);
    // Kiosk endpoints refuse unpaired callers; a paired kiosk finds hosts at its own site.
    const anonymousHostSearch = await hostPage.evaluate(
      async (root) => (await fetch(`${root}/kiosk/hosts?q=EMP-1234`)).status,
      apiUrl,
    );
    expect(anonymousHostSearch).toBe(401);
    const device = await pairDevice();
    expect(
      await hostPage.evaluate(
        async ({ root, key }) => {
          const response = await fetch(`${root}/kiosk/hosts?q=EMP-1234`, { headers: { "X-Device-Key": key } });
          const rows = await response.json();
          return rows.some((row: { employee_id: string }) => row.employee_id === "EMP-1234");
        },
        { root: apiUrl, key: device.key },
      ),
    ).toBe(true);

    await anonymousPage.goto(kioskUrl);
    const protectedRequest = await anonymousPage.evaluate(async (root) => {
      const response = await fetch(`${root}/visits`);
      return response.status;
    }, apiUrl);
    expect(protectedRequest).toBe(401);

    const hostEscalation = await dashboardApi(hostPage, "/users", "POST", {
      email: `e2e-host-escalation-${Date.now()}@example.com`,
      full_name: "Rejected Host Escalation",
      password: "Test-Only-Password-123!",
      role: "super-admin",
      site_id: siteId,
    });
    expect(hostEscalation.status).toBe(403);
  } finally {
    if (createdAccountId) {
      await dashboardApi(superadminPage, `/users/${createdAccountId}`, "DELETE").catch(
        () => undefined,
      );
    }
    await Promise.all([
      superadminContext.close(),
      adminContext.close(),
      hostContext.close(),
      anonymousContext.close(),
    ]);
  }
});

test("host, administrator, and kiosk share the persisted visit lifecycle", async ({ browser }) => {
  requireTestAccounts();
  const hostContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const kioskContext = await pairedKioskContext(browser);
  const invalidPassContext = await pairedKioskContext(browser);
  const hostPage = await hostContext.newPage();
  const adminPage = await adminContext.newPage();
  const kioskPage = await kioskContext.newPage();
  const invalidPassPage = await invalidPassContext.newPage();
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
    await hostPage.getByRole("button", { name: /Sign in/ }).click();
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
    await hostPage.reload();
    await expect(hostPage).toHaveURL(/\/host$/);
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

    // A second host invitation exercises the site administrator's rejection path.
    await hostPage.getByRole("button", { name: /Close Preview/ }).click();
    const rejectedVisitorName = `Rejected Visitor ${Date.now()}`;
    await hostPage.getByRole("button", { name: /Invite Visitor/ }).click();
    await hostPage.getByPlaceholder("e.g. Elena Rostova").fill(rejectedVisitorName);
    await hostPage.getByPlaceholder("elena@domain.com").fill(`rejected-${Date.now()}@example.com`);
    await hostPage.locator('input[type="date"]').fill(tomorrow.toISOString().slice(0, 10));
    await hostPage.locator('input[type="time"]').fill("11:00");
    await hostPage
      .getByPlaceholder("e.g. Q3 Architecture Milestone Review")
      .fill("Rejection workflow test");
    await hostPage.getByRole("button", { name: "Submit Invitation & Request Pass" }).click();
    await expect(hostPage.getByText(rejectedVisitorName, { exact: true })).toBeVisible();
    await adminPage.reload();
    const rejectionCard = adminPage
      .getByRole("heading", { name: "Access Clearance Queue" })
      .locator("xpath=../../..")
      .getByText(rejectedVisitorName, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    await rejectionCard.getByRole("button", { name: "Reject" }).click();
    await expect
      .poll(
        async () =>
          (await dashboardVisits(adminPage)).find((row) => row.visitor_name === rejectedVisitorName)
            ?.status,
      )
      .toBe("rejected");
    await hostPage.reload();
    const rejectedRequest = hostPage
      .getByText(rejectedVisitorName, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(rejectedRequest.getByText("Rejected", { exact: true })).toBeVisible();

    // Invalid pass is rejected through the kiosk UI and does not create a backend visit.
    await invalidPassPage.goto(kioskUrl);
    await invalidPassPage.getByRole("button", { name: /Sign in/ }).click();
    await invalidPassPage.getByRole("button", { name: /Enter pass code instead/ }).click();
    await invalidPassPage.getByLabel("Visitor pass code").fill("invalid-pass-code-1234567890");
    await invalidPassPage.getByRole("button", { name: "Verify" }).click();
    await expect(invalidPassPage.getByText("We could not find this pass.")).toBeVisible();

    expect(apiFailures, apiFailures.join("\n")).toEqual([]);
  } finally {
    await Promise.all([
      hostContext.close(),
      adminContext.close(),
      kioskContext.close(),
      invalidPassContext.close(),
    ]);
  }
});

test("Super Admin-created hosts flow through kiosk search, approval, pass QR, and check-in", async ({
  browser,
}) => {
  requireTestAccounts();
  const kioskContext = await pairedKioskContext(browser);
  const adminContext = await browser.newContext();
  const superadminContext = await browser.newContext();
  const kioskPage = await kioskContext.newPage();
  const adminPage = await adminContext.newPage();
  const superadminPage = await superadminContext.newPage();
  kioskPage.on("pageerror", (error) =>
    console.error(`Kiosk page error: ${error.stack ?? error.message}`),
  );
  kioskPage.on("console", (message) => {
    if (message.type() === "error") console.error(`Kiosk console error: ${message.text()}`);
  });
  // Keep the name short because the kiosk intentionally accepts input through
  // its on-screen keyboard and returns home after 45 seconds without approval.
  const visitorName = `Walk ${Date.now() % 100000}`;
  const stamp = Date.now();
  const employeeSuffix = String(stamp % 10000).padStart(4, "0");
  const employeeId = `EMP-${employeeSuffix}`;
  const hostName = `E2E Host ${stamp}`;
  const hostEmailAddress = `e2e-host-${stamp}@example.com`;
  const hostPasswordValue = `E2E-Host-${stamp}-A!`;
  let createdHostId: string | undefined;
  let createdUserId: string | undefined;

  try {
    await login(superadminPage, superadminEmail!, superadminPassword!);
    await expect(superadminPage).toHaveURL(/\/super-admin$/);
    await superadminPage.getByRole("button", { name: "Accounts", exact: false }).click();
    await superadminPage.getByRole("button", { name: "Add account" }).click();
    await superadminPage.getByLabel("Account type").selectOption("host");
    await superadminPage.getByLabel("Site").selectOption(siteId!);
    await superadminPage.getByLabel("Full name").fill(hostName);
    await superadminPage.getByLabel("Email").fill(hostEmailAddress);
    await superadminPage.getByLabel("Initial password").fill(hostPasswordValue);
    await superadminPage.getByLabel("Employee ID").fill(employeeId);
    await superadminPage.getByLabel("Department").fill("E2E Integration");
    await superadminPage.getByRole("button", { name: "Create host" }).click();
    await expect(superadminPage.getByText(hostName, { exact: true })).toBeVisible();
    await expect(superadminPage.getByText(employeeId, { exact: true })).toBeVisible();

    const users = await dashboardApi(superadminPage, "/users");
    const userRows = users.body as Array<{ id: string; email: string; employee_id?: string }>;
    const createdUser = userRows.find((user) => user.email === hostEmailAddress);
    expect(createdUser?.employee_id).toBe(employeeId);
    createdUserId = createdUser?.id;
    const hosts = await dashboardApi(superadminPage, `/hosts?q=${encodeURIComponent(employeeId)}`);
    const hostRows = hosts.body as Array<{ id: string; employee_id: string }>;
    const createdHost = hostRows.find((host) => host.employee_id === employeeId);
    if (!createdHost) throw new Error(`Created host ${employeeId} was not returned by the directory.`);
    createdHostId = createdHost.id;

    await adminPage.goto(`${dashboardUrl}/login`);
    await adminPage.locator('input[type="email"]').fill(adminEmail!);
    await adminPage.locator('input[type="password"]').fill(adminPassword!);
    await adminPage.getByRole("button", { name: /Sign in/ }).click();
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
    // The kiosk looks up the host automatically after the fourth employee digit.
    await expect(kioskPage.getByText("Employee found")).toBeVisible();
    await kioskPage.getByRole("button", { name: /Yes, this is my host/ }).click();
    await kioskPage.getByRole("button", { name: /I agree to the privacy notice/ }).click();
    await kioskPage
      .getByRole("button", { name: /I agree to the non-disclosure agreement/ })
      .click();
    await kioskPage.getByRole("button", { name: "Continue", exact: true }).click();
    await kioskPage.getByRole("button", { name: "Submit" }).click();
    await expect(kioskPage.getByText("Waiting for approval")).toBeVisible();
    const createdVisit = (await dashboardVisits(adminPage)).find(
      (row) => row.visitor_name === visitorName,
    );
    expect(createdVisit?.host_id).toBe(createdHostId);

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
    await kioskPage.getByRole("button", { name: /Print my badge/ }).click();
    await expect(kioskPage.getByTestId("visitor-pass-qr")).toBeVisible({ timeout: 10_000 });
    const passCode = await kioskPage.getByLabel("Visitor pass code").textContent();
    expect(passCode?.trim().length).toBeGreaterThanOrEqual(24);
    expect((await dashboardVisits(adminPage)).find((row) => row.visitor_name === visitorName)?.pass_code)
      .toBe(passCode?.trim());
    await expect
      .poll(
        async () =>
          (await dashboardVisits(adminPage)).find((row) => row.visitor_name === visitorName)
            ?.status,
      )
      .toBe("checked-in");

    // Staff sign visitors out through the authenticated staff endpoint (kiosk endpoints need a paired device).
    const checkedOut = await dashboardApi(adminPage, `/visits/${createdVisit!.id}/check-out`, "POST");
    expect(checkedOut.status).toBe(200);
    await expect
      .poll(
        async () =>
          (await dashboardVisits(adminPage)).find((row) => row.visitor_name === visitorName)
            ?.status,
      )
      .toBe("checked-out");
  } finally {
    if (createdHostId) {
      await dashboardApi(superadminPage, `/hosts/${createdHostId}`, "DELETE").catch(() => undefined);
    }
    if (createdUserId) {
      await dashboardApi(superadminPage, `/users/${createdUserId}`, "DELETE").catch(() => undefined);
    }
    await Promise.all([kioskContext.close(), adminContext.close(), superadminContext.close()]);
  }
});
