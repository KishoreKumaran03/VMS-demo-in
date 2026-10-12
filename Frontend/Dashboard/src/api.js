const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '');
const TOKEN_KEY = 'visitorhub_access_token';

export const getAccessToken = () => localStorage.getItem(TOKEN_KEY);
export const clearAccessToken = () => localStorage.removeItem(TOKEN_KEY);

export async function api(path, options = {}) {
  const token = getAccessToken();
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = typeof body.detail === 'string'
        ? body.detail
        : Array.isArray(body.detail)
          ? body.detail.map((issue) => issue.msg).filter(Boolean).join('; ') || message
          : message;
    } catch { /* response did not contain JSON */ }
    if (response.status === 401) clearAccessToken();
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function signIn(email, password) {
  const response = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem(TOKEN_KEY, response.access_token);
  return response.user;
}
