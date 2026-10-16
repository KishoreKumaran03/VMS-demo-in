import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAccessToken, getAccessToken, signIn } from '../api.js';

const VmsContext = createContext(null);

async function fetchAllVisits() {
  const rows = [];
  let offset = 0;
  while (true) {
    const page = await api(`/visits?offset=${offset}&limit=100`);
    rows.push(...page);
    if (page.length < 100) return rows;
    offset += page.length;
  }
}

function displayStatus(status) {
  return ({
    pending: 'Pending Review', 'security-review': 'Security Review', scheduled: 'Approved', 'checked-in': 'Checked In',
    'temporarily-out': 'Stepped Out', 'checked-out': 'Checked Out', 'no-show': 'No Show', cancelled: 'Cancelled', rejected: 'Rejected',
  })[status] || status;
}

function toPass(visit) {
  const starts = new Date(visit.starts_at);
  const ends = new Date(visit.ends_at);
  return {
    id: visit.id,
    visitorName: visit.visitor_name,
    email: visit.visitor_email || '',
    phone: visit.visitor_phone || '',
    company: visit.company || 'External Guest',
    category: 'Customer',
    hostName: visit.host_name,
    hostDepartment: visit.host_department || '',
    hostId: visit.host_id,
    siteId: visit.site_id,
    scheduledDate: starts.toLocaleDateString(),
    scheduledTime: starts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    slotDescription: `${starts.toLocaleString()} – ${ends.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    status: displayStatus(visit.status),
    source: visit.source,
    purpose: visit.purpose,
    passCode: visit.pass_code,
    checkInTime: visit.checked_in_at ? new Date(visit.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
    checkInGate: visit.check_in_gate || undefined,
    checkOutTime: visit.checked_out_at ? new Date(visit.checked_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
    overdue: visit.overdue === true,
    version: visit.version,
  };
}

function makeDate(dateText, timeText) {
  const today = new Date();
  const date = /^\d{4}-\d\d-\d\d$/.test(dateText || '') ? dateText : today.toISOString().slice(0, 10);
  const time = (timeText || '09:00').trim();
  let hours = 9;
  let minutes = 0;
  const twelveHour = time.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  const twentyFourHour = time.match(/^(\d{1,2}):(\d{2})$/);
  if (twelveHour) {
    hours = Number(twelveHour[1]) % 12 + (twelveHour[3].toUpperCase() === 'PM' ? 12 : 0);
    minutes = Number(twelveHour[2]);
  } else if (twentyFourHour) {
    hours = Number(twentyFourHour[1]);
    minutes = Number(twentyFourHour[2]);
  }
  const result = new Date(`${date}T00:00:00`);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export const VmsProvider = ({ children }) => {
  const [token, setToken] = useState(() => getAccessToken());
  const [authLoading, setAuthLoading] = useState(() => Boolean(getAccessToken()));
  const [dataError, setDataError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [passes, setPasses] = useState([]);
  const [sites, setSites] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState({ expected_today: 0, visitors_today: 0, on_site: 0, checked_out_today: 0, pending: 0, user_count: 0, site_count: 0 });
  const [toastMessage, setToastMessage] = useState(null);
  const [dismissedArrival, setDismissedArrival] = useState(null);

  const currentRole = currentUser?.role || null;
  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage((current) => current === message ? null : current), 3500);
  };

  const refreshData = async () => {
    if (!getAccessToken()) return;
    try {
      const [visitRows, siteRows, hostRows, auditRows, notificationRows, summaryData] = await Promise.all([
        fetchAllVisits(), api('/sites'), api('/hosts'), api('/audit'), api('/notifications'), api('/dashboard/summary'),
      ]);
      setPasses(visitRows.map(toPass));
      const activeBySite = visitRows.reduce((counts, visit) => {
        if (visit.status === 'checked-in') counts[visit.site_id] = (counts[visit.site_id] || 0) + 1;
        return counts;
      }, {});
      setSites(siteRows.map((site) => ({
        ...site, location: site.address || '', status: site.is_active ? 'Active' : 'Inactive',
        activeEntries: activeBySite[site.id] || 0,
      })));
      setHosts(hostRows);
      setAuditLogs(auditRows.map((row) => ({
        id: row.id, timestamp: new Date(row.created_at).toLocaleString(), type: row.event_type.includes('revoked') ? 'warning' : 'success',
        title: row.event_type, description: row.detail || '',
      })));
      setNotifications(notificationRows.map((row) => ({
        id: row.id, timestamp: new Date(row.created_at).toLocaleString(), title: row.title, message: row.message,
        type: 'success', read: row.read,
      })));
      setSummary(summaryData);
      setDataError(null);
    } catch (error) {
      setDataError(error.message || 'Dashboard data could not be refreshed.');
      if (error.message.toLowerCase().includes('sign-in required') || error.message.toLowerCase().includes('valid sign-in')) {
        clearAccessToken(); setToken(null); setCurrentUser(null);
      }
      console.error('VisitorHub refresh failed:', error);
    }
  };

  useEffect(() => {
    let alive = true;
    if (!token) { setCurrentUser(null); setAuthLoading(false); return undefined; }
    setAuthLoading(true);
    api('/auth/me').then((user) => { if (alive) setCurrentUser({ ...user, name: user.full_name }); }).catch(() => {
      if (alive) { clearAccessToken(); setToken(null); setCurrentUser(null); }
    }).finally(() => { if (alive) setAuthLoading(false); });
    refreshData();
    const poll = setInterval(refreshData, 10000);
    const onFocus = () => refreshData();
    window.addEventListener('focus', onFocus);
    return () => { alive = false; clearInterval(poll); window.removeEventListener('focus', onFocus); };
  }, [token]);

  const login = async (email, password) => {
    const responseUser = await signIn(email, password);
    const user = { ...responseUser, name: responseUser.full_name };
    setCurrentUser(user);
    setToken(getAccessToken());
    setAuthLoading(false);
    return user;
  };
  const signup = async (setupData) => {
    const response = await api('/auth/signup', { method: 'POST', body: JSON.stringify(setupData) });
    window.localStorage.setItem('visitorhub_access_token', response.access_token);
    setToken(response.access_token);
    const user = { ...response.user, name: response.user.full_name };
    setCurrentUser(user);
    setAuthLoading(false);
    return user;
  };
  const logout = () => {
    // End the server-side session too, so the token stops working even if it was copied.
    api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearAccessToken(); setToken(null); setCurrentUser(null); setPasses([]); setSites([]); setHosts([]); setDataError(null);
  };
  const setCurrentRole = () => showToast('Roles are assigned to your account by an administrator.');

  const addPassRequest = async (passData) => {
    if (currentRole === 'receptionist' && (passData.phone || '').replace(/\D/g, '').length < 7) {
      throw new Error('Enter a valid visitor phone number before registering a walk-in.');
    }
    const target = hosts.find((host) => host.name.toLowerCase() === currentUser?.name?.toLowerCase())
      || hosts.find((host) => host.name.toLowerCase() === (passData.hostName || '').toLowerCase())
      || hosts[0];
    if (!target) throw new Error('No host is configured yet. Ask an administrator to add a host first.');
    const starts = makeDate(passData.scheduledDate, passData.scheduledTime);
    const payload = {
      visitor_name: passData.visitorName, visitor_email: passData.email && !passData.email.endsWith('.guest.local') ? passData.email : null,
      visitor_phone: passData.phone || null, company: passData.company || null, host_id: target.id, site_id: target.site_id,
      purpose: passData.purpose, starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 2 * 3600000).toISOString(),
    };
    if (currentRole === 'receptionist') {
      payload.consent_accepted = passData.consentAccepted === true;
      payload.nda_accepted = passData.ndaAccepted === true;
    }
    // A fresh key per submission: a retried request after a network error returns the same visit instead of a duplicate.
    const headers = { 'Idempotency-Key': crypto.randomUUID() };
    const result = currentRole === 'receptionist'
      ? await api('/reception/walk-ins', { method: 'POST', headers, body: JSON.stringify(payload) })
      : await api('/visits', { method: 'POST', headers, body: JSON.stringify(payload) });
    await refreshData();
    return toPass(result);
  };

  const approvePass = async (id) => {
    try {
      await api(`/visits/${id}/approve`, { method: 'POST' });
      await refreshData();
      showToast('Visit approved and pass issued.');
      return true;
    } catch (error) { showToast(error.message || 'Visit approval failed.'); return false; }
  };
  const rejectPass = async (id, reason = 'Administrative review denied access') => {
    try {
      await api(`/visits/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
      await refreshData();
      showToast('Visit rejected.');
      return true;
    } catch (error) { showToast(error.message || 'Visit rejection failed.'); return false; }
  };
  const checkInVisitor = async (id, gate = 'Main Gate Lobby') => {
    const visit = passes.find((pass) => pass.id === id);
    if (!visit) throw new Error('This visit is not in your list.');
    try {
      await api(`/visits/${id}/check-in`, { method: 'POST', body: JSON.stringify({ gate }) });
      await refreshData();
      showToast(`${visit.visitorName} checked in.`);
      return true;
    } catch (error) { showToast(error.message || 'Check-in failed.'); return false; }
  };
  const verifyVisitorPass = async (code) => {
    const result = await api('/passes/verify', { method: 'POST', body: JSON.stringify({ code }) });
    return { ...toPass(result), passCode: code };
  };
  const checkOutVisitor = async (id) => {
    const visit = passes.find((pass) => pass.id === id);
    if (!visit) throw new Error('This visit is not in your list.');
    try {
      await api(`/visits/${id}/check-out`, { method: 'POST' });
      await refreshData();
      showToast(`${visit.visitorName} checked out.`);
    } catch (error) { showToast(error.message || 'Check-out failed.'); }
  };
  const addSite = async (siteData) => {
    const result = await api('/sites', { method: 'POST', body: JSON.stringify({ name: siteData.name, address: siteData.location }) });
    await refreshData();
    showToast(`Site ${result.name} added.`);
  };
  const markNotificationsAsRead = async () => {
    try {
      const unread = notifications.filter((notification) => !notification.read);
      await Promise.all(unread.map((notification) => api(`/notifications/${notification.id}/read`, { method: 'POST' })));
      await refreshData();
    } catch (error) { showToast(error.message || 'Notifications could not be updated.'); }
  };
  const clearNotifications = async () => markNotificationsAsRead();
  const dismissLiveLobbyAlert = () => setDismissedArrival(liveLobbyAlert?.time || null);
  const liveLobbyAlert = useMemo(() => {
    const latest = passes.find((pass) => pass.status === 'Checked In');
    if (!latest || latest.checkInTime === dismissedArrival) return null;
    return { visible: true, visitorName: latest.visitorName, location: latest.checkInGate || 'Reception', time: latest.checkInTime };
  }, [passes, dismissedArrival]);

  return (
    <VmsContext.Provider value={{
      currentUser, currentRole, setCurrentRole, login, signup, logout, authLoading, passes, sites, hosts, auditLogs, notifications,
      summary, unreadNotificationCount: notifications.filter((n) => !n.read).length,
      markNotificationsAsRead, clearNotifications, toastMessage, showToast, addPassRequest, approvePass, rejectPass,
      checkInVisitor, checkOutVisitor, verifyVisitorPass, addSite, liveLobbyAlert, dismissLiveLobbyAlert, refreshData, dataError,
    }}>{children}</VmsContext.Provider>
  );
};

export const useVms = () => {
  const context = useContext(VmsContext);
  if (!context) throw new Error('useVms must be used within a VmsProvider');
  return context;
};
