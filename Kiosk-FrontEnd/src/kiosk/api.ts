const API_ROOT = (import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1").replace(/\/$/, "");
export const KIOSK_SITE_ID = import.meta.env.VITE_KIOSK_SITE_ID || "";

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
  status: "scheduled" | "pending" | "checked-in" | "checked-out" | "cancelled" | "rejected";
  pass_code?: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    let detail = "We could not complete that request. Please try again.";
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch { /* no response body */ }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function verifyPass(code: string) {
  return request<ApiVisit>(`/kiosk/pass/${encodeURIComponent(code)}`);
}

export function checkInPass(code: string) {
  return request<ApiVisit>(`/kiosk/pass/${encodeURIComponent(code)}/check-in?gate=Kiosk`, { method: "POST" });
}

export function checkOutPass(code: string) {
  return request<ApiVisit>(`/kiosk/pass/${encodeURIComponent(code)}/check-out`, { method: "POST" });
}

export async function searchKioskHosts(query = "", department = "") {
  if (!KIOSK_SITE_ID) throw new Error("This kiosk has not been assigned to a site. Please ask reception for help.");
  const params = new URLSearchParams({ site_id: KIOSK_SITE_ID });
  if (query) params.set("q", query);
  if (department) params.set("department", department);
  return request<Array<{ id: string; employee_id: string; name: string; department: string; site_id: string }>>(`/kiosk/hosts?${params}`);
}

export function submitWalkIn(payload: {
  visitor_name: string;
  visitor_phone: string;
  company?: string;
  host_id: string;
  site_id: string;
  purpose: string;
}) {
  return request<ApiVisit>("/kiosk/walk-ins", { method: "POST", body: JSON.stringify(payload) });
}

export function getKioskRequest(id: string) {
  return request<ApiVisit>(`/kiosk/requests/${encodeURIComponent(id)}`);
}
