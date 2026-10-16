const API_ROOT = (import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1").replace(
  /\/$/,
  "",
);
const DEVICE_STORAGE_KEY = "visitorhub_kiosk_device";

/** This kiosk's pairing, saved in the browser after an administrator's one-time code is entered. */
export type PairedDevice = { key: string; siteId: string; siteName: string; name: string };

export function pairedDevice(): PairedDevice | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(DEVICE_STORAGE_KEY) || "null");
    return stored?.key && stored?.siteId ? (stored as PairedDevice) : null;
  } catch {
    return null;
  }
}

export function forgetPairing() {
  try {
    window.localStorage.removeItem(DEVICE_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("kiosk-pairing-changed"));
}

/** The site this kiosk was paired to; every kiosk request is scoped to it by the server. */
export function kioskSiteId() {
  return pairedDevice()?.siteId || "";
}

export type ApiVisit = {
  id: string;
  visitor_id: string;
  visitor_name: string;
  visitor_email?: string | null;
  visitor_phone?: string | null;
  company?: string | null;
  host_id: string;
  host_name: string;
  host_department: string;
  site_id: string;
  purpose: string;
  starts_at: string;
  ends_at: string;
  status:
    | "pending"
    | "security-review"
    | "scheduled"
    | "checked-in"
    | "temporarily-out"
    | "checked-out"
    | "no-show"
    | "cancelled"
    | "rejected";
  pass_code?: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const device = pairedDevice();
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(device ? { "X-Device-Key": device.key } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 401 && device) {
    // The administrator disabled or re-paired this kiosk: return to the pairing screen.
    forgetPairing();
  }
  if (!response.ok) {
    let detail = "We could not complete that request. Please try again.";
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) {
        detail =
          body.detail
            .map((issue: { msg?: string }) => issue.msg)
            .filter(Boolean)
            .join("; ") || detail;
      }
    } catch {
      /* no response body */
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export async function pairKiosk(pairingCode: string) {
  const result = await request<{
    device_key: string;
    device: { site_id: string; name: string };
    site_name: string;
  }>("/kiosk/pair", { method: "POST", body: JSON.stringify({ pairing_code: pairingCode }) });
  const device: PairedDevice = {
    key: result.device_key,
    siteId: result.device.site_id,
    siteName: result.site_name,
    name: result.device.name,
  };
  window.localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(device));
  window.dispatchEvent(new Event("kiosk-pairing-changed"));
  return device;
}

export function verifyPass(code: string) {
  return request<ApiVisit>(`/kiosk/pass/${encodeURIComponent(code)}`);
}

export function checkInPass(code: string) {
  return request<ApiVisit>(`/kiosk/pass/${encodeURIComponent(code)}/check-in`, {
    method: "POST",
  });
}

export function checkOutPass(code: string) {
  return request<ApiVisit>(`/kiosk/pass/${encodeURIComponent(code)}/check-out`, { method: "POST" });
}

export async function searchKioskHosts(query = "", department = "") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (department) params.set("department", department);
  return request<
    Array<{ id: string; employee_id: string; name: string; department: string; site_id: string }>
  >(`/kiosk/hosts?${params}`);
}

export function submitWalkIn(payload: {
  visitor_name: string;
  visitor_phone: string;
  visitor_email?: string;
  company?: string;
  host_id: string;
  site_id: string;
  purpose: string;
  consent_accepted: boolean;
  nda_accepted: boolean;
}) {
  // One key per submission lets a retried request after a network drop return the same visit.
  const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return request<ApiVisit>("/kiosk/walk-ins", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Idempotency-Key": key },
  });
}

export function getKioskRequest(id: string) {
  return request<ApiVisit>(`/kiosk/requests/${encodeURIComponent(id)}`);
}
