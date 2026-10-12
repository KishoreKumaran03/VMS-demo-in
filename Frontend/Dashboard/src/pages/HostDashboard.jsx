import React, { useState } from 'react';
import { useVms } from '../context/VmsContext';
import { PassModal } from '../components/common/PassModal';

export const HostDashboard = () => {
  const {
    currentUser,
    passes,
    addPassRequest,
    approvePass,
    liveLobbyAlert,
    dismissLiveLobbyAlert,
    showToast,
  } = useVms();

  const [filter, setFilter] = useState('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedPassForModal, setSelectedPassForModal] = useState(null);

  // Form state
  const [vName, setVName] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vCategory, setVCategory] = useState('Customer');
  const [vDate, setVDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [vTime, setVTime] = useState('14:30');
  const [vPurpose, setVPurpose] = useState('');
  const [vNotes, setVNotes] = useState('');

  // Host passes (assigned to Alex Morgan or all for demo flexibility)
  const hostPasses = passes.filter(
    (p) => p.hostName === 'Alex Morgan' || p.hostName === currentUser.name || true
  );

  const upcomingCount = hostPasses.filter((p) => p.status === 'Approved').length;
  const todayCount = hostPasses.filter((p) => p.status === 'Checked In').length;
  const pendingCount = hostPasses.filter((p) => p.status === 'Pending Review').length;

  const filteredPasses = hostPasses.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'active') return p.status === 'Checked In';
    if (filter === 'approved') return p.status === 'Approved';
    if (filter === 'pending') return p.status === 'Pending Review';
    return true;
  });

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!vName.trim() || !vEmail.trim() || !vPurpose.trim()) {
      showToast('Please fill all required fields');
      return;
    }

    let createdPass;
    try {
      createdPass = await addPassRequest({
      visitorName: vName.trim(),
      email: vEmail.trim(),
      phone: vPhone.trim() || '+1 (555) 019-2834',
      company: 'External Guest',
      category: vCategory,
      hostName: currentUser.name || 'Alex Morgan',
      hostDepartment: 'Engineering Dept',
      scheduledDate: vDate,
      scheduledTime: vTime,
      slotDescription: `${vDate}, ${vTime}`,
      zoneClearance: 'Main Campus Floor 3',
      purpose: vPurpose.trim(),
      });
    } catch (error) {
      showToast(error.message || 'The visit could not be submitted.');
      return;
    }

    // Reset form
    setVName('');
    setVEmail('');
    setVPhone('');
    setVPurpose('');
    setVNotes('');
    setShowInviteModal(false);

    showToast(`Pass request submitted for ${createdPass.visitorName} (#${createdPass.id}). Awaiting Site Admin approval.`);
  };

  const handleOpenMyBadge = () => {
    // Show host badge
    setSelectedPassForModal({
      id: 'HOST-0092',
      visitorName: 'Alex Morgan',
      email: 'alex.morgan@enterprise-vms.global',
      category: 'VIP',
      hostName: 'Engineering VP',
      hostDepartment: 'Architecture',
      scheduledDate: 'Permanent',
      scheduledTime: '24/7 Access',
      slotDescription: 'All-Zone Executive Clearance',
      zoneClearance: 'All Buildings • Level 4 Secure',
      status: 'Approved',
      purpose: 'Lead Architect Executive Staff Access',
    });
  };

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto px-4 py-4 pb-28 gap-4">
      {/* Host Identity & Greeting Banner */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <img
              alt={currentUser.name}
              src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
              className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20"
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[10px]">verified</span>
            </div>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 truncate">
                {currentUser.name}
              </h1>
              <span className="bg-blue-50 text-primary font-semibold text-[11px] px-2 py-0.5 rounded-full border border-blue-100">
                Host
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              Lead Architect • Engineering Dept
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenMyBadge}
          className="w-10 h-10 rounded-full bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center transition-colors flex-shrink-0"
          title="My Host Badge"
        >
          <span className="material-symbols-outlined text-[20px]">qr_code_2</span>
        </button>
      </div>

      {/* Real-Time Arrival Notification Alert (Dismissible) */}
      {liveLobbyAlert && liveLobbyAlert.visible && (
        <div className="relative overflow-hidden bg-primary text-white rounded-2xl p-3.5 shadow-sm transition-all duration-300">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-wider uppercase opacity-90">
                  Live Lobby Alert
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
              </div>
              <p className="text-xs font-semibold mt-0.5">
                {liveLobbyAlert.visitorName} has checked in
              </p>
              <p className="text-[11px] opacity-85 mt-0.5">
                {liveLobbyAlert.location}
              </p>
            </div>
            <button
              onClick={dismissLiveLobbyAlert}
              className="text-white/80 hover:text-white p-1 rounded-full flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Key Metrics Row (3 Compact Cards) */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white p-3 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 truncate">Upcoming</span>
            <span className="material-symbols-outlined text-[16px] text-primary">
              calendar_month
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-slate-900 leading-none">
              {upcomingCount}
            </span>
            <p className="text-[11px] text-slate-400 mt-1">Scheduled</p>
          </div>
        </div>

        <div className="bg-white p-3 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 truncate">Today</span>
            <span className="material-symbols-outlined text-[16px] text-secondary">
              group
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-secondary leading-none">
              {todayCount}
            </span>
            <p className="text-[11px] text-slate-400 mt-1">Expected</p>
          </div>
        </div>

        <div className="bg-white p-3 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 truncate">Pending</span>
            <span className="material-symbols-outlined text-[16px] text-amber-500">
              hourglass_top
            </span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-amber-600 leading-none">
              {pendingCount}
            </span>
            <p className="text-[11px] text-slate-400 mt-1">Admin review</p>
          </div>
        </div>
      </div>

      {/* Quick Action CTA Buttons */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => setShowInviteModal(true)}
          className="bg-primary hover:bg-primary-container text-white py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>+ Invite Visitor</span>
        </button>
        <button
          onClick={() => setShowInviteModal(true)}
          className="bg-blue-50 hover:bg-blue-100 text-primary py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border border-blue-100"
        >
          <span className="material-symbols-outlined text-[18px]">badge</span>
          <span>Request Pass</span>
        </button>
      </div>

      {/* Section Header with Filter Tabs */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            My Invitations & Passes
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            {filteredPasses.length} Records
          </span>
        </div>

        {/* Micro Filter Segment */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-all ${
              filter === 'all'
                ? 'bg-primary text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({hostPasses.length})
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-all ${
              filter === 'active'
                ? 'bg-primary text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Active / Arrived
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-all ${
              filter === 'approved'
                ? 'bg-primary text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Pre-Approved
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 transition-all ${
              filter === 'pending'
                ? 'bg-primary text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending
          </button>
        </div>
      </div>

      {/* Visitor Card Registry List */}
      <div className="flex flex-col gap-3">
        {filteredPasses.map((pass) => (
          <div
            key={pass.id}
            className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-100 flex flex-col gap-2.5 hover:border-blue-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-primary flex items-center justify-center font-semibold text-xs flex-shrink-0">
                  {pass.visitorName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-slate-900 truncate">
                    {pass.visitorName}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">
                    {pass.category} • {pass.company || 'External'}
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold flex-shrink-0 ${
                  pass.status === 'Approved'
                    ? 'bg-blue-50 text-primary border border-blue-200'
                    : pass.status === 'Checked In'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : pass.status === 'Pending Review'
                    ? 'bg-slate-100 text-slate-700'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    pass.status === 'Approved'
                      ? 'bg-primary'
                      : pass.status === 'Checked In'
                      ? 'bg-emerald-500 animate-pulse'
                      : pass.status === 'Pending Review'
                      ? 'bg-slate-400'
                      : 'bg-red-600'
                  }`}
                ></span>
                <span>{pass.status}</span>
              </span>
            </div>

            {/* Sub-row with details & action */}
            <div className="bg-slate-50 rounded-xl p-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <div className="flex items-center gap-1 text-slate-900 font-medium">
                  <span className="material-symbols-outlined text-[15px] text-primary">event</span>
                  <span>{pass.scheduledTime}</span>
                </div>
                <span className="text-slate-300">•</span>
                <span className="font-mono text-primary font-medium text-[11px]">
                  #{pass.id}
                </span>
              </div>

              {pass.status === 'Approved' && (
                <button
                  onClick={() => setSelectedPassForModal(pass)}
                  className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[14px]">qr_code</span>
                  <span>View QR</span>
                </button>
              )}

              {pass.status === 'Checked In' && (
                <button
                  onClick={() => setSelectedPassForModal(pass)}
                  className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold hover:underline bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[14px]">visibility</span>
                  <span>Badge</span>
                </button>
              )}

              {pass.status === 'Pending Review' && pass.source === 'walk-in' && (
                <button onClick={() => approvePass(pass.id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Approve walk-in
                </button>
              )}

              {pass.status === 'Pending Review' && pass.source !== 'walk-in' && (
                <span className="text-[11px] text-slate-400 font-medium">
                  Awaiting Admin
                </span>
              )}

              {pass.status === 'Rejected' && (
                <span className="text-[11px] text-red-600 font-medium">
                  {pass.rejectionReason || 'Declined'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invite Visitor Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md p-5 flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">person_add</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Invite Visitor</h3>
                  <p className="text-[11px] text-slate-500">
                    Issue digital clearance & fast check-in
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Visitor Full Name *</label>
                <input
                  type="text"
                  required
                  value={vName}
                  onChange={(e) => setVName(e.target.value)}
                  placeholder="e.g. Elena Rostova"
                  className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-slate-700">Email *</label>
                  <input
                    type="email"
                    required
                    value={vEmail}
                    onChange={(e) => setVEmail(e.target.value)}
                    placeholder="elena@domain.com"
                    className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-slate-700">Phone</label>
                  <input
                    type="tel"
                    value={vPhone}
                    onChange={(e) => setVPhone(e.target.value)}
                    placeholder="+1 (555) 019-283"
                    className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Category Pills */}
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Visitor Category *</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Customer', 'Vendor', 'Interview', 'VIP', 'Contractor'].map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setVCategory(cat)}
                        className={`p-2 rounded-lg text-xs font-medium transition-all ${
                          vCategory === cat
                            ? 'bg-primary text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-slate-700">Visit Date *</label>
                  <input
                    type="date"
                    required
                    value={vDate}
                    onChange={(e) => setVDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-semibold text-slate-700">Arrival Time *</label>
                  <input
                    type="time"
                    required
                    value={vTime}
                    onChange={(e) => setVTime(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Purpose of Visit *</label>
                <input
                  type="text"
                  required
                  value={vPurpose}
                  onChange={(e) => setVPurpose(e.target.value)}
                  placeholder="e.g. Q3 Architecture Milestone Review"
                  className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-700">Security Justification</label>
                <textarea
                  rows={2}
                  value={vNotes}
                  onChange={(e) => setVNotes(e.target.value)}
                  placeholder="Required for Site Admin badge printing clearance..."
                  className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-primary hover:bg-primary-container text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">send</span>
                  <span>Submit Invitation & Request Pass</span>
                </button>
                <p className="text-[11px] text-center text-slate-400">
                  Instant SMS & email invites with dynamic QR pass link will be issued upon approval.
                </p>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Pass Modal */}
      {selectedPassForModal && (
        <PassModal
          pass={selectedPassForModal}
          onClose={() => setSelectedPassForModal(null)}
        />
      )}
    </div>
  );
};
