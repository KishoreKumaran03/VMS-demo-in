import React, { useState } from 'react';
import { useVms } from '../context/VmsContext';
import { AccountManagementPanel } from '../components/common/AccountManagementPanel';
import { DevicesPanel } from '../components/admin/DevicesPanel.jsx';
import { RetentionPanel } from '../components/admin/RetentionPanel.jsx';
import { SecurityPanel } from '../components/admin/SecurityPanel.jsx';

export const SuperAdminDashboard = () => {
  const { sites, auditLogs, addSite, showToast, summary, refreshData } = useVms();
  const [activeTab, setActiveTab] = useState('overview');
  const [siteSearch, setSiteSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);

  // New site form state
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteCity, setNewSiteCity] = useState('');

  const handleRefreshMetrics = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
      showToast('Dashboard data refreshed from VisitorHub.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateSite = async (e) => {
    e.preventDefault();
    if (!newSiteName.trim() || !newSiteCity.trim()) {
      showToast('Please fill out required campus information');
      return;
    }

    try {
      await addSite({
      name: newSiteName.trim(),
      location: newSiteCity.trim(),
      });
    } catch (error) {
      showToast(error.message || 'The site could not be created.');
      return;
    }

    setNewSiteName('');
    setNewSiteCity('');
    setShowAddSiteModal(false);
  };

  const filteredSites = sites.filter(
    (s) =>
      s.name.toLowerCase().includes(siteSearch.toLowerCase()) ||
      s.location.toLowerCase().includes(siteSearch.toLowerCase())
  );

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (auditFilter === 'all') return true;
    return log.type === auditFilter;
  });

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto px-4 py-4 pb-28 gap-4">
      {/* Top Command Strip & Location Switcher */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-primary">
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              shield
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider">
              Super Admin Engine
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
              <span className="text-[11px] font-semibold text-primary">Platform administration</span>
          </div>
        </div>

        {/* Interactive Site Filter Dropdown Trigger */}
        <div className="w-full bg-slate-50 hover:bg-slate-100 py-2.5 px-3 rounded-xl flex items-center justify-between transition-colors border border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[18px]">hub</span>
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-900 truncate">
                All Organizations & Sites
              </p>
                <p className="text-[11px] text-slate-500">
                {sites.length} active sites across organizations
              </p>
            </div>
          </div>
          <span className="material-symbols-outlined text-slate-400 flex-shrink-0 text-[20px]">
            unfold_more
          </span>
        </div>

        {/* Segmented Tab Navigation */}
        <div className="bg-slate-100 p-1 rounded-xl flex gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 min-w-[75px] py-1.5 px-3 text-center rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-white text-primary shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">dashboard</span>
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('sites')}
            className={`flex-1 min-w-[75px] py-1.5 px-3 text-center rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'sites'
                ? 'bg-white text-primary shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">domain</span>
            <span>Sites ({sites.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex-1 min-w-[90px] py-1.5 px-3 text-center rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'accounts'
                ? 'bg-white text-primary shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">manage_accounts</span>
            <span>Accounts</span>
          </button>
          <button
            onClick={() => setActiveTab('policies')}
            className={`flex-1 min-w-[75px] py-1.5 px-3 text-center rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'policies'
                ? 'bg-white text-primary shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">policy</span>
            <span>Retention</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex-1 min-w-[75px] py-1.5 px-3 text-center rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'security'
                ? 'bg-white text-primary shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">shield_person</span>
            <span>Security</span>
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            className={`flex-1 min-w-[75px] py-1.5 px-3 text-center rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'devices'
                ? 'bg-white text-primary shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">tablet_mac</span>
            <span>Kiosks</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex-1 min-w-[75px] py-1.5 px-3 text-center rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'audit'
                ? 'bg-white text-primary shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">history_toggle_off</span>
            <span>Audit</span>
          </button>
        </div>
      </div>

      {/* 4 Compact Metric Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Metric 1: Total Sites */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Sites</span>
            <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[16px]">corporate_fare</span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{summary.site_count}</span>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-slate-500 text-[11px]">Registered sites</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Registered Users */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Users</span>
            <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[16px]">groups</span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{summary.user_count}</span>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-slate-500 text-[11px] truncate">Across campuses</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Visitors Today */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Visitors Today</span>
            <div className="w-6 h-6 rounded-md bg-blue-100 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px]">badge</span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{summary.visitors_today}</span>
            <div className="flex items-center gap-1 mt-1 text-primary">
              <span className="text-[11px] font-semibold">Expected and completed today</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Escalations */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Escalations</span>
            <div className="w-6 h-6 rounded-md bg-red-50 flex items-center justify-center text-red-600">
              <span className="material-symbols-outlined text-[16px]">notification_important</span>
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-red-600 tracking-tight">{summary.pending}</span>
            <div className="flex items-center gap-1 mt-1">
                <span className="text-slate-500 text-[11px]">Pending approvals</span>
            </div>
          </div>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-4">
          {/* Live Campus Distribution & Threshold Utilization */}
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Live Campus Distribution</h2>
                <p className="text-xs text-slate-500">Concurrent visitors and threshold utilization</p>
              </div>
              <button
                onClick={handleRefreshMetrics}
                disabled={isRefreshing}
                className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-primary flex items-center justify-center transition-colors"
                title="Refresh Metrics"
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    isRefreshing ? 'animate-spin text-primary' : ''
                  }`}
                >
                  sync
                </span>
              </button>
            </div>

            {/* Site Progress Bars */}
            <div className="flex flex-col gap-3 mt-1">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-secondary"></span>
                      <span className="text-xs font-semibold text-slate-900">{site.name}</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/60 text-slate-700">{site.activeEntries} on site</span>
                  </div>
                  <p className="text-slate-500 text-[11px]">Live check-in count</p>
                </div>
              ))}
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Physical gates, badge readers, and security hardware are not connected to VisitorHub.
          </section>
        </div>
      )}

      {/* TAB 2: SITES & ORGS */}
      {activeTab === 'sites' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={siteSearch}
                onChange={(e) => setSiteSearch(e.target.value)}
                placeholder="Search campuses, cities, admins..."
                className="w-full h-10 bg-white rounded-xl pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-xs"
              />
            </div>
            <button
              onClick={() => setShowAddSiteModal(true)}
              className="h-10 px-3.5 bg-primary hover:bg-primary-container text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-xs active:scale-98 transition-all flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Add Site</span>
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {filteredSites.map((site) => (
              <div
                key={site.id}
                className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[22px]">apartment</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{site.name}</h3>
                      <p className="text-xs text-slate-500">{site.location || 'No address recorded'}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-primary border border-blue-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    <span>{site.status}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <p className="text-[11px] text-slate-500">Visitors currently on site</p>
                    <p className="font-semibold text-slate-900">{site.activeEntries}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Check-in Kiosks</p>
                    <p className="font-semibold text-slate-900">Managed in Kiosks tab</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="material-symbols-outlined text-[16px] text-primary">sensors</span>
                    <span>Badge readers: Not configured</span>
                  </div>
                  <span className="text-slate-400 text-[11px]">Gateway integration pending</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'accounts' && <AccountManagementPanel scope="platform" />}

      {activeTab === 'policies' && <RetentionPanel />}
      {activeTab === 'security' && <SecurityPanel />}
      {activeTab === 'devices' && <DevicesPanel />}

      {/* TAB 4: SECURITY AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between bg-white p-3 rounded-xl shadow-xs border border-slate-100">
            <span className="text-xs font-semibold text-slate-900">Event Logs</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAuditFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  auditFilter === 'all'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setAuditFilter('warning')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  auditFilter === 'warning'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Warnings
              </button>
              <button
                onClick={() => setAuditFilter('policy')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  auditFilter === 'policy'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Policy
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {filteredAuditLogs.map((log) => (
              <div
                key={log.id}
                className="bg-white p-3.5 rounded-xl shadow-xs border border-slate-100 flex flex-col gap-1 text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400">{log.timestamp}</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      log.type === 'warning'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : log.type === 'success'
                        ? 'bg-blue-50 text-primary border border-blue-200'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        log.type === 'warning'
                          ? 'bg-red-600'
                          : log.type === 'success'
                          ? 'bg-primary'
                          : 'bg-indigo-600'
                      }`}
                    ></span>
                    <span className="capitalize">{log.type}</span>
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-900 mt-0.5">{log.title}</p>
                <p className="text-[11px] text-slate-500">{log.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Site Modal */}
      {showAddSiteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 flex flex-col gap-4 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  add_business
                </span>
                <h3 className="text-sm font-semibold text-slate-900">Add New Facility Campus</h3>
              </div>
              <button
                onClick={() => setShowAddSiteModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateSite} className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Campus Name *</label>
                <input
                  type="text"
                  required
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  placeholder="e.g. Seattle Quantum Campus"
                  className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Location / City *</label>
                <input
                  type="text"
                  required
                  value={newSiteCity}
                  onChange={(e) => setNewSiteCity(e.target.value)}
                  placeholder="e.g. Seattle, WA"
                  className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddSiteModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-primary hover:bg-primary-container text-white font-semibold rounded-xl shadow-xs"
                >
                  Register Campus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
