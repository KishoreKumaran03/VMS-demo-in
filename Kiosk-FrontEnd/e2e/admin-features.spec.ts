import { expect, test, type Page } from "@playwright/test";

// Exercises the Phase 4-8 administration screens through the real Dashboard, kiosk, API and database.
const dashboardUrl = process.env.VMS_E2E_DASHBOARD_URL ?? "http://127.0.0.1:3000";
const kioskUrl = process.env.VMS_E2E_KIOSK_URL ?? "http://127.0.0.1:3001";
const apiUrl = (process.env.VMS_E2E_API_URL ?? "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
const adminEmail = process.env.VMS_E2E_ADMIN_EMAIL;
const adminPassword = process.env.VMS_E2E_ADMIN_PASSWORD;
const hostEmail = process.env.VMS_E2E_HOST_EMAIL;
const hostPassword = process.env.VMS_E2E_HOST_PASSWORD;

test.beforeAll(() => {
  if (!adminEmail || !adminPassword || !hostEmail || !hostPassword) {
    throw new Error("Set VMS_E2E_ADMIN_EMAIL/PASSWORD and VMS_E2E_HOST_EMAIL/PASSWORD (see Backend/README.md).");
  }
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${dashboardUrl}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Sign in/ }).click();
}

async function api(page: Page, path: string, method = "GET", body?: unknown) {
  return page.evaluate(
    async ({ url, requestMethod, requestBody }) => {
      const token = localStorage.getItem("visitorhub_access_token");
      const response = await fetch(url, {
        method: requestMethod,
        headers: { Authorization: `Bearer ${token}`, ...(requestBody ? { "Content-Type": "application/json" } : {}) },
        ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
      });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    },
    { url: `${apiUrl}${path}`, requestMethod: method, requestBody: body },
  );
}

test("a site admin pairs a kiosk from the dashboard", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const kioskContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const kiosk = await kioskContext.newPage();
  try {
    await signIn(admin, adminEmail!, adminPassword!);
    await expect(admin).toHaveURL(/\/site-admin$/);
    await admin.getByLabel("Kiosk name").fill(`Pairing test ${Date.now()}`);
    await admin.getByRole("button", { name: "Register kiosk" }).click();
    const code = (await admin.getByTestId("pairing-code").textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    await kiosk.goto(kioskUrl);
    await expect(kiosk.getByRole("heading", { name: "Pair this kiosk" })).toBeVisible();
    await kiosk.getByLabel("Pairing code").fill(code);
    await kiosk.getByRole("button", { name: "Pair kiosk" }).click();
    await expect(kiosk.getByRole("button", { name: /Sign in/ })).toBeVisible();

    // The code was single-use.
    const reuse = await kiosk.evaluate(
      async ({ root, pairingCode }) =>
        (await fetch(`${root}/kiosk/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairing_code: pairingCode }) })).status,
      { root: apiUrl, pairingCode: code },
    );
    expect(reuse).toBe(400);
  } finally {
    await Promise.all([adminContext.close(), kioskContext.close()]);
  }
});

test("a restricted visitor waits for a security decision made in the dashboard", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const hostContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const host = await hostContext.newPage();
  const stamp = Date.now();
  const flaggedEmail = `flagged-${stamp}@example.com`;
  try {
    await signIn(admin, adminEmail!, adminPassword!);
    await expect(admin).toHaveURL(/\/site-admin$/);
    await admin.getByLabel("Email to match").fill(flaggedEmail);
    await admin.getByRole("button", { name: "Add record" }).click();
    await expect(admin.getByText(flaggedEmail)).toBeVisible();

    await signIn(host, hostEmail!, hostPassword!);
    await expect(host).toHaveURL(/\/host$/);
    const hosts = await api(host, "/hosts");
    const me = await api(host, "/auth/me");
    const ownHost = (hosts.body as Array<{ id: string; name: string }>).find((row) => row.name === me.body.full_name) ?? hosts.body[0];
    const start = new Date(Date.now() + 3600_000);
    const created = await api(host, "/visits", "POST", {
      visitor_name: `Flagged Visitor ${stamp}`, visitor_email: flaggedEmail, host_id: ownHost.id, purpose: "Security workflow test",
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3600_000).toISOString(),
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("security-review");
    // Hosts cannot see the restricted-entry details.
    expect((await api(host, "/security/approvals")).status).toBe(403);

    await admin.reload();
    const review = admin.locator("article", { hasText: `Flagged Visitor ${stamp}` });
    await expect(review).toBeVisible();
    await review.getByLabel("Decision reason").fill("Verified identity with photo ID at reception");
    await review.getByRole("button", { name: "Approve visit" }).click();
    await expect(review).toHaveCount(0);
    const after = await api(admin, `/visits/${created.body.id}`);
    expect(after.body.status).toBe("scheduled");
    expect(after.body.pass_code).toBeTruthy();

    // Clean up: lift the record so later runs start clean.
    const records = (await api(admin, "/blacklist")).body as Array<{ id: string; match_email: string }>;
    const record = records.find((row) => row.match_email === flaggedEmail);
    if (record) await api(admin, `/blacklist/${record.id}/lift`, "POST", { reason: "End of end-to-end test" });
  } finally {
    await Promise.all([adminContext.close(), hostContext.close()]);
  }
});
