import React, { useState } from 'react';
import { useVms } from '../context/VmsContext';
import { VisitorPass } from '../types/vms';
import { PassModal } from '../components/common/PassModal';

export const SiteAdminDashboard: React.FC = () => {
  const { passes, approvePass, rejectPass, addPassRequest, showToast } = useVms();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPassForModal, setSelectedPassForModal] = useState<VisitorPass | null>(null);
  const [showNewPassModal, setShowNewPassModal] = useState(false);
  const [isPinging, setIsPinging] = useState(false);

  // New pass form state
  const [newVisitorName, setNewVisitorName] = useState('');
  const [newVisitorEmail, setNewVisitorEmail] = useState('');
  const [newVisitorCompany, setNewVisitorCompany] = useState('');
  const [newVisitorHost, setNewVisitorHost] = useState('Alex Morgan');
  const [newVisitorZone, setNewVisitorZone] = useState('Zone A - Engineering Floor 3');

  const pendingPasses = passes.filter((p) => p.status === 'Pending Review');
  const activeOnSiteCount = passes.filter((p) => p.status === 'Checked In').length;

  const handlePingAll = () => {
    setIsPinging(true);
    setTimeout(() => {
      setIsPinging(false);
      showToast('All 4 physical turnstiles & optical barriers responded (avg latency: 14ms).');
    }, 600);
  };

  const handleCreatePass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVisitorName.trim() || !newVisitorEmail.trim()) {
      showToast('Please enter visitor name and email');
      return;
    }

    addPassRequest({
      visitorName: newVisitorName.trim(),
      email: newVisitorEmail.trim(),
      company: newVisitorCompany.trim() || 'Enterprise Guest',
      category: 'VIP',
      hostName: newVisitorHost,
      hostDepartment: 'Facilities & Ops',
      scheduledDate: 'Today',
      scheduledTime: '2:30 PM',
      slotDescription: 'Today, 2:30 PM - 5:00 PM',
      zoneClearance: newVisitorZone,
      purpose: 'Fast-Track Pass Created by Site Admin',
    });

    setNewVisitorName('');
    setNewVisitorEmail('');
    setNewVisitorCompany('');
    setShowNewPassModal(false);
  };

  const filteredRegistry = passes.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.visitorName.toLowerCase().includes(q) ||
      p.hostName.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto px-4 py-4 pb-28 gap-4">
      {/* Campus Facility Header */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">domain</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 leading-tight">
                  North Tech Campus
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-primary border border-blue-100">
                  Active Hub
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Facility Code: Site #04 • Zone A & B
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-primary font-medium">
            <span className="material-symbols-outlined text-[16px]">verified</span>
            <span>Operating Normal</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span>4 Gates Synchronized</span>
          </div>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Visitors Today */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Visitors Today</span>
            <span className="material-symbols-outlined text-primary text-[18px]">groups</span>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-900">142</span>
              <span className="text-[11px] font-semibold text-primary">+12%</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Logged check-ins</p>
          </div>
        </div>

        {/* Currently On-Site */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Currently On-Site</span>
            <span className="material-symbols-outlined text-secondary text-[18px]">badge</span>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-900">{activeOnSiteCount + 30}</span>
              <span className="w-2 h-2 rounded-full bg-primary"></span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Active NFC badges</p>
          </div>
        </div>

        {/* Pending Review */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Pending Review</span>
            <span className="material-symbols-outlined text-red-500 text-[18px]">
              pending_actions
            </span>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-red-600">{pendingPasses.length}</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700">
                Action
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Gate approvals req.</p>
          </div>
        </div>

        {/* Expected In */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Expected In</span>
            <span className="material-symbols-outlined text-slate-400 text-[18px]">
              schedule
            </span>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-900">54</span>
              <span className="text-[11px] text-slate-500">PM Slot</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Scheduled arrivals</p>
          </div>
        </div>
      </div>

      {/* Special Event / Campus Drive Progress Banner */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-primary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[20px]">school</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900 leading-tight">
                  Fall Graduate Hiring Drive
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-primary border border-blue-100">
                  Pool Batch 02
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Auditorium Wing • Block C Checkpoint
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600 font-medium">Turnout Verification</span>
            <span className="text-primary font-semibold">78 / 110 Verified</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{ width: '71%' }}></div>
          </div>
          <div className="flex justify-between items-center text-[11px] text-slate-400 mt-0.5">
            <span>Current Queue: 14 at East Turnstile</span>
            <span>Avg Clear: 32s</span>
          </div>
        </div>
      </div>

      {/* Access Clearance Queue (Approval/Rejection) */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Access Clearance Queue</h2>
            <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">
              {pendingPasses.length}
            </span>
          </div>
          <button
            onClick={() => {
              pendingPasses.forEach((p) => approvePass(p.id));
              showToast(`Approved all ${pendingPasses.length} pending pass requests!`);
            }}
            disabled={pendingPasses.length === 0}
            className="text-primary hover:underline text-xs font-semibold disabled:opacity-40"
          >
            Batch Process
          </button>
        </div>

        {pendingPasses.length === 0 ? (
          <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <span className="material-symbols-outlined text-3xl text-emerald-500">task_alt</span>
            <p className="text-xs font-semibold text-slate-800 mt-1">Clearance Queue is Empty</p>
            <p className="text-[11px] text-slate-500">All visitor pass requests have been processed.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {pendingPasses.map((pass) => (
              <div
                key={pass.id}
                className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex flex-col gap-2.5 hover:border-blue-200 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-primary flex items-center justify-center font-semibold text-xs flex-shrink-0">
                      {pass.visitorName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {pass.visitorName}
                        </span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-blue-50 text-primary">
                          {pass.category} Pass
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        Host: {pass.hostName} • {pass.scheduledTime}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-primary flex-shrink-0">
                    #{pass.id}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                  <button
                    onClick={() => rejectPass(pass.id, 'Site Administrator denied access clearance')}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => approvePass(pass.id)}
                    className="px-3.5 py-1.5 bg-primary hover:bg-primary-container text-white rounded-lg text-xs font-semibold shadow-xs active:scale-98 transition-all flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">check</span>
                    <span>Approve Pass</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Campus Gateways & Sensors */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Campus Gateways & Sensors</h3>
          <button
            onClick={handlePingAll}
            disabled={isPinging}
            className="text-primary hover:underline text-xs font-semibold flex items-center gap-1"
          >
            <span className={`material-symbols-outlined text-[15px] ${isPinging ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>Ping All</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-900">Main Turnstile #1</p>
              <p className="text-[11px] text-slate-500">Online • 14ms</p>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-900">East Barrier Gate 2</p>
              <p className="text-[11px] text-slate-500">Online • 21ms</p>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-900">VIP Lobby Optical</p>
              <p className="text-[11px] text-slate-500">Online • 9ms</p>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-900">Loading Dock Scanner</p>
              <p className="text-[11px] text-slate-500">Syncing ledger...</p>
            </div>
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          </div>
        </div>
      </div>

      {/* Visitor Passes & Registry */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Visitor Passes & Registry</h2>
          <button
            onClick={() => setShowNewPassModal(true)}
            className="px-3 py-1.5 bg-primary hover:bg-primary-container text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>+ New Pass</span>
          </button>
        </div>

        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search visitor, host or #VMS id..."
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex flex-col gap-2">
          {filteredRegistry.map((pass) => (
            <div
              key={pass.id}
              className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex flex-col gap-2"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-slate-900">{pass.visitorName}</h4>
                    <span className="text-[11px] font-mono text-primary">#{pass.id}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Host: {pass.hostName} ({pass.hostDepartment})
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    pass.status === 'Checked In'
                      ? 'bg-blue-50 text-primary border border-blue-200'
                      : pass.status === 'Approved'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : pass.status === 'Restricted'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      pass.status === 'Checked In'
                        ? 'bg-primary'
                        : pass.status === 'Approved'
                        ? 'bg-emerald-500'
                        : pass.status === 'Restricted'
                        ? 'bg-red-600'
                        : 'bg-amber-500'
                    }`}
                  ></span>
                  <span>{pass.status}</span>
                </span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">
                  {pass.slotDescription || `${pass.scheduledDate}, ${pass.scheduledTime}`}
                </span>
                <div className="flex items-center gap-2">
                  {pass.status === 'Approved' && (
                    <button
                      onClick={() => setSelectedPassForModal(pass)}
                      className="text-primary hover:underline font-semibold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">qr_code</span>
                      <span>View Pass</span>
                    </button>
                  )}
                  {pass.status === 'Checked In' && (
                    <button
                      onClick={() => showToast(`Printing physical badge for ${pass.visitorName}`)}
                      className="text-primary hover:underline font-semibold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">print</span>
                      <span>Print Badge</span>
                    </button>
                  )}
                  {pass.status === 'Restricted' && (
                    <button
                      onClick={() =>
                        showToast(`Security Dossier: ${pass.rejectionReason || 'Watchlist match'}`)
                      }
                      className="text-red-600 hover:underline font-semibold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">security</span>
                      <span>View Dossier</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New Pass Modal */}
      {showNewPassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 flex flex-col gap-4 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Issue Facility Pass</h3>
              <button
                onClick={() => setShowNewPassModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreatePass} className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Visitor Name *</label>
                <input
                  type="text"
                  required
                  value={newVisitorName}
                  onChange={(e) => setNewVisitorName(e.target.value)}
                  placeholder="e.g. Jordan Mitchell"
                  className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Visitor Email *</label>
                <input
                  type="email"
                  required
                  value={newVisitorEmail}
                  onChange={(e) => setNewVisitorEmail(e.target.value)}
                  placeholder="jordan@partner.com"
                  className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Organization</label>
                <input
                  type="text"
                  value={newVisitorCompany}
                  onChange={(e) => setNewVisitorCompany(e.target.value)}
                  placeholder="e.g. Partner Technologies"
                  className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Host Sponsor</label>
                <select
                  value={newVisitorHost}
                  onChange={(e) => setNewVisitorHost(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none"
                >
                  <option value="Alex Morgan">Alex Morgan (Lead Architect)</option>
                  <option value="Marcus Vance">Marcus Vance (Site Facility Lead)</option>
                  <option value="Elena Rostova">Elena Rostova (BioLabs Director)</option>
                  <option value="David Sterling">David Sterling (Operations Lead)</option>
                </select>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewPassModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-xs"
                >
                  Issue Pass
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pass QR Modal */}
      {selectedPassForModal && (
        <PassModal
          pass={selectedPassForModal}
          onClose={() => setSelectedPassForModal(null)}
        />
      )}
    </div>
  );
};
