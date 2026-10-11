const ICONS = {
  brand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V8l8-4 8 4v12M8 20v-6h8v6M8 9h.01M12 9h.01M16 9h.01"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6"/></svg>',
  pass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h4M7 14h2M15 10h2v4h-2z"/></svg>',
  audit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4v5h5M20 20v-5h-5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 3M4 15l2 3a7 7 0 0 0 12.4-3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg>',
  walk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="5" r="2"/><path d="m10 22 2-6 2 2 3 1M8 13l4-5 3 4 4 1M6 18l3-5"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 7l5 5-5 5M19 12H8"/><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/></svg>',
  printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6zM18 12h.01"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m15 18-6-6 6-6"/></svg>'
};

const STORAGE_KEY = 'vms-demo-v2';
const SESSION_KEY = 'vms-role-v2';
const employeeSeed = [
  { name: 'Arjun Kumar', department: 'People Operations', email: 'arjun.kumar@vms.example', employeeId: 'VMS-2048' },
  { name: 'Priya Sharma', department: 'Product Design', email: 'priya.sharma@vms.example', employeeId: 'VMS-1851' },
  { name: 'Rahul Menon', department: 'Engineering', email: 'rahul.menon@vms.example', employeeId: 'VMS-1710' },
  { name: 'Ananya Iyer', department: 'Finance', email: 'ananya.iyer@vms.example', employeeId: 'VMS-2207' }
];

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function localDateTimeOffset(days, hours = 9) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateTimeLabel(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function taskOwner(item) {
  return item.createdBy === HOST_USER || item.host === HOST_USER;
}

function visitRange(item) {
  return `${dateTimeLabel(item.startsAt)} – ${dateTimeLabel(item.endsAt)}`;
}

const HOST_USER = 'Arjun Kumar';
const now = Date.now();

function initialState() {
  return {
    requests: [
      { id: 'VMS-1042', visitorName: 'Meera Joshi', email: 'meera.joshi@example.in', phone: '+91 98765 43210', startsAt: localDateTimeOffset(1, 10), endsAt: localDateTimeOffset(1, 12), purpose: 'Job Interview', host: 'Arjun Kumar', createdBy: HOST_USER, status: 'Pending', passCode: '', passStatus: '', visitStatus: 'Scheduled', visits: [], createdAt: new Date(now - 3600000).toISOString(), updatedAt: new Date().toISOString(), source: 'Host request' },
      { id: 'VMS-1041', visitorName: 'Rohan Das', email: 'rohan.das@example.in', phone: '+91 98123 45670', startsAt: localDateTimeOffset(-3, 8), endsAt: localDateTimeOffset(3, 19), purpose: 'Meeting', host: 'Arjun Kumar', createdBy: HOST_USER, status: 'Approved', passCode: 'VMS-7K2P9Q', passStatus: 'Active', visitStatus: 'Checked in', visits: [{ type: 'check-in', at: new Date(now - 1800000).toISOString(), actor: 'Kiosk' }], createdAt: new Date(now - 86400000).toISOString(), updatedAt: new Date().toISOString(), source: 'Host request' },
      { id: 'VMS-1040', visitorName: 'Kavya Nair', email: 'kavya.nair@example.in', phone: '+91 99456 12345', startsAt: localDateTimeOffset(-2, 9), endsAt: localDateTimeOffset(2, 18), purpose: 'Delivery / Service', host: 'Arjun Kumar', createdBy: HOST_USER, status: 'Approved', passCode: 'VMS-4M6R1A', passStatus: 'Active', visitStatus: 'Outside', visits: [{ type: 'check-in', at: new Date(now - 7200000).toISOString(), actor: 'Kiosk' }, { type: 'check-out', at: new Date(now - 3600000).toISOString(), actor: 'Kiosk' }], createdAt: new Date(now - 172800000).toISOString(), updatedAt: new Date(now - 3600000).toISOString(), source: 'Host request' },
      { id: 'VMS-1039', visitorName: 'Devika Rao', email: 'devika.rao@example.in', phone: '+91 99887 66554', startsAt: localDateTimeOffset(-5, 9), endsAt: localDateTimeOffset(-3, 18), purpose: 'Meeting', host: 'Priya Sharma', createdBy: 'Priya Sharma', status: 'Approved', passCode: 'VMS-4M6R1B', passStatus: 'Completed', visitStatus: 'Completed', visits: [{ type: 'check-in', at: new Date(now - 5 * 86400000).toISOString(), actor: 'Kiosk' }, { type: 'check-out', at: new Date(now - 5 * 86400000 + 3600000).toISOString(), actor: 'Kiosk' }], createdAt: new Date(now - 6 * 86400000).toISOString(), updatedAt: new Date(now - 3 * 86400000).toISOString(), source: 'Host request' },
      { id: 'VMS-1036', visitorName: 'Siddharth Bose', email: 'siddharth.bose@example.in', phone: '+91 90909 12121', startsAt: localDateTimeOffset(-5, 10), endsAt: localDateTimeOffset(-3, 17), purpose: 'Meeting', host: 'Rahul Menon', createdBy: 'Rahul Menon', status: 'Approved', passCode: 'VMS-6C9E2F', passStatus: 'Expired', visitStatus: 'Outside', visits: [], createdAt: new Date(now - 6 * 86400000).toISOString(), updatedAt: new Date(now - 3 * 86400000).toISOString(), source: 'Host request' },
      { id: 'VMS-1038', visitorName: 'Ishaan Verma', email: 'ishaan.verma@example.in', phone: '+91 91234 56789', startsAt: localDateTimeOffset(1, 11), endsAt: localDateTimeOffset(1, 13), purpose: 'Meeting', host: 'Arjun Kumar', createdBy: HOST_USER, status: 'Approved', passCode: 'VMS-8B3T5D', passStatus: 'Revoked', revocationReason: 'Access details changed after approval.', revokedAt: new Date(now - 3 * 3600000).toISOString(), revokedBy: HOST_USER, visitStatus: 'Scheduled', visits: [], createdAt: new Date(now - 2 * 86400000).toISOString(), updatedAt: new Date().toISOString(), source: 'Host request' },
      { id: 'VMS-1037', visitorName: 'Ananya Iyer', email: 'ananya.iyer.guest@example.in', phone: '+91 90012 34567', startsAt: localDateTimeOffset(3, 15), endsAt: localDateTimeOffset(3, 17), purpose: 'Job Interview', host: 'Priya Sharma', createdBy: 'Priya Sharma', status: 'Rejected', passCode: '', passStatus: '', visitStatus: 'Scheduled', visits: [], createdAt: new Date(now - 4 * 86400000).toISOString(), updatedAt: new Date(now - 3 * 86400000).toISOString(), source: 'Host request' }
    ],
    audit: [
      { id: 'A-5106', action: 'Visitor checked in', subject: 'Rohan Das', detail: 'Task VMS-1041 · QR VMS-7K2P9Q', actor: 'Kiosk', at: new Date(now - 1800000).toISOString() },
      { id: 'A-5105', action: 'Visitor checked out', subject: 'Kavya Nair', detail: 'Task VMS-1040 · QR VMS-4M6R1A', actor: 'Kiosk', at: new Date(now - 3600000).toISOString() },
      { id: 'A-5104', action: 'Visitor checked in', subject: 'Kavya Nair', detail: 'Task VMS-1040 · QR VMS-4M6R1A', actor: 'Kiosk', at: new Date(now - 7200000).toISOString() },
      { id: 'A-5103', action: 'Pass Revoked', subject: 'Ishaan Verma', detail: 'Pass ID VMS-8B3T5D · Task VMS-1038 · reason: Access details changed after approval.', actor: 'Arjun Kumar', at: new Date(now - 3 * 3600000).toISOString() },
      { id: 'A-5102', action: 'Task completed', subject: 'Devika Rao', detail: 'Task VMS-1039 completed; QR inactive', actor: 'Priya Sharma', at: new Date(now - 3 * 86400000).toISOString() },
      { id: 'A-5101', action: 'Request rejected', subject: 'Ananya Iyer', detail: 'Task VMS-1037 · schedule unavailable', actor: 'Admin', at: new Date(now - 3 * 86400000).toISOString() }
    ],
    hosts: employeeSeed
  };
}

let state;
try {
  state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || initialState();
} catch {
  state = initialState();
}
let role = localStorage.getItem(SESSION_KEY) || '';
let kioskStage = 'home';
let kioskRecordId = '';
let kioskError = '';
let kioskWalkIn = null;
let hostFormOpen = false;
let scanPurpose = 'check-in';
let scannedCode = '';
let manualQrEntryOpen = false;
let presentationWorkflow = false;
let kioskSuccessTitle = '';
let kioskSuccessMessage = '';
let idleTimer;
let clockTimer;
let scanTimer;
let validationTimer;
let successTimer;
let flowTimer;
let kioskExitTimer;
let kioskExitNode;
let kioskExitHandler;
let lastAppRoute = '';
let appRouteChanged = false;
let lastRenderedKioskStage = '';
const KIOSK_STAGE_MS = 3200;
const KIOSK_ENTER_MS = 285;
const KIOSK_STAGE_DISPLAY_MS = KIOSK_STAGE_MS + KIOSK_ENTER_MS;

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function fmtDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}
function fmtDateTime(value) {
  return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
function icon(name) { return ICONS[name] || ''; }
function statusBadge(value) {
  const cls = String(value || '').toLowerCase().replaceAll(' ', '-');
  return `<span class="status status-${escapeHtml(cls)}">${escapeHtml(value || '—')}</span>`;
}
function getRequest(id) { return state.requests.find(item => item.id === id); }
function makeId() { return `VMS-${Math.floor(1050 + Math.random() * 8900)}`; }
function makePass() { return `VMS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; }
function audit(action, subject, detail, actor = role === 'admin' ? 'Admin' : HOST_USER) {
  state.audit.unshift({ id: `A-${Date.now()}`, action, subject, detail, actor, at: new Date().toISOString() });
}
function toast(message, error = false) {
  const region = document.getElementById('toast-region');
  const item = document.createElement('div');
  item.className = `toast${error ? ' error' : ''}`;
  item.textContent = message;
  region.append(item);
  setTimeout(() => {
    item.classList.add('toast-leave');
    setTimeout(() => item.remove(), 190);
  }, 3200);
}
function go(path) {
  history.pushState({}, '', path);
  render();
  window.scrollTo(0, 0);
}
function safeRoute() {
  const path = location.pathname;
  if (path === '/') {
    history.replaceState({}, '', role === 'host' ? '/host/dashboard' : role === 'admin' ? '/admin/dashboard' : '/login');
  }
  if (path.startsWith('/host/') || path.startsWith('/admin/')) {
    if (!role) {
      history.replaceState({}, '', '/login');
      return;
    }
    if (path.startsWith('/admin/') && role !== 'admin') {
      history.replaceState({}, '', '/host/dashboard');
      return;
    }
    if (path.startsWith('/host/') && role !== 'host') {
      history.replaceState({}, '', '/admin/dashboard');
      return;
    }
  }
  if (path === '/admin/passes') history.replaceState({}, '', '/admin/visitors');
}
function navItems() {
  return role === 'admin' ? [
    ['/admin/dashboard', 'Overview', 'grid'], ['/admin/requests', 'Visitor requests', 'file'], ['/admin/visitors', 'Passes', 'pass'], ['/admin/hosts', 'Hosts', 'users'], ['/admin/audit', 'Audit Log', 'audit']
  ] : [
    ['/host/dashboard', 'Dashboard', 'grid'], ['/host/requests', 'Visitor Requests', 'file'], ['/host/passes', 'Passes', 'pass'], ['/host/history', 'History', 'clock']
  ];
}
function appFrame(content) {
  const admin = role === 'admin';
  const path = location.pathname;
  const current = navItems().find(([href]) => href === path || (href.endsWith('/requests') && path.includes('/requests/')) || (href === '/host/passes' && path.startsWith('/host/passes/')));
  const initials = admin ? 'AD' : 'AK';
  return `<div class="app-shell">
    <header class="topbar"><a class="brand" href="${admin ? '/admin/dashboard' : '/host/dashboard'}" data-link><span class="brand-mark">${icon('brand')}</span> VMS</a>
      <div class="topbar-right"><div class="user-chip"><span class="avatar">${initials}</span><span>${admin ? 'System Admin' : HOST_USER}</span></div><button class="icon-button" type="button" data-action="logout" aria-label="Log out" title="Log out">${icon('logout')}</button></div>
    </header>
    <div class="layout" data-page="${escapeHtml(path)}"><aside class="sidebar"><nav class="nav-list">${navItems().map(([href, label, ico]) => `<a class="nav-link${current?.[0] === href ? ' active' : ''}" href="${href}" data-link>${icon(ico)}<span>${label}</span></a>`).join('')}</nav></aside><main class="main${appRouteChanged ? ' page-enter' : ''}">${content}</main></div>
  </div>`;
}
function heading(title, subtitle = '', action = '') {
  return `<div class="page-heading"><div class="page-heading-copy"><h1>${title}</h1>${subtitle ? `<p class="page-subtitle">${subtitle}</p>` : ''}</div>${action}</div>`;
}
function statCard(label, value, ico) {
  return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon(ico)}</span></div><div class="stat-value">${value}</div></article>`;
}
function hostSelector(id, value = '') {
  return `<div class="host-selector"><input id="${id}" name="host" required autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-options" data-host-selector placeholder="Search host name" value="${escapeHtml(value)}"><div class="host-options" id="${id}-options" role="listbox" hidden></div></div>`;
}
function tableRows(items, isAdmin = false) {
  if (!items.length) return `<tr><td colspan="6"><div class="empty-state"><strong>No activity yet</strong>Visitor requests and updates will appear here.</div></td></tr>`;
  return items.map(item => {
    const displayStatus = isAdmin ? item.status : hostRequestStatus(item);
    return `<tr data-search-row="${escapeHtml(`${item.visitorName} ${item.id} ${item.host} ${displayStatus} ${item.status} ${item.purpose}`.toLowerCase())}" data-filter-state="${escapeHtml(displayStatus.toLowerCase())}">
    <td><a class="table-link" href="/${isAdmin ? 'admin' : 'host'}/requests/${encodeURIComponent(item.id)}" data-link>${escapeHtml(item.id)}</a></td>
    <td><span class="cell-primary">${escapeHtml(item.visitorName)}</span><span class="cell-secondary">${escapeHtml(item.email)}</span></td>
    ${isAdmin ? `<td>${escapeHtml(item.host)}</td>` : ''}<td>${escapeHtml(visitRange(item))}</td><td>${statusBadge(displayStatus)}</td><td>${escapeHtml(item.purpose)}</td>
    </tr>`;
  }).join('');
}
function hostRequestStatus(item) {
  if (item.status === 'Pending' || item.status === 'Rejected') return item.status;
  if (item.passStatus === 'Active') return 'Active';
  return item.passStatus || item.status;
}
function isWalkInRequest(item) {
  return Boolean(item && (item.walkIn || item.source === 'Walk-in' || item.createdBy === 'Walk-in kiosk' || item.hostApprovalStatus || item.adminApprovalStatus || item.status === 'Pending Host Approval' || item.status === 'Pending Admin Approval'));
}
function walkInStatusLabel(item) {
  if (!isWalkInRequest(item)) return item?.status || '—';
  if (item.status === 'Pending Host Approval') return 'Pending Host Approval';
  if (item.status === 'Pending Admin Approval') return 'Pending Admin Approval';
  if (item.status === 'Approved') return 'Approved';
  if (item.status === 'Rejected') return 'Rejected';
  return item.status || '—';
}
function requestCards(items, admin, walkIn = false) {
  if (!items.length) return `<div class="empty-state request-empty"><strong>${walkIn ? 'No walk-in requests' : 'No requests to show'}</strong>${walkIn ? 'New walk-in requests will appear here.' : 'Visitor requests will appear here.'}</div>`;
  return `<div class="request-grid">${items.map(item => {
    const href = `/${admin ? 'admin' : 'host'}/requests/${encodeURIComponent(item.id)}`;
    const displayStatus = walkIn ? walkInStatusLabel(item) : item.status;
    const validity = `${fmtDate(item.startsAt ? String(item.startsAt).slice(0, 10) : '')} – ${fmtDate(item.endsAt ? String(item.endsAt).slice(0, 10) : '')}`;
    const search = `${item.visitorName} ${item.email || ''} ${item.phone || ''} ${item.id} ${item.host} ${displayStatus} ${item.status} ${item.passStatus || ''} ${item.purpose}`.toLowerCase();
    return `<a class="request-card" href="${href}" data-link data-search-row="${escapeHtml(search)}" data-filter-state="${escapeHtml(`${displayStatus} ${item.passStatus || ''}`.toLowerCase())}">
      <div class="request-card-heading"><span class="request-card-visitor">${escapeHtml(item.visitorName)}</span>${statusBadge(displayStatus)}</div>
      <div class="request-card-id"><span>Request ID</span><strong>${escapeHtml(item.id)}</strong>${item.passStatus ? `<small>Pass status · ${escapeHtml(item.passStatus)}</small>` : ''}</div>
      <div class="request-card-meta"><span><small>Purpose</small><strong>${escapeHtml(item.purpose || '—')}</strong></span><span><small>Visit period</small><strong>${escapeHtml(validity)}</strong></span></div>
      ${admin ? `<div class="request-card-host"><small>Host</small><strong>${escapeHtml(item.host || '—')}</strong></div>` : ''}
      <span class="request-card-link">View request details <span aria-hidden="true">→</span></span>
    </a>`;
  }).join('')}</div>`;
}
function requestTable(items, isAdmin = false, tools = true, compact = false) {
  const rows = items.length ? items.map(item => {
    const link = `/${isAdmin ? 'admin' : 'host'}/requests/${encodeURIComponent(item.id)}`;
    if (compact) return `<tr data-search-row="${escapeHtml(`${item.visitorName} ${item.id} ${item.host} ${item.status}`.toLowerCase())}"><td><a class="table-link" href="${link}" data-link>${escapeHtml(item.visitorName)}</a><span class="cell-secondary">${escapeHtml(item.id)}</span></td><td>${escapeHtml(item.host)}</td><td>${escapeHtml(visitRange(item))}</td><td>${statusBadge(item.status)}</td></tr>`;
    return `<tr data-search-row="${escapeHtml(`${item.visitorName} ${item.id} ${item.host} ${item.status} ${item.purpose}`.toLowerCase())}"><td><a class="table-link" href="${link}" data-link>${escapeHtml(item.id)}</a></td><td><span class="cell-primary">${escapeHtml(item.visitorName)}</span><span class="cell-secondary">${escapeHtml(item.email)}</span></td>${isAdmin ? `<td>${escapeHtml(item.host)}</td>` : ''}<td>${escapeHtml(visitRange(item))}</td><td>${statusBadge(isAdmin ? item.status : hostRequestStatus(item))}</td><td>${escapeHtml(item.purpose)}</td></tr>`;
  }).join('') : `<tr><td colspan="${compact ? 4 : isAdmin ? 6 : 5}><div class="empty-state"><strong>Nothing to show yet</strong></div></td></tr>`;
  return `<section class="panel${compact ? ' compact-requests' : ''}"><div class="panel-head"><h2 class="panel-title">${isAdmin ? 'Requests' : 'Recent requests'}</h2>${tools ? `<a class="button button-quiet button-small" href="/${isAdmin ? 'admin' : 'host'}/requests" data-link>View all</a>` : ''}</div><div class="table-wrap"><table class="data-table ${compact ? 'dashboard-requests' : 'request-table'}"><thead><tr>${compact ? '<th>Visitor</th><th>Host</th><th>Visit period</th><th>Status</th>' : `<th>Request</th><th>Visitor</th>${isAdmin ? '<th>Host</th>' : ''}<th>Visit period</th><th>Status</th><th>Purpose</th>`}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function hostDashboard() {
  const own = state.requests.filter(taskOwner);
  const pending = own.filter(item => item.status === 'Pending').length;
  const approved = own.filter(item => item.status === 'Approved').length;
  const today = own.filter(item => item.startsAt?.slice(0, 10) === dateOffset(0) && item.status === 'Approved').length;
  return appFrame(`${heading('Good morning, Arjun', 'Your visitor requests and upcoming visits.', `<a class="button button-primary" href="/host/requests/new" data-link>${icon('plus')} New visitor request</a>`)}
    <div class="grid stat-grid">${statCard('Pending review', pending, 'clock')}${statCard('Approved visits', approved, 'check')}${statCard('Expected today', today, 'users')}${statCard('Requests this month', own.length, 'file')}</div>
    ${requestTable(own.slice(0, 5))}`);
}
function hostRequests() {
  const own = state.requests.filter(taskOwner).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const regular = own.filter(item => !isWalkInRequest(item));
  const walkIns = own.filter(item => isWalkInRequest(item));
  return appFrame(`${heading('Visitor requests', 'Track requests and their status.', `<a class="button button-primary" href="/host/requests/new" data-link>${icon('plus')} New request</a>`)}
    <section class="panel request-panel"><div class="panel-head"><h2 class="panel-title">Regular visitor requests</h2></div><div class="toolbar request-toolbar"><div class="toolbar-left"><div class="search-field">${icon('search')}<input type="search" placeholder="Search visitor or request" data-filter-search></div></div><div class="toolbar-right"><select class="filters" data-filter-status aria-label="Filter by status"><option value="">All statuses</option><option>Pending</option><option>Approved</option><option>Active</option><option>Rejected</option><option>Revoked</option><option>Expired</option><option>Completed</option></select></div></div>${requestCards(regular, false)}</section>
    <section class="panel request-panel"><div class="panel-head"><div><h2 class="panel-title">Walk-in Requests</h2><p class="panel-note">Requests awaiting host review.</p></div></div><div class="toolbar request-toolbar"><div class="toolbar-left"><div class="search-field">${icon('search')}<input type="search" placeholder="Search walk-in visitor" data-filter-search></div></div><div class="toolbar-right"><select class="filters" data-filter-status aria-label="Filter walk-in requests"><option value="">All walk-in statuses</option><option>Pending Host Approval</option><option>Pending Admin Approval</option><option>Approved</option><option>Rejected</option></select></div></div>${requestCards(walkIns, false, true)}</section>`);
}
function passCards(items, admin) {
  if (!items.length) return `<div class="empty-state pass-empty"><strong>No passes to show</strong>Approved visitor requests will appear here.</div>`;
  return `<div class="pass-grid">${items.map(item => {
    const href = `/${admin ? 'admin/visitors' : 'host/passes'}/${encodeURIComponent(item.id)}`;
    const contextLabel = admin ? 'Host' : 'Purpose';
    const contextValue = admin ? item.host : item.purpose;
    const validity = `${fmtDate(item.startsAt ? String(item.startsAt).slice(0, 10) : '')} – ${fmtDate(item.endsAt ? String(item.endsAt).slice(0, 10) : '')}`;
    const search = `${item.visitorName} ${item.id} ${item.passCode} ${item.host} ${item.purpose} ${item.passStatus} ${item.visitStatus}`.toLowerCase();
    return `<a class="pass-card" href="${href}" data-link data-pass-id="${escapeHtml(item.id)}" data-search-row="${escapeHtml(search)}" data-filter-state="${escapeHtml(String(item.passStatus || '').toLowerCase())}">
      <div class="pass-card-heading"><span class="pass-card-visitor">${escapeHtml(item.visitorName)}</span>${statusBadge(item.passStatus)}</div>
      <div class="pass-card-id"><span>Pass ID</span><strong>${escapeHtml(item.passCode)}</strong><small>Task ${escapeHtml(item.id)}</small></div>
      <div class="pass-card-meta"><span><small>Valid dates</small><strong>${escapeHtml(validity)}</strong></span><span><small>${contextLabel}</small><strong>${escapeHtml(contextValue)}</strong></span></div>
      <span class="pass-card-link">View pass details <span aria-hidden="true">→</span></span>
    </a>`;
  }).join('')}</div>`;
}
function passToolbar(items, label = 'Search visitor, task or pass') {
  const activeCount = items.filter(item => item.passStatus === 'Active').length;
  return `<div class="toolbar pass-toolbar"><div class="toolbar-left"><div class="search-field">${icon('search')}<input type="search" placeholder="${label}" data-filter-search></div></div><div class="toolbar-right"><select class="filters" data-filter-status aria-label="Filter passes by status"><option value="Active" selected>Active</option><option>Completed</option><option>Revoked</option><option>Expired</option><option value="">All</option></select><span class="pass-count">${activeCount} active ${activeCount === 1 ? 'pass' : 'passes'}</span></div></div>`;
}
function hostPasses() {
  const passes = state.requests.filter(item => taskOwner(item) && item.passCode);
  return appFrame(`${heading('Passes', 'Issued QR passes for your visitors.', '')}<section class="panel pass-panel">${passToolbar(passes)}${passCards(passes, false)}</section>`);
}
function newRequestPage(requestId = '') {
  const editing = Boolean(requestId);
  const item = editing ? getRequest(requestId) : null;
  if (editing && (!item || item.status !== 'Pending' || !taskOwner(item))) return appFrame(`${heading('Request not editable', 'Only pending requests can be changed.')}<a class="button" href="/host/requests/${encodeURIComponent(requestId)}" data-link>Back to request</a>`);
  const start = item ? new Date(item.startsAt) : new Date(Date.now() - 5 * 60 * 1000);
  const end = item ? new Date(item.endsAt) : new Date();
  if (!item) { end.setDate(end.getDate() + 1); end.setHours(17, 0, 0, 0); }
  const inputDate = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const inputTime = value => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  const purposeDetails = item?.purpose.startsWith('Other: ') ? item.purpose.slice(7) : '';
  const purpose = purposeDetails ? 'Other' : item?.purpose || '';
  return appFrame(`${heading(editing ? 'Edit visitor request' : 'New visitor request', editing ? 'Update the pending visitor task details.' : 'Schedule a visitor task for host review.')}<section class="form-card"><div class="panel-head"><div><h2 class="panel-title">Visitor details</h2><p class="panel-note">Enter contact details and the full period the visitor may use their QR pass.</p></div></div><div class="panel-body"><form id="request-form" class="request-form" data-request-id="${escapeHtml(requestId)}"><div class="form-grid">
    <div class="field"><label for="visitor-name">Visitor full name *</label><input id="visitor-name" name="visitorName" required maxlength="80" value="${escapeHtml(item?.visitorName || '')}" placeholder="e.g. Nisha Kapoor"></div>
    <div class="field"><label for="visitor-phone">Mobile number *</label><input id="visitor-phone" name="phone" required type="tel" inputmode="tel" value="${escapeHtml(item?.phone || '')}" placeholder="+91 98765 43210"></div>
    <div class="field"><label for="visitor-email">Email address *</label><input id="visitor-email" name="email" required type="email" value="${escapeHtml(item?.email || '')}" placeholder="visitor@example.in"></div>
    <div class="field"><label for="host-name">Host</label><input id="host-name" name="host" value="${escapeHtml(HOST_USER)} — Current Host" readonly aria-readonly="true"><span class="hint">This request will be assigned to your Host account.</span></div>
    <div class="field"><label for="start-date">Start date *</label><input id="start-date" name="startDate" required type="date" min="${editing ? '' : dateOffset(0)}" value="${inputDate(start)}"></div>
    <div class="field"><label for="start-time">Start time *</label><input id="start-time" name="startTime" required type="time" value="${inputTime(start)}"></div>
    <div class="field"><label for="end-date">End date *</label><input id="end-date" name="endDate" required type="date" min="${editing ? '' : dateOffset(0)}" value="${inputDate(end)}"></div>
    <div class="field"><label for="end-time">End time *</label><input id="end-time" name="endTime" required type="time" value="${inputTime(end)}"></div>
    <div class="field"><label for="visit-purpose">Purpose of visit *</label><select id="visit-purpose" name="purpose" required><option value="">Select a purpose</option><option${purpose === 'Job Interview' ? ' selected' : ''}>Job Interview</option><option${purpose === 'Meeting' ? ' selected' : ''}>Meeting</option><option${purpose === 'Delivery / Service' ? ' selected' : ''}>Delivery / Service</option><option${purpose === 'Other' ? ' selected' : ''}>Other</option></select></div>
    <div class="field" id="purpose-details-field"${purpose === 'Other' ? '' : ' hidden'}><label for="purpose-details">Purpose details *</label><input id="purpose-details" name="purposeDetails" maxlength="120" value="${escapeHtml(purposeDetails)}" placeholder="Briefly describe the visit"${purpose === 'Other' ? ' required' : ''}></div>
    <div class="field full"><label for="location-of-work">Location of Work *</label><input id="location-of-work" name="locationOfWork" required maxlength="120" value="${escapeHtml(item?.locationOfWork || '')}" placeholder="e.g. Conference Room 2, Main Block"></div>
    </div><div class="form-actions"><a class="button" href="${editing ? `/host/requests/${encodeURIComponent(requestId)}` : '/host/requests'}" data-link>Cancel</a><button class="button button-primary" type="submit">${editing ? 'Save changes' : 'Submit for review'}</button></div></form></div></section>`);
}
  function requestDetails(id, admin, passMode = false) {
  const item = getRequest(id);
  if (!item || (!admin && !taskOwner(item))) return appFrame(`${heading('Request not found', 'This request may have been removed or is not available in your workspace.')}<a class="button" href="/${admin ? 'admin' : 'host'}/requests" data-link>Back to requests</a>`);
  const details = [['Visitor', item.visitorName], ['Email', item.email], ['Mobile number', item.phone], ['Validity period', visitRange(item)], ['Purpose', item.purpose], ['Location of Work', item.locationOfWork || '—'], ['Host', item.host], ['Pass ID', item.passCode || 'Not issued']];
  if (item.purpose.startsWith('Other: ')) details.push(['Purpose details', item.purpose.slice(7)]);
  if (isWalkInRequest(item)) {
    details.push(['Request time', fmtDateTime(item.createdAt)]);
    details.push(['Host approval', item.hostApprovalStatus || 'Pending']);
    details.push(['Admin approval', item.adminApprovalStatus || 'Pending']);
  }
  if (passMode) {
    details.push(['Request status', item.status], ['Created by', item.createdBy || item.host]);
    if (item.adminApprovalStatus) details.push(['Admin approval', item.adminApprovalStatus]);
    if (item.hostApprovalStatus) details.push(['Host approval', item.hostApprovalStatus]);
    if (item.passStatus === 'Revoked') {
      details.push(['Revocation reason', item.revocationReason || 'No reason was recorded for this pass.']);
      if (item.revokedAt) details.push(['Revoked at', fmtDateTime(item.revokedAt)]);
      if (item.revokedBy) details.push(['Revoked by', item.revokedBy]);
    }
    (item.visits || []).forEach((visit, index) => details.push([`${visit.type === 'check-in' ? 'Check-in' : 'Check-out'} activity ${index + 1}`, `${fmtDateTime(visit.at)} · ${visit.actor || 'Kiosk'}`]));
  }
  const actions = [];
  if (!admin && !passMode && item.status === 'Pending') actions.push(`<a class="button button-primary" href="/host/requests/${encodeURIComponent(item.id)}/edit" data-link>Edit request</a>`);
  if (!admin && isWalkInRequest(item) && item.status === 'Pending Host Approval') actions.push(`<button class="button button-danger" data-action="reject-walkin" data-id="${item.id}">Reject</button><button class="button button-primary" data-action="accept-walkin" data-id="${item.id}">${icon('check')} Accept</button>`);
  if (admin && item.status === 'Pending') actions.push(`<button class="button button-danger" data-action="reject" data-id="${item.id}">Reject</button><button class="button button-primary" data-action="approve" data-id="${item.id}">${icon('check')} Approve request</button>`);
  if (admin && isWalkInRequest(item) && item.status === 'Pending Admin Approval') actions.push(`<button class="button button-danger" data-action="reject-walkin-admin" data-id="${item.id}">Reject</button><button class="button button-primary" data-action="approve-walkin-admin" data-id="${item.id}">${icon('check')} Approve walk-in</button>`);
  if ((admin || taskOwner(item)) && item.status === 'Approved' && item.passStatus === 'Active') actions.push(`<button class="button button-danger" data-action="revoke" data-id="${item.id}">Revoke pass</button>`);
  if (!admin && item.status === 'Approved' && item.passStatus === 'Active') actions.push(`<button class="button button-primary" data-action="complete-visit" data-id="${item.id}">Mark visit/task as done</button>`);
  const logs = state.audit.filter(entry => entry.subject === item.visitorName || entry.detail.includes(item.id)).slice(0, 8);
  const backHref = passMode ? (admin ? '/admin/visitors' : '/host/passes') : `/${admin ? 'admin' : 'host'}/requests`;
  return appFrame(`${heading(item.visitorName, `${passMode ? 'Pass' : isWalkInRequest(item) ? 'Walk-in request' : 'Request'} ${item.id} · submitted ${fmtDateTime(item.createdAt)}`, `<a class="button" href="${backHref}" data-link>${icon('back')} ${passMode ? 'All passes' : 'All requests'}</a>`)}
    <div class="request-layout"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">${passMode ? 'Pass details' : isWalkInRequest(item) ? 'Walk-in request' : 'Visitor task'}</h2><p class="panel-note">Request ${escapeHtml(item.id)}</p></div>${statusBadge(passMode ? item.passStatus || walkInStatusLabel(item) : walkInStatusLabel(item))}</div><div class="panel-body"><div class="detail-list">${details.map(([label, value]) => `<div class="detail-item"><label>${label}</label><div>${escapeHtml(value)}</div></div>`).join('')}<div class="detail-item"><label>Pass status</label><div>${item.passStatus ? statusBadge(item.passStatus) : '—'}</div></div><div class="detail-item"><label>Current visit</label><div>${statusBadge(item.visitStatus)}</div></div><div class="detail-item"><label>Recorded arrivals</label><div>${(item.visits || []).filter(entry => entry.type === 'check-in').length}</div></div></div>${item.status === 'Rejected' ? `<div class="notice notice-warn" style="margin-top:20px">This request was not approved. Update the visit details and submit a new task if needed.</div>` : ''}<div class="form-actions">${actions.join('')}</div></div></section>
    <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Activity</h2><p class="panel-note">Request and visit updates</p></div></div><div class="panel-body"><div class="timeline">${logs.length ? logs.map(log => `<div class="timeline-item"><p class="timeline-title">${escapeHtml(log.action)}</p><p class="timeline-time">${escapeHtml(log.detail)} · ${fmtDateTime(log.at)}</p></div>`).join('') : `<div class="timeline-item"><p class="timeline-title">Request submitted</p><p class="timeline-time">${fmtDateTime(item.createdAt)}</p></div>`}</div></div></section></div>`);
}
function hostHistory() {
  const visits = state.requests.filter(item => taskOwner(item) && (item.visits || []).length);
  const events = visits.flatMap(item => (item.visits || []).map(entry => ({ ...entry, item }))).sort((a, b) => b.at.localeCompare(a.at));
  return appFrame(`${heading('Visit history', 'Arrivals and departures recorded against your visitors.')}<section class="panel"><div class="table-wrap"><table><thead><tr><th>Time</th><th>Movement</th><th>Visitor / task</th><th>QR status</th><th>Host</th></tr></thead><tbody>${events.length ? events.map(entry => `<tr data-search-row="${escapeHtml(`${entry.item.visitorName} ${entry.item.id} ${entry.item.host} ${entry.type}`.toLowerCase())}"><td>${fmtDateTime(entry.at)}</td><td>${statusBadge(entry.type === 'check-in' ? 'Checked in' : 'Checked out')}</td><td><a class="table-link" href="/host/requests/${entry.item.id}" data-link>${escapeHtml(entry.item.visitorName)}</a><span class="cell-secondary">${escapeHtml(entry.item.id)}</span></td><td>${statusBadge(entry.item.passStatus || 'Active')}</td><td>${escapeHtml(entry.item.host)}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state"><strong>No visit history yet</strong>Arrivals and departures will appear after visitors use their QR pass.</div></td></tr>`}</tbody></table></div></section>`);
}
function adminDashboard() {
  const pending = state.requests.filter(item => item.status === 'Pending').length;
  const today = state.requests.filter(item => item.startsAt?.slice(0, 10) === dateOffset(0) && item.status === 'Approved').length;
  const active = state.requests.filter(item => item.passStatus === 'Active').length;
  const recent = [...state.audit].slice(0, 4);
  const relevant = state.requests.filter(item => item.status === 'Pending' || item.passStatus === 'Active').slice(0, 4);
  return appFrame(`${heading('Overview', 'Review visitor requests and monitor active passes.', `<a class="button" href="/admin/requests" data-link>Visitor Requests</a>`)}<div class="grid stat-grid">${statCard('Awaiting review', pending, 'clock')}${statCard('Expected today', today, 'users')}${statCard('Active visitors', active, 'pass')}</div>
    <div class="request-layout dashboard-layout">${requestTable(relevant, true, true, true)}<section class="panel"><div class="panel-head"><h2 class="panel-title">Recent activity</h2><a href="/admin/audit" data-link class="table-link" style="font-size:11px">Audit Log</a></div><div class="panel-body"><div class="timeline">${recent.map(log => `<div class="timeline-item"><p class="timeline-title">${escapeHtml(log.action)} · ${escapeHtml(log.subject)}</p><p class="timeline-time">${escapeHtml(log.detail)} · ${fmtDateTime(log.at)}</p></div>`).join('')}</div></div></section></div>`);
}
function adminRequests() {
  const sorted = state.requests.filter(item => !isWalkInRequest(item) && (item.status === 'Pending' || item.status === 'Rejected')).sort((a, b) => (a.status === 'Pending' ? -1 : 1) - (b.status === 'Pending' ? -1 : 1) || b.createdAt.localeCompare(a.createdAt));
  const walkIns = state.requests.filter(item => isWalkInRequest(item) && item.status === 'Pending Admin Approval').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return appFrame(`${heading('Visitor Requests', 'Review and manage visitor access requests and host-approved walk-ins.', '')}<section class="panel request-panel"><div class="panel-head"><h2 class="panel-title">Regular visitor requests</h2></div><div class="toolbar request-toolbar"><div class="toolbar-left"><div class="search-field">${icon('search')}<input type="search" placeholder="Search visitor, host or ID" data-filter-search></div></div><div class="toolbar-right"><select class="filters" data-filter-status aria-label="Filter by status"><option value="">Pending & rejected</option><option>Pending</option><option>Rejected</option></select></div></div>${requestCards(sorted, true)}</section>
  <section class="panel request-panel"><div class="panel-head"><div><h2 class="panel-title">Walk-in Requests Awaiting Approval</h2><p class="panel-note">Host-accepted walk-ins waiting for admin review.</p></div></div><div class="toolbar request-toolbar"><div class="toolbar-left"><div class="search-field">${icon('search')}<input type="search" placeholder="Search walk-in visitor" data-filter-search></div></div><div class="toolbar-right"><select class="filters" data-filter-status aria-label="Filter walk-in requests"><option value="">Pending admin approval</option><option>Pending Admin Approval</option><option>Rejected</option></select></div></div>${requestCards(walkIns, true, true)}</section>`);
}
function adminVisitors() {
  const rows = state.requests.filter(item => item.passCode);
  return appFrame(`${heading('Passes', 'Manage issued visitor passes.', '')}<section class="panel pass-panel">${passToolbar(rows, 'Search visitor, task or QR')}${passCards(rows, true)}</section>`);
}
function adminHosts() {
  const addButton = `<button class="button button-primary" data-action="show-add-host">${icon('plus')} Add host</button>`;
  const form = hostFormOpen ? `<section class="form-card" style="margin-bottom:16px"><div class="panel-head"><div><h2 class="panel-title">Add directory entry</h2><p class="panel-note">Add a host to the directory.</p></div><button class="icon-button" type="button" data-action="cancel-add-host" aria-label="Close form">×</button></div><div class="panel-body"><form id="host-form"><div class="form-grid"><div class="field"><label for="employee-name">Host name *</label><input id="employee-name" name="name" required maxlength="80"></div><div class="field"><label for="employee-department">Department *</label><input id="employee-department" name="department" required maxlength="80"></div><div class="field"><label for="employee-email">Work email *</label><input id="employee-email" name="email" type="email" required></div><div class="field"><label for="employee-id">ID *</label><input id="employee-id" name="employeeId" required maxlength="24"></div></div><div class="form-actions"><button class="button" type="button" data-action="cancel-add-host">Cancel</button><button class="button button-primary" type="submit">Add to directory</button></div></form></div></section>` : '';
  return appFrame(`${heading('Hosts', 'Maintain the host directory.', addButton)}${form}<section class="panel"><div class="toolbar"><div class="toolbar-left"><div class="search-field">${icon('search')}<input type="search" placeholder="Search host or department" data-filter-search></div></div><span class="role-label">${state.hosts.length} hosts</span></div><div class="table-wrap"><table><thead><tr><th>Host</th><th>Department</th><th>Email</th><th>ID</th><th>Requests</th></tr></thead><tbody>${state.hosts.map(host => `<tr data-search-row="${escapeHtml(`${host.name} ${host.department} ${host.email}`.toLowerCase())}"><td class="cell-primary">${escapeHtml(host.name)}</td><td>${escapeHtml(host.department)}</td><td>${escapeHtml(host.email)}</td><td>${escapeHtml(host.employeeId)}</td><td>${state.requests.filter(item => item.host === host.name).length}</td></tr>`).join('')}</tbody></table></div></section>`);
}
function adminAudit() {
  return appFrame(`${heading('Audit log', 'Request, pass and visitor movement activity.')}<section class="panel"><div class="toolbar"><div class="toolbar-left"><div class="search-field">${icon('search')}<input type="search" placeholder="Search activity, person or actor" data-filter-search></div></div><span class="role-label">${state.audit.length} events</span></div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Visitor / subject</th><th>Details</th><th>Actor</th></tr></thead><tbody>${state.audit.map(log => `<tr data-search-row="${escapeHtml(`${log.action} ${log.subject} ${log.detail} ${log.actor}`.toLowerCase())}"><td>${fmtDateTime(log.at)}</td><td class="cell-primary">${escapeHtml(log.action)}</td><td>${escapeHtml(log.subject)}</td><td>${escapeHtml(log.detail)}</td><td>${escapeHtml(log.actor)}</td></tr>`).join('')}</tbody></table></div></section>`);
}
function loginPage() {
  return `<div class="login-page"><main class="login-main"><div class="login-box"><a class="brand login-brand" href="/login" data-link><span class="brand-mark">${icon('brand')}</span> VMS</a><h1>Sign in</h1><div class="login-options"><a class="login-option" href="/login/host" data-link><span class="option-icon">${icon('users')}</span><span><strong>Continue as Host</strong><small>${HOST_USER}</small></span></a><a class="login-option" href="/login/admin" data-link><span class="option-icon">${icon('grid')}</span><span><strong>Continue as Admin</strong></span></a></div><a href="/kiosk" data-link class="button login-kiosk">Visitor Kiosk ${icon('out')}</a></div></main></div>`;
}
function roleLoginPage(selectedRole) {
  const admin = selectedRole === 'admin';
  const email = admin ? 'admin@company.in' : 'arjun.kumar@company.in';
  const title = admin ? 'Admin Login' : 'Host Login';
  return `<div class="login-page"><main class="login-main"><div class="login-box"><div class="login-brand-row"><a class="brand login-brand" href="/login" data-link><span class="brand-mark">${icon('brand')}</span> VMS</a></div><p class="eyebrow">${admin ? 'Admin' : 'Host'}</p><h1>${title}</h1><form id="role-login-form" data-role="${selectedRole}"><div class="login-fields"><div class="field"><label for="login-email">Email</label><input id="login-email" name="email" type="email" required value="${email}" autocomplete="username"></div><div class="field"><label for="login-password">Password</label><input id="login-password" name="password" type="password" required value="vmsentry" autocomplete="current-password"></div></div><button class="button button-primary login-submit" type="submit">Login</button></form></div></main></div>`;
}

function resetIdle() {
  clearTimeout(idleTimer);
  if (location.pathname !== '/kiosk') return;
  idleTimer = setTimeout(() => {
    clearTimeout(scanTimer); clearTimeout(validationTimer); clearTimeout(flowTimer); clearTimeout(successTimer);
    moveKioskStage('home', () => { kioskRecordId = ''; kioskWalkIn = null; kioskError = ''; presentationWorkflow = false; });
  }, 90000);
}
function cancelKioskExit() {
  clearTimeout(kioskExitTimer);
  if (kioskExitNode && kioskExitHandler) kioskExitNode.removeEventListener('animationend', kioskExitHandler);
  kioskExitTimer = undefined;
  kioskExitNode = undefined;
  kioskExitHandler = undefined;
}
function moveKioskStage(nextStage, beforeRender = () => {}) {
  cancelKioskExit();
  const current = document.querySelector('.kiosk-main');
  const finish = () => {
    cancelKioskExit();
    if (location.pathname !== '/kiosk') return;
    kioskStage = nextStage;
    beforeRender();
    render();
  };
  if (!current) { finish(); return; }
  kioskExitNode = current;
  kioskExitHandler = event => {
    if (event.target === current && event.animationName === 'kiosk-exit') finish();
  };
  current.addEventListener('animationend', kioskExitHandler);
  current.classList.add('stage-leave');
  kioskExitTimer = setTimeout(finish, 264);
}
function kioskHome() {
  return `<div class="kiosk-content kiosk-home"><div class="kiosk-hero"><h1>Welcome</h1><p>We're happy to have you here.</p></div><div class="kiosk-actions"><button class="kiosk-action" data-action="kiosk-scan"><span class="kiosk-action-icon">${icon('scan')}</span><span class="kiosk-action-copy"><strong>Scan QR Code</strong><small>Have your visitor pass ready to check in.</small></span></button><button class="kiosk-action" data-action="kiosk-walkin"><span class="kiosk-action-icon">${icon('walk')}</span><span class="kiosk-action-copy"><strong>Walk-in Visit</strong><small>Visiting without a pass? Start here.</small></span></button><button class="kiosk-action" data-action="kiosk-checkout"><span class="kiosk-action-icon">${icon('out')}</span><span class="kiosk-action-copy"><strong>Check Out</strong><small>Heading out? Please check out before you leave.</small></span></button></div></div>`;
}
function kioskSteps(current) {
  const steps = ['Scan', 'Confirm details', scanPurpose === 'check-out' ? 'Check out' : 'Check in'];
  return `<div class="kiosk-step">${steps.map((step, i) => `<span class="${i === current ? 'current' : ''}"><i></i>${step}</span>`).join('<span>·</span>')}</div>`;
}
function kioskScan() {
  return `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-card-head"><h1>${scanPurpose === 'check-out' ? "Let's get you checked out." : "Let's get you checked in."}</h1><p>Show your visitor QR code to the scanner.</p></div>${kioskSteps(0)}<div class="scanner-graphic" aria-hidden="true"><span class="scanner-corner top-left"></span><span class="scanner-corner top-right"></span><span class="scanner-corner bottom-left"></span><span class="scanner-corner bottom-right"></span><span class="scanner-beam"></span>${icon('scan')}</div>${manualQrEntryOpen ? `<form id="qr-scan-form"><div class="field"><label for="qr-code">QR code</label><input id="qr-code" name="code" autocomplete="off" required placeholder="Enter QR code"></div><div class="kiosk-actions-row"><button class="button" type="button" data-action="kiosk-home">Cancel</button><button class="button button-primary" type="submit">Continue</button></div></form>` : `<div class="workflow-shortcut"><button class="button button-quiet button-small" type="button" data-action="manual-qr-entry">Having trouble scanning?</button></div><div class="kiosk-actions-row"><button class="button" type="button" data-action="kiosk-home">Return to welcome</button></div>`}<div class="workflow-shortcut"><button class="button button-quiet button-small" type="button" data-action="show-workflow">Show Workflow</button></div></section></div>`;
}
function kioskScanning() {
  return `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-feedback scanning"><span class="feedback-symbol">${icon('scan')}</span><h1>Reading your visitor pass...</h1><p>Keep your QR code in view.</p><div class="progress-track"><div class="progress-bar"></div></div></div></section></div>`;
}
function kioskValidating() {
  return `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-feedback scanning"><span class="feedback-symbol">${icon('check')}</span><h1>Just a moment.</h1><p>We're checking your visitor pass.</p><div class="progress-track"><div class="progress-bar"></div></div></div></section></div>`;
}
function kioskInvalid(message) {
  return `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-feedback"><span class="feedback-symbol error">${icon('check')}</span><h1>We couldn't verify your pass</h1><p>${escapeHtml(message)}</p><div class="kiosk-actions-row"><button class="button" data-action="kiosk-retry">Scan another pass</button><button class="button button-primary" data-action="kiosk-home">Return to welcome</button></div></div></section></div>`;
}
function startQrScan(code) {
  presentationWorkflow = false;
  manualQrEntryOpen = false;
  scannedCode = code;
  clearTimeout(scanTimer);
  clearTimeout(validationTimer);
  moveKioskStage('scanning', () => {
    scanTimer = setTimeout(() => {
      if (location.pathname !== '/kiosk') return;
      moveKioskStage('validating', () => {
        validationTimer = setTimeout(() => {
          if (location.pathname !== '/kiosk') return;
      const result = validatePass(scannedCode, scanPurpose);
      if (result.error) {
        moveKioskStage('invalid', () => { kioskError = result.error; });
      } else {
        moveKioskStage(scanPurpose === 'check-out' ? 'checkout-details' : 'details', () => { kioskRecordId = result.item.id; });
      }
        }, KIOSK_STAGE_DISPLAY_MS);
      });
    }, KIOSK_STAGE_DISPLAY_MS);
  });
}
function startPresentationWorkflow() {
  presentationWorkflow = true;
  kioskRecordId = '';
  clearTimeout(scanTimer);
  clearTimeout(validationTimer);
  moveKioskStage('scanning', () => {
    scanTimer = setTimeout(() => {
      if (location.pathname !== '/kiosk' || !presentationWorkflow) return;
      moveKioskStage('validating', () => {
        validationTimer = setTimeout(() => {
          if (location.pathname === '/kiosk' && presentationWorkflow) moveKioskStage('workflow-details');
        }, KIOSK_STAGE_DISPLAY_MS);
      });
    }, KIOSK_STAGE_DISPLAY_MS);
  });
}
function kioskVisitorDetails(record, walkIn = false) {
  const visitor = walkIn ? kioskWalkIn : record;
  if (walkIn) {
    const details = [['Visitor', visitor.name], ['Mobile number', visitor.phone], ['Email', visitor.email || 'Not provided'], ['Host', visitor.host], ['Purpose', visitor.purpose === 'Other' ? visitor.purposeDetails : visitor.purpose], ['Location of Work', visitor.locationOfWork]];
    return `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-card-head"><h1>You're all set.</h1><p>Your request has been sent to your host for review.<span class="walkin-success-note">You'll get an email with the details of your visit.</span></p></div><div class="kiosk-details">${details.map(([label, value]) => `<div><label>${label}</label><strong>${escapeHtml(value)}</strong></div>`).join('')}</div><div class="kiosk-actions-row"><button class="button button-primary" data-action="kiosk-home">${icon('check')} Return to welcome</button></div></section></div>`;
  }
  const details = [['Visitor', record.visitorName], ['Host', record.host], ['Validity', visitRange(record)], ['Purpose', record.purpose], ['QR task', record.id]];
  const checkout = scanPurpose === 'check-out';
  const greetingName = escapeHtml(record.visitorName || '');
  const hostName = escapeHtml(record.host || 'your host');
  return `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-card-head"><h1>${checkout ? `Thanks for visiting, ${greetingName}.` : `Welcome, ${greetingName}.`}</h1><p>${checkout ? `You're checking out of your visit with ${hostName}.` : `You're checking in for your visit with ${hostName}.`}</p></div>${kioskSteps(1)}<div class="kiosk-details">${details.map(([label, value]) => `<div><label>${label}</label><strong>${escapeHtml(value)}</strong></div>`).join('')}</div><div class="kiosk-actions-row"><button class="button" data-action="kiosk-home">Cancel</button><button class="button button-primary" data-action="${checkout ? 'kiosk-confirm-checkout' : 'kiosk-confirm-checkin'}">${icon('check')} Confirm ${checkout ? 'check-out' : 'check-in'}</button></div></section></div>`;
}
function walkinProgress(current) {
  const steps = ['Your details', 'Host', 'Purpose', 'Location', 'Review', 'OTP'];
  return `<div class="walkin-progress" aria-label="Step ${current + 1} of ${steps.length}">${steps.map((step, index) => `<span class="${index === current ? 'current' : index < current ? 'complete' : ''}"${index === current ? ' aria-current="step"' : ''}><i>${index < current ? '✓' : index + 1}</i><b>${step}</b></span>`).join('')}</div>`;
}
function walkinStep(title, subtitle, step, body) {
  return `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-card-head"><h1>${title}</h1><p>${subtitle}</p></div>${walkinProgress(step)}${body}</section></div>`;
}
function kioskWalkinIntro() {
  return `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-card-head"><h1>Let's get your visit started.</h1><p>Just a few quick details, and we'll send your request to your host.</p></div><div class="kiosk-actions-row"><button class="button" type="button" data-action="kiosk-home">Return to welcome</button><button class="button button-primary" type="button" data-action="walkin-start">Let's get started</button></div></section></div>`;
}
function kioskWalkinStep() {
  const draft = kioskWalkIn || {};
  if (kioskStage === 'walkin-visitor') return walkinStep('First, tell us a little about you.', "What's your name?", 0, `<form id="walkin-visitor-form"><div class="form-grid"><div class="field full"><label for="walk-name">Full name *</label><input id="walk-name" name="name" required maxlength="80" value="${escapeHtml(draft.name ?? 'Rahul Menon')}" autocomplete="name" placeholder="Your full name"></div><div class="field"><label for="walk-phone">Mobile number *</label><input id="walk-phone" name="phone" type="tel" required value="${escapeHtml(draft.phone ?? '+91 98220 45678')}" autocomplete="tel" placeholder="+91 98765 43210"></div><div class="field"><label for="walk-email">Email address</label><input id="walk-email" name="email" type="email" value="${escapeHtml(draft.email ?? 'rahul.menon.guest@example.in')}" autocomplete="email" placeholder="visitor@example.in"></div></div>${kioskError ? `<div class="notice notice-warn">${escapeHtml(kioskError)}</div>` : ''}<div class="kiosk-actions-row"><button class="button" type="button" data-action="kiosk-home">Cancel</button><button class="button button-primary" type="submit">Continue</button></div></form>`);
  if (kioskStage === 'walkin-host') return walkinStep('Who are you here to see?', 'Choose your host from the directory.', 1, `<form id="walkin-host-form"><div class="field"><label for="walk-host">Host *</label>${hostSelector('walk-host', draft.host || 'Arjun Kumar')}</div><div class="kiosk-actions-row"><button class="button" type="button" data-action="walkin-back" data-stage="walkin-visitor">Back</button><button class="button button-primary" type="submit">Continue</button></div></form>`);
  if (kioskStage === 'walkin-purpose') return walkinStep('What brings you in today?', 'Choose the reason for your visit.', 2, `<form id="walkin-purpose-form"><div class="field"><label for="walk-purpose">Purpose of visit *</label><select id="walk-purpose" name="purpose" required><option value="">Choose a purpose</option>${['Job Interview', 'Meeting', 'Delivery / Service', 'Other'].map(value => `<option${draft.purpose === value ? ' selected' : ''}>${value}</option>`).join('')}</select></div><div class="field" id="walk-purpose-details-field"${draft.purpose === 'Other' ? '' : ' hidden'}><label for="walk-purpose-details">Purpose details *</label><input id="walk-purpose-details" name="purposeDetails" maxlength="120" value="${escapeHtml(draft.purposeDetails || '')}" placeholder="Briefly describe your visit"${draft.purpose === 'Other' ? ' required' : ''}></div>${kioskError ? `<div class="notice notice-warn">${escapeHtml(kioskError)}</div>` : ''}<div class="kiosk-actions-row"><button class="button" type="button" data-action="walkin-back" data-stage="walkin-host">Back</button><button class="button button-primary" type="submit">Continue</button></div></form>`);
  if (kioskStage === 'walkin-location') return walkinStep('Where will your visit take place?', 'Add the room or area where you will be working.', 3, `<form id="walkin-location-form"><div class="field"><label for="walk-location-of-work">Location of Work *</label><input id="walk-location-of-work" name="locationOfWork" required maxlength="120" value="${escapeHtml(draft.locationOfWork || '')}" placeholder="e.g. Conference Room 2, Main Block"></div><div class="kiosk-actions-row"><button class="button" type="button" data-action="walkin-back" data-stage="walkin-purpose">Back</button><button class="button button-primary" type="submit">Review details</button></div></form>`);
  if (kioskStage === 'walkin-review') {
    const purpose = draft.purpose === 'Other' ? draft.purposeDetails : draft.purpose;
    const details = [['Visitor', draft.name], ['Mobile', draft.phone], ['Email', draft.email || 'Not provided'], ['Host', draft.host], ['Purpose', purpose], ['Location of Work', draft.locationOfWork]];
    return walkinStep("Let's make sure everything looks right.", 'You can go back to any step to make a change.', 4, `<div class="kiosk-details">${details.map(([label, value]) => `<div><label>${label}</label><strong>${escapeHtml(value)}</strong></div>`).join('')}</div><div class="kiosk-actions-row"><button class="button" type="button" data-action="walkin-back" data-stage="walkin-location">Back</button><button class="button button-primary" type="button" data-action="walkin-continue-otp">Continue</button></div>`);
  }
  return '';
}
function kioskOtp() {
  return walkinStep('One last step.', `Enter the code sent to ${escapeHtml(kioskWalkIn.phone)}.`, 5, `<form id="otp-form"><div class="field"><label for="otp-code">Verification code</label><input id="otp-code" name="otp" inputmode="numeric" maxlength="6" required placeholder="6-digit code" autocomplete="one-time-code"><span class="hint">Verification code: <strong>246810</strong></span></div>${kioskError ? `<div class="notice notice-warn" style="margin-top:11px">${escapeHtml(kioskError)}</div>` : ''}<div class="kiosk-actions-row"><button class="button" type="button" data-action="walkin-back" data-stage="walkin-review">Back</button><button class="button button-primary" type="submit">Verify and send request</button></div></form>`);
}
function kioskSignout() {
  scanPurpose = 'check-out';
  return kioskScan();
}
function kioskRender() {
  const stageChanged = appRouteChanged || lastRenderedKioskStage !== kioskStage;
  lastRenderedKioskStage = kioskStage;
  let content = kioskHome();
  const presentationRecord = {
    id: 'VMS-1088', visitorName: 'Rahul Menon', phone: '+91 98220 45678', email: 'rahul.menon@example.in',
    host: 'Priya Sharma', purpose: 'Meeting', startsAt: localDateTimeOffset(0, 10), endsAt: localDateTimeOffset(0, 12),
    passCode: 'VMS-8H4K2N', visitStatus: 'Outside', passStatus: 'Active', status: 'Approved'
  };
  const record = presentationWorkflow ? presentationRecord : getRequest(kioskRecordId);
  if (kioskStage === 'scan') content = kioskScan();
  if (kioskStage === 'scanning') content = kioskScanning();
  if (kioskStage === 'validating') content = kioskValidating();
  if (kioskStage === 'invalid') content = kioskInvalid(kioskError);
  if ((kioskStage === 'details' || kioskStage === 'checkout-details' || kioskStage === 'workflow-details') && record) content = kioskVisitorDetails(record);
  if (kioskStage === 'walkin-intro') content = kioskWalkinIntro();
  if (['walkin-visitor', 'walkin-host', 'walkin-purpose', 'walkin-location', 'walkin-review'].includes(kioskStage)) content = kioskWalkinStep();
  if (kioskStage === 'otp') content = kioskOtp();
  if (kioskStage === 'walkin-details' && kioskWalkIn) content = kioskVisitorDetails(null, true);
  if (kioskStage === 'walkin-submitting') content = `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-feedback scanning"><span class="feedback-symbol">${icon('check')}</span><h1>Sending your request to your host.</h1><p>Just a moment.</p><div class="progress-track"><div class="progress-bar"></div></div></div></section></div>`;
  if (kioskStage === 'signout') content = kioskSignout();
  if (kioskStage === 'checkin-confirmed') content = `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-feedback"><span class="feedback-symbol">${icon('check')}</span><h1>You're all checked in.</h1><p>Your arrival is recorded. Your badge is being prepared.</p></div></section></div>`;
  if (kioskStage === 'printing') content = `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-feedback"><span class="feedback-symbol">${icon('printer')}</span><h1>Preparing your visitor badge.</h1><p>Please wait a moment.</p><div class="progress-track"><div class="progress-bar"></div></div></div></section></div>`;
  if (kioskStage === 'success') content = `<div class="kiosk-content"><section class="kiosk-card"><div class="kiosk-feedback"><span class="feedback-symbol">${icon('check')}</span><h1>${escapeHtml(kioskSuccessTitle)}</h1><p>${escapeHtml(kioskSuccessMessage)}</p></div></section></div>`;
  return `<div class="kiosk"><header class="kiosk-top"><a href="/kiosk" data-link class="kiosk-brand"><span class="brand-mark">${icon('brand')}</span> VMS</a><span class="kiosk-clock" data-clock></span></header><main class="kiosk-main${stageChanged ? ' kiosk-stage-enter' : ''}" data-stage="${escapeHtml(kioskStage)}">${content}</main><footer class="kiosk-footer"><button data-action="reset-data">Restore records</button></footer></div>`;
}

function render() {
  safeRoute();
  const route = location.pathname;
  appRouteChanged = route !== lastAppRoute;
  lastAppRoute = route;
  if (route !== '/kiosk') {
    cancelKioskExit();
    clearTimeout(idleTimer); clearTimeout(scanTimer); clearTimeout(validationTimer);
    clearTimeout(successTimer); clearTimeout(flowTimer);
  }
  if (!presentationWorkflow) refreshExpiredPasses();
  const path = route;
  let html;
  if (path === '/login') html = loginPage();
  else if (path === '/login/host') html = roleLoginPage('host');
  else if (path === '/login/admin') html = roleLoginPage('admin');
  else if (path === '/kiosk') html = kioskRender();
  else if (path === '/host/dashboard') html = hostDashboard();
  else if (path === '/host/requests') html = hostRequests();
  else if (path === '/host/requests/new') html = newRequestPage();
  else if (path.match(/^\/host\/requests\/[^/]+\/edit$/)) html = newRequestPage(decodeURIComponent(path.split('/').at(-2)));
  else if (path.startsWith('/host/requests/')) html = requestDetails(decodeURIComponent(path.split('/').pop()), false);
  else if (path === '/host/passes') html = hostPasses();
  else if (path.startsWith('/host/passes/')) html = requestDetails(decodeURIComponent(path.split('/').pop()), false, true);
  else if (path === '/host/history') html = hostHistory();
  else if (path === '/admin/dashboard') html = adminDashboard();
  else if (path === '/admin/requests') html = adminRequests();
  else if (path.startsWith('/admin/requests/')) html = requestDetails(decodeURIComponent(path.split('/').pop()), true);
  else if (path === '/admin/visitors') html = adminVisitors();
  else if (path.startsWith('/admin/visitors/')) html = requestDetails(decodeURIComponent(path.split('/').pop()), true, true);
  else if (path === '/admin/hosts') html = adminHosts();
  else if (path === '/admin/audit') html = adminAudit();
  else html = loginPage();
  document.getElementById('app').innerHTML = html;
  document.querySelectorAll('.main .table-wrap table').forEach(table => table.classList.add('data-table'));
  if (path === '/kiosk') {
    resetIdle();
    updateClock();
    clearInterval(clockTimer);
    clockTimer = setInterval(updateClock, 30000);
  } else clearInterval(clockTimer);
  if (document.querySelector('[data-filter-status]')) applyTableFilters();
}
function refreshExpiredPasses() {
  let changed = false;
  for (const item of state.requests) {
    if (item.passStatus === 'Active' && item.endsAt && Date.now() > new Date(item.endsAt).getTime()) {
      item.passStatus = 'Expired';
      item.updatedAt = new Date().toISOString();
      audit('Pass expired', item.visitorName, `Task ${item.id} · QR ${item.passCode} validity ended`, 'VMS');
      changed = true;
    }
  }
  if (changed) persist();
}
function updateClock() {
  const clock = document.querySelector('[data-clock]');
  if (clock) clock.textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date());
}
function doLogin(selectedRole) {
  role = selectedRole;
  localStorage.setItem(SESSION_KEY, role);
  go(`/${role}/dashboard`);
}
function approveRequest(id) {
  const item = getRequest(id);
  if (!item) return;
  if (item.walkIn && item.status === 'Pending Admin Approval') {
    item.status = 'Approved'; item.adminApprovalStatus = 'Approved'; item.passCode = makePass(); item.passStatus = 'Active'; item.visitStatus = 'Outside'; item.updatedAt = new Date().toISOString();
    audit('Walk-in approved', item.visitorName, `Task ${item.id} · QR ${item.passCode} activated`, 'Admin');
    persist(); render(); toast(`${item.visitorName}'s walk-in approved`);
    return;
  }
  if (item.status !== 'Pending') return;
  item.status = 'Approved'; item.passCode = makePass(); item.passStatus = 'Active'; item.visitStatus = 'Outside'; item.updatedAt = new Date().toISOString();
  audit('Request approved', item.visitorName, `Task ${item.id} · QR ${item.passCode} activated`, 'Admin');
  persist(); render(); toast(`${item.visitorName}'s request approved`);
}
function rejectRequest(id) {
  const item = getRequest(id);
  if (!item) return;
  if (item.walkIn && item.status === 'Pending Admin Approval') {
    item.status = 'Rejected'; item.adminApprovalStatus = 'Rejected'; item.updatedAt = new Date().toISOString();
    audit('Walk-in rejected by admin', item.visitorName, `Task ${item.id} · host ${item.host} · admin rejected`, 'Admin');
    persist(); render(); toast('Walk-in rejected');
    return;
  }
  if (item.status !== 'Pending') return;
  item.status = 'Rejected'; item.updatedAt = new Date().toISOString();
  audit('Request rejected', item.visitorName, `Request ${item.id} rejected by Admin`, 'Admin');
  persist(); render(); toast('Request rejected');
}
function revokeDialog(item) {
  return `<dialog class="confirm-dialog" id="revoke-dialog" aria-labelledby="revoke-dialog-title"><form id="revoke-form" data-id="${escapeHtml(item.id)}" novalidate>
    <div class="confirm-dialog-head"><div><p class="eyebrow">Pass action</p><h2 id="revoke-dialog-title">Revoke pass</h2></div><button class="icon-button" type="button" data-action="cancel-revoke" aria-label="Close dialog">×</button></div>
    <div class="confirm-dialog-body"><p>Are you sure you want to revoke this pass? It will become inactive and can no longer be used.</p><dl class="revoke-summary"><div><dt>Visitor</dt><dd>${escapeHtml(item.visitorName)}</dd></div><div><dt>Pass ID</dt><dd>${escapeHtml(item.passCode)}</dd></div></dl>
      <div class="field"><label for="revoke-reason">Reason for revocation <span aria-hidden="true">*</span></label><textarea id="revoke-reason" name="reason" required maxlength="500" rows="3" aria-describedby="revoke-reason-error" placeholder="Briefly explain why this pass is being revoked"></textarea><span class="field-error" id="revoke-reason-error" role="alert" hidden>Please enter a reason before revoking this pass.</span></div>
    </div><div class="confirm-dialog-actions"><button class="button" type="button" data-action="cancel-revoke">Cancel</button><button class="button button-danger" type="submit">Revoke pass</button></div>
  </form></dialog>`;
}
function openRevokeDialog(id) {
  const item = getRequest(id);
  if (!item || item.passStatus !== 'Active' || !(role === 'admin' || taskOwner(item))) return;
  document.getElementById('revoke-dialog')?.remove();
  document.body.insertAdjacentHTML('beforeend', revokeDialog(item));
  const dialog = document.getElementById('revoke-dialog');
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeRevokeDialog(dialog); });
  dialog.addEventListener('click', event => { if (event.target === dialog) closeRevokeDialog(dialog); });
  dialog.showModal();
  document.getElementById('revoke-reason')?.focus();
}
function closeRevokeDialog(dialog, afterClose = () => {}) {
  if (!dialog?.open || dialog.dataset.closing) return;
  dialog.dataset.closing = 'true';
  dialog.classList.add('is-closing');
  setTimeout(() => { if (dialog.open) dialog.close(); afterClose(); }, 165);
}
function revokePass(id, reason) {
  const item = getRequest(id);
  const cleanReason = String(reason || '').trim();
  if (!item || item.passStatus !== 'Active' || !cleanReason || !(role === 'admin' || taskOwner(item))) return;
  const revokedAt = new Date().toISOString();
  const actor = role === 'admin' ? 'Admin' : HOST_USER;
  item.passStatus = 'Revoked'; item.revocationReason = cleanReason; item.revokedAt = revokedAt; item.revokedBy = actor; item.updatedAt = revokedAt;
  audit('Pass Revoked', item.visitorName, `Pass ID ${item.passCode} · Task ${item.id} · reason: ${cleanReason}`, actor);
  persist(); render(); toast('Visitor pass revoked');
}
function completeTask(id) {
  const item = getRequest(id);
  if (!item || item.passStatus !== 'Active') return;
  if (!confirm(`Mark ${item.visitorName}'s task as completed? Their QR pass will become inactive.`)) return;
  item.passStatus = 'Completed';
  item.visitStatus = 'Completed';
  item.updatedAt = new Date().toISOString();
  audit('Task completed', item.visitorName, `Task ${item.id} · QR ${item.passCode} deactivated`, HOST_USER);
  persist(); render(); toast('Task completed; QR pass is inactive');
}
function appendVisitEvent(item, type, actor = 'Kiosk') {
  const at = new Date().toISOString();
  item.visits ||= [];
  item.visits.push({ type, at, actor });
  item.visitStatus = type === 'check-in' ? 'Checked in' : 'Outside';
  item.updatedAt = at;
  audit(type === 'check-in' ? 'Visitor checked in' : 'Visitor checked out', item.visitorName, `Task ${item.id} · QR ${item.passCode}`, actor);
}
function validatePass(passCode, purpose) {
  const item = state.requests.find(entry => entry.passCode && entry.passCode.toLowerCase() === passCode.trim().toLowerCase());
  if (!item) return { error: "We couldn't find that pass. Check the code and try again." };
  if (item.passStatus === 'Revoked') return { error: 'This pass is no longer active. Please check with your host.' };
  if (item.passStatus === 'Completed') return { error: 'This visit is complete, so the pass can no longer be used.' };
  if (item.passStatus === 'Expired' || Date.now() > new Date(item.endsAt).getTime()) {
    item.passStatus = 'Expired'; persist();
    return { error: 'This pass has expired. Please check with your host.' };
  }
  if (item.status !== 'Approved' || item.passStatus !== 'Active') return { error: "This pass isn't active yet. Please check with your host." };
  if (Date.now() < new Date(item.startsAt).getTime()) return { error: "This pass isn't valid yet. Please return during your scheduled visit." };
  if (purpose === 'check-in' && item.visitStatus === 'Checked in') return { error: "You're already checked in. Choose Check Out when you're ready to leave." };
  if (purpose === 'check-out' && item.visitStatus !== 'Checked in') return { error: "This pass doesn't show an active check-in yet. Please check in first." };
  return { item };
}
function finishKioskSuccess(title, message, delay = 4025) {
  clearTimeout(successTimer);
  moveKioskStage('success', () => { kioskSuccessTitle = title; kioskSuccessMessage = message; });
  successTimer = setTimeout(() => {
    if (location.pathname === '/kiosk' && kioskStage === 'success') {
      moveKioskStage('home', () => { kioskRecordId = ''; kioskWalkIn = null; kioskError = ''; presentationWorkflow = false; });
    }
  }, delay);
}
function checkin(id) {
  if (presentationWorkflow) {
    clearTimeout(flowTimer);
    moveKioskStage('checkin-confirmed', () => {
      flowTimer = setTimeout(() => {
        if (location.pathname !== '/kiosk' || !presentationWorkflow) return;
        moveKioskStage('printing', () => {
          flowTimer = setTimeout(() => {
            if (location.pathname === '/kiosk' && presentationWorkflow) finishKioskSuccess("You're good to go.", 'Please collect your badge.');
          }, KIOSK_STAGE_DISPLAY_MS);
        });
      }, KIOSK_STAGE_DISPLAY_MS);
    });
    return;
  }
  const item = getRequest(id);
  if (!item || item.passStatus !== 'Active') return;
  appendVisitEvent(item, 'check-in');
  persist();
  clearTimeout(flowTimer);
  moveKioskStage('checkin-confirmed', () => {
    flowTimer = setTimeout(() => {
    if (location.pathname !== '/kiosk' || kioskStage !== 'checkin-confirmed') return;
    moveKioskStage('printing', () => {
      flowTimer = setTimeout(() => {
        if (location.pathname === '/kiosk' && kioskStage === 'printing') finishKioskSuccess("You're good to go.", 'Please collect your badge.');
      }, KIOSK_STAGE_DISPLAY_MS);
    });
    }, KIOSK_STAGE_DISPLAY_MS);
  });
}
function checkout(id) {
  if (presentationWorkflow) {
    finishKioskSuccess("You're all checked out.", 'Have a great day.', 3450);
    return;
  }
  const item = getRequest(id);
  if (!item || item.passStatus !== 'Active' || item.visitStatus !== 'Checked in') return;
  appendVisitEvent(item, 'check-out');
  persist();
  finishKioskSuccess("You're all checked out.", 'Have a great day.', 3450);
}
function createWalkIn() {
  const id = makeId();
  const now = new Date().toISOString();
  const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const purpose = kioskWalkIn.purpose === 'Other' ? `Other: ${kioskWalkIn.purposeDetails}` : kioskWalkIn.purpose;
  const item = { id, visitorName: kioskWalkIn.name, email: kioskWalkIn.email || 'Not provided', phone: kioskWalkIn.phone, startsAt: localNow, endsAt: localDateTimeOffset(0, 23), purpose, locationOfWork: kioskWalkIn.locationOfWork, host: kioskWalkIn.host, createdBy: 'Walk-in kiosk', walkIn: true, status: 'Pending Host Approval', hostApprovalStatus: 'Pending', adminApprovalStatus: 'Pending', passCode: '', passStatus: '', visitStatus: 'Scheduled', visits: [], createdAt: now, updatedAt: now, source: 'Walk-in' };
  state.requests.unshift(item);
  kioskRecordId = id;
  audit('Walk-in request created', item.visitorName, `Task ${item.id} · host ${item.host} · awaiting host approval`, 'Kiosk');
  persist();
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[data-link]');
  if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault(); go(link.getAttribute('href')); return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (location.pathname === '/kiosk') resetIdle();
  if (action === 'logout') { role = ''; localStorage.removeItem(SESSION_KEY); go('/login'); }
  if (action === 'approve') approveRequest(id);
  if (action === 'reject') rejectRequest(id);
  if (action === 'accept-walkin') { const item = getRequest(id); if (item?.walkIn && item.status === 'Pending Host Approval') { item.status = 'Pending Admin Approval'; item.hostApprovalStatus = 'Accepted'; item.adminApprovalStatus = 'Pending'; item.updatedAt = new Date().toISOString(); audit('Walk-in accepted by host', item.visitorName, `Task ${item.id} · host ${item.host} · awaiting admin approval`, HOST_USER); persist(); render(); toast('Walk-in accepted'); } }
  if (action === 'reject-walkin') { const item = getRequest(id); if (item?.walkIn && item.status === 'Pending Host Approval') { item.status = 'Rejected'; item.hostApprovalStatus = 'Rejected'; item.adminApprovalStatus = 'Not required'; item.updatedAt = new Date().toISOString(); audit('Walk-in rejected by host', item.visitorName, `Task ${item.id} · host ${item.host} rejected the request`, HOST_USER); persist(); render(); toast('Walk-in rejected'); } }
  if (action === 'approve-walkin-admin') { const item = getRequest(id); if (item?.walkIn && item.status === 'Pending Admin Approval') { item.status = 'Approved'; item.adminApprovalStatus = 'Approved'; item.passCode = makePass(); item.passStatus = 'Active'; item.visitStatus = 'Outside'; item.updatedAt = new Date().toISOString(); audit('Walk-in approved', item.visitorName, `Task ${item.id} · QR ${item.passCode} activated`, 'Admin'); persist(); render(); toast(`${item.visitorName}'s walk-in approved`); } }
  if (action === 'reject-walkin-admin') { const item = getRequest(id); if (item?.walkIn && item.status === 'Pending Admin Approval') { item.status = 'Rejected'; item.adminApprovalStatus = 'Rejected'; item.updatedAt = new Date().toISOString(); audit('Walk-in rejected by admin', item.visitorName, `Task ${item.id} · host ${item.host} · admin rejected`, 'Admin'); persist(); render(); toast('Walk-in rejected'); } }
  if (action === 'revoke') openRevokeDialog(id);
  if (action === 'cancel-revoke') closeRevokeDialog(document.getElementById('revoke-dialog'));
  if (action === 'complete-visit') completeTask(id);
  if (action === 'show-add-host') { hostFormOpen = true; render(); }
  if (action === 'cancel-add-host') { hostFormOpen = false; render(); }
  if (action === 'kiosk-home') { clearTimeout(scanTimer); clearTimeout(validationTimer); clearTimeout(successTimer); clearTimeout(flowTimer); moveKioskStage('home', () => { kioskRecordId = ''; kioskWalkIn = null; kioskError = ''; scannedCode = ''; manualQrEntryOpen = false; presentationWorkflow = false; }); }
  if (action === 'kiosk-scan') { clearTimeout(scanTimer); clearTimeout(validationTimer); scanPurpose = 'check-in'; kioskError = ''; manualQrEntryOpen = false; moveKioskStage('scan'); }
  if (action === 'kiosk-checkout') { clearTimeout(scanTimer); clearTimeout(validationTimer); scanPurpose = 'check-out'; kioskError = ''; manualQrEntryOpen = false; moveKioskStage('scan'); }
  if (action === 'kiosk-retry') { clearTimeout(scanTimer); clearTimeout(validationTimer); kioskError = ''; manualQrEntryOpen = false; moveKioskStage('scan'); }
  if (action === 'manual-qr-entry') { manualQrEntryOpen = true; render(); document.getElementById('qr-code')?.focus(); }
  if (action === 'kiosk-walkin') { kioskError = ''; kioskWalkIn = null; moveKioskStage('walkin-intro'); }
  if (action === 'walkin-start') { kioskWalkIn = { name: 'Rahul Menon', phone: '+91 98220 45678', email: 'rahul.menon.guest@example.in', host: 'Arjun Kumar', purpose: 'Meeting', purposeDetails: '', locationOfWork: '' }; moveKioskStage('walkin-visitor'); }
  if (action === 'walkin-back') { kioskError = ''; moveKioskStage(button.dataset.stage); }
  if (action === 'walkin-continue-otp') { kioskError = ''; moveKioskStage('otp'); }
  if (action === 'kiosk-signout') { scanPurpose = 'check-out'; kioskError = ''; moveKioskStage('scan'); }
  if (action === 'kiosk-confirm-checkin') checkin(kioskRecordId);
  if (action === 'kiosk-confirm-checkout') checkout(kioskRecordId);
  if (action === 'show-workflow') startPresentationWorkflow();
  if (action === 'reset-data') {
    if (confirm('Restore the initial visitor requests, passes, and activity?')) {
      state = initialState(); persist(); localStorage.removeItem(SESSION_KEY); role = ''; kioskStage = 'home'; presentationWorkflow = false; go('/login'); toast('Records restored');
    }
  }
});

document.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id === 'revoke-form') {
    const form = event.target;
    const reason = String(new FormData(form).get('reason') || '').trim();
    const error = form.querySelector('#revoke-reason-error');
    if (!reason) {
      error.hidden = false;
      form.querySelector('#revoke-reason')?.focus();
      return;
    }
    closeRevokeDialog(document.getElementById('revoke-dialog'), () => revokePass(form.dataset.id, reason));
    return;
  }
  if (event.target.id === 'qr-scan-form') {
    const form = new FormData(event.target);
    startQrScan(String(form.get('code') || ''));
  }
  if (event.target.id === 'role-login-form') {
    const selectedRole = event.target.dataset.role;
    if (selectedRole === 'host' || selectedRole === 'admin') doLogin(selectedRole);
  }
  if (event.target.id === 'request-form') {
    const form = new FormData(event.target);
    const requestId = event.target.dataset.requestId;
    const existing = requestId ? getRequest(requestId) : null;
    if (requestId && (!existing || existing.status !== 'Pending' || !taskOwner(existing))) {
      toast('Only pending requests can be edited', true);
      go(existing ? `/host/requests/${existing.id}` : '/host/requests');
      return;
    }
    const visitorName = String(form.get('visitorName')).trim();
    const hostName = HOST_USER;
    const host = state.hosts.find(entry => entry.name.toLowerCase() === hostName.toLowerCase());
    if (!host) { toast('Choose a host from the directory', true); return; }
    const startDate = String(form.get('startDate'));
    const startTime = String(form.get('startTime'));
    const endDate = String(form.get('endDate'));
    const endTime = String(form.get('endTime'));
    const startsAt = `${startDate}T${startTime}`;
    const endsAt = `${endDate}T${endTime}`;
    if (new Date(endsAt) <= new Date(startsAt)) { toast('End date and time must be after the start', true); return; }
    const purposeType = String(form.get('purpose'));
    const purposeDetails = String(form.get('purposeDetails') || '').trim();
    if (purposeType === 'Other' && !purposeDetails) { toast('Add purpose details for Other', true); return; }
    const item = existing || { id: makeId(), createdBy: HOST_USER, status: 'Pending', passCode: '', passStatus: '', visitStatus: 'Scheduled', visits: [], createdAt: new Date().toISOString(), source: 'Host request' };
    Object.assign(item, { visitorName, email: String(form.get('email')).trim(), phone: String(form.get('phone')).trim(), startsAt, endsAt, purpose: purposeType === 'Other' ? `Other: ${purposeDetails}` : purposeType, locationOfWork: String(form.get('locationOfWork') || '').trim(), host: host.name, updatedAt: new Date().toISOString() });
    if (existing) audit('Request edited', visitorName, `Task ${item.id} updated · host ${item.host} · ${visitRange(item)}`, HOST_USER);
    else { state.requests.unshift(item); audit('Request created', visitorName, `Task ${item.id} · host ${item.host} · ${visitRange(item)}`, HOST_USER); }
    persist(); go(`/host/requests/${item.id}`); toast(existing ? 'Request changes saved' : 'Visitor request submitted for review');
  }
  if (event.target.id === 'host-form') {
    const form = new FormData(event.target);
    const host = { name: String(form.get('name')).trim(), department: String(form.get('department')).trim(), email: String(form.get('email')).trim().toLowerCase(), employeeId: String(form.get('employeeId')).trim() };
    if (state.hosts.some(item => item.email.toLowerCase() === host.email || item.employeeId.toLowerCase() === host.employeeId.toLowerCase())) {
      toast('A host with that email or host ID already exists', true);
      return;
    }
    state.hosts.push(host);
    audit('Host directory updated', host.name, `${host.employeeId} added to ${host.department}`, 'Admin');
    persist(); hostFormOpen = false; render(); toast('Host added to the directory');
  }
  if (event.target.id === 'walkin-visitor-form') {
    const form = new FormData(event.target);
    Object.assign(kioskWalkIn, { name: String(form.get('name') || '').trim(), phone: String(form.get('phone') || '').trim(), email: String(form.get('email') || '').trim() });
    kioskError = ''; moveKioskStage('walkin-host');
  }
  if (event.target.id === 'walkin-host-form') {
    const form = new FormData(event.target);
    const hostName = String(form.get('host') || '').trim();
    const host = state.hosts.find(entry => entry.name.toLowerCase() === hostName.toLowerCase());
    if (!host) { kioskError = 'Choose a host from the directory.'; render(); return; }
    kioskWalkIn.host = host.name; kioskError = ''; moveKioskStage('walkin-purpose');
  }
  if (event.target.id === 'walkin-purpose-form') {
    const form = new FormData(event.target);
    const purpose = String(form.get('purpose') || '').trim();
    const purposeDetails = String(form.get('purposeDetails') || '').trim();
    if (purpose === 'Other' && !purposeDetails) { kioskError = 'Add a few details about your visit.'; render(); return; }
    Object.assign(kioskWalkIn, { purpose, purposeDetails });
    kioskError = ''; moveKioskStage('walkin-location');
  }
  if (event.target.id === 'walkin-location-form') {
    const form = new FormData(event.target);
    kioskWalkIn.locationOfWork = String(form.get('locationOfWork') || '').trim();
    kioskError = ''; moveKioskStage('walkin-review');
  }
  if (event.target.id === 'otp-form') {
    const form = new FormData(event.target);
    if (String(form.get('otp')).trim() !== '246810') { kioskError = 'That code did not match. Please try again.'; render(); document.getElementById('otp-code')?.focus(); return; }
    createWalkIn(); kioskError = ''; moveKioskStage('walkin-submitting', () => {
      clearTimeout(flowTimer);
      flowTimer = setTimeout(() => {
        if (location.pathname === '/kiosk' && kioskStage === 'walkin-submitting') moveKioskStage('walkin-details');
      }, 1800);
    });
  }
});

function applyTableFilters() {
  document.querySelectorAll('.panel').forEach(panel => {
    const search = panel.querySelector('[data-filter-search]');
    const status = panel.querySelector('[data-filter-status]');
    if (!search && !status) return;
    const query = search?.value.toLowerCase().trim() || '';
    const filter = status?.value.toLowerCase() || '';
    panel.querySelectorAll('[data-search-row]').forEach(row => {
      const matchesText = row.dataset.searchRow.includes(query);
      const matchesStatus = !filter || (row.dataset.filterState || row.cells[4]?.innerText.toLowerCase() || '').includes(filter);
      const shouldShow = matchesText && matchesStatus;
      clearTimeout(row.filterHideTimer);
      clearTimeout(row.filterShowTimer);
      cancelAnimationFrame(row.filterFrame);
      row.classList.remove('filter-leave');
      if (shouldShow && row.hidden) {
        row.hidden = false;
        row.classList.add('filter-enter');
        row.filterFrame = requestAnimationFrame(() => {
          if (!row.hidden && row.classList.contains('filter-enter')) row.classList.add('filter-enter-active');
        });
        row.filterShowTimer = setTimeout(() => row.classList.remove('filter-enter', 'filter-enter-active'), 215);
      } else if (!shouldShow && !row.hidden) {
        row.classList.remove('filter-enter', 'filter-enter-active');
        row.classList.add('filter-leave');
        row.filterHideTimer = setTimeout(() => {
          const currentQuery = search?.value.toLowerCase().trim() || '';
          const currentFilter = status?.value.toLowerCase() || '';
          const stillMatches = row.dataset.searchRow.includes(currentQuery) && (!currentFilter || (row.dataset.filterState || row.cells[4]?.innerText.toLowerCase() || '').includes(currentFilter));
          if (!stillMatches) row.hidden = true;
          row.classList.remove('filter-leave');
        }, 165);
      }
    });
  });
}
document.addEventListener('input', event => {
  if (event.target.matches('[data-filter-search]')) applyTableFilters();
  if (event.target.matches('[data-host-selector]')) updateHostOptions(event.target);
  if (event.target.id === 'revoke-reason' && event.target.value.trim()) {
    const error = document.getElementById('revoke-reason-error');
    if (error) error.hidden = true;
  }
});
function updateHostOptions(input) {
  const selector = input.closest('.host-selector');
  const list = selector?.querySelector('.host-options');
  if (!list) return;
  clearTimeout(list.closeTimer);
  list.classList.remove('is-closing');
  const query = input.value.trim().toLowerCase();
  const matches = state.hosts.filter(host => `${host.name} ${host.department}`.toLowerCase().includes(query));
  list.innerHTML = matches.length ? matches.map(host => `<button class="host-option" type="button" role="option" aria-selected="${host.name === input.value ? 'true' : 'false'}" data-host-option="${escapeHtml(host.name)}"><strong>${escapeHtml(host.name)}</strong><span>${escapeHtml(host.department)}</span></button>`).join('') : '<p class="host-option-empty">No hosts match your search.</p>';
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}
function closeHostOptions(input) {
  const selector = input?.closest('.host-selector');
  const list = selector?.querySelector('.host-options');
  if (list && !list.hidden) {
    clearTimeout(list.closeTimer);
    list.classList.add('is-closing');
    list.closeTimer = setTimeout(() => { list.hidden = true; list.classList.remove('is-closing'); }, 155);
  }
  input?.setAttribute('aria-expanded', 'false');
}
document.addEventListener('focusin', event => {
  if (event.target.matches('[data-host-selector]')) updateHostOptions(event.target);
});
document.addEventListener('click', event => {
  const option = event.target.closest('[data-host-option]');
  if (option) {
    const selector = option.closest('.host-selector');
    const input = selector?.querySelector('[data-host-selector]');
    if (input) { input.value = option.dataset.hostOption; input.focus(); closeHostOptions(input); }
    return;
  }
  if (!event.target.closest('.host-selector')) document.querySelectorAll('[data-host-selector]').forEach(closeHostOptions);
});
document.addEventListener('keydown', event => {
  const input = event.target.closest('[data-host-selector]');
  if (input && event.key === 'ArrowDown') {
    event.preventDefault(); updateHostOptions(input); input.closest('.host-selector').querySelector('[data-host-option]')?.focus();
  } else if (input && event.key === 'Escape') closeHostOptions(input);
  const option = event.target.closest('[data-host-option]');
  if (option && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    const options = [...option.parentElement.querySelectorAll('[data-host-option]')];
    options[Math.max(0, Math.min(options.length - 1, options.indexOf(option) + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  } else if (option && event.key === 'Escape') {
    const input = option.closest('.host-selector')?.querySelector('[data-host-selector]');
    input?.focus(); closeHostOptions(input);
  }
});
document.addEventListener('change', event => {
  if (event.target.matches('[data-filter-status]')) applyTableFilters();
  if (event.target.id === 'visit-purpose') {
    const detailField = document.getElementById('purpose-details-field');
    const detailInput = document.getElementById('purpose-details');
    const show = event.target.value === 'Other';
    detailField.hidden = !show;
    detailInput.required = show;
  }
  if (event.target.id === 'walk-purpose') {
    const detailField = document.getElementById('walk-purpose-details-field');
    const detailInput = document.getElementById('walk-purpose-details');
    const show = event.target.value === 'Other';
    detailField.hidden = !show;
    detailInput.required = show;
  }
});
window.addEventListener('popstate', render);
document.addEventListener('pointerdown', () => { if (location.pathname === '/kiosk') resetIdle(); });
render();
