import React, { useState } from 'react';
import { useVms } from '../context/VmsContext';
import { VisitorPass } from '../types/vms';

export const ReceptionistDashboard: React.FC = () => {
  const { passes, checkInVisitor, checkOutVisitor, addPassRequest, showToast } = useVms();

  const [inputPassId, setInputPassId] = useState('VPASS-9941');
  const [verifiedPass, setVerifiedPass] = useState<VisitorPass | null>(() => {
    return passes.find((p) => p.id === 'VPASS-9941') || passes[0] || null;
  });

  // Modal dialog states
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInStep, setWalkInStep] = useState(1);

  // Walk-in form states
  const [wName, setWName] = useState('');
  const [wPhone, setWPhone] = useState('');
  const [wCompany, setWCompany] = useState('');
  const [otpDigits, setOtpDigits] = useState(['7', '2', '9', '4']);
  const [wHost, setWHost] = useState('David Sterling - Operations Lead');
  const [wPurpose, setWPurpose] = useState('Client Meeting');
  const [wAcknowledge, setWAcknowledge] = useState(true);

  // Active board filter & search
  const [boardSearch, setBoardSearch] = useState('');
  const [boardFilter, setBoardFilter] = useState<'all' | 'recent' | 'overstay' | 'contractor'>('all');

  // Compute live metric counts
  const checkedInList = passes.filter((p) => p.status === 'Checked In');
  const checkedOutList = passes.filter((p) => p.status === 'Checked Out');
  const activeCount = checkedInList.length;
  const expectedTotal = passes.length;

  const handleVerifyPass = (queryId?: string) => {
    const idToSearch = (queryId || inputPassId).trim().toUpperCase();
    if (!idToSearch) {
      showToast('Please enter a Pass ID to verify');
      return;
    }

    const found = passes.find((p) => p.id.toUpperCase() === idToSearch);
    if (found) {
      setVerifiedPass(found);
      showToast(`Pass verified: #${found.id} (${found.visitorName})`);
    } else {
      showToast(`No record found for Pass ID "${idToSearch}"`);
    }
  };

  const handleSimulateScan = (idToScan = 'VPASS-9941') => {
    setShowScannerModal(false);
    setInputPassId(idToScan);
    handleVerifyPass(idToScan);
    showToast(`Optical barcode scanned: #${idToScan}`);
  };

  const handleCompleteCheckIn = (passId: string) => {
    const success = checkInVisitor(passId, 'Main Gate Lobby');
    if (success) {
      // Refresh verified pass state
      const updated = passes.find((p) => p.id === passId);
      if (updated) {
        setVerifiedPass({ ...updated, status: 'Checked In' });
      }
    }
  };

  // Walk-in Wizard submit
  const handleCompleteWalkIn = () => {
    if (!wName.trim()) {
      showToast('Please enter visitor name');
      return;
    }

    const newPass = addPassRequest({
      visitorName: wName.trim(),
      email: `${wName.toLowerCase().replace(/\s+/g, '.')}@guest.local`,
      phone: wPhone.trim() || '+1 (555) 019-2834',
      company: wCompany.trim() || 'Walk-in Guest',
      category: 'Customer',
      hostName: wHost.split(' - ')[0],
      hostDepartment: 'Operations',
      scheduledDate: 'Today',
      scheduledTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      slotDescription: 'Immediate Walk-in Fast Pass',
      zoneClearance: 'Main Gate & Lobby Zone 1',
      purpose: wPurpose,
    });

    // Directly check in the newly registered visitor
    checkInVisitor(newPass.id, 'Front Desk Kiosk');
    setShowWalkInModal(false);
    setWalkInStep(1);

    // Reset walk-in inputs
    setWName('');
    setWPhone('');
    setWCompany('');

    showToast(`Walk-in visitor ${newPass.visitorName} registered & checked in! Badge #${newPass.id} active.`);
  };

  // Filter visitor cards
  const filteredVisitors = checkedInList.filter((visitor) => {
    const q = boardSearch.toLowerCase();
    const matchesSearch =
      visitor.visitorName.toLowerCase().includes(q) ||
      visitor.hostName.toLowerCase().includes(q) ||
      visitor.id.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (boardFilter === 'all') return true;
    if (boardFilter === 'overstay') return (visitor.overstayMinutes || 0) > 180;
    if (boardFilter === 'contractor') return visitor.category === 'Contractor' || visitor.category === 'Vendor';
    if (boardFilter === 'recent') return (visitor.overstayMinutes || 0) < 60;

    return true;
  });

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto px-4 py-4 pb-28 gap-4">
      {/* Front Desk Status Bar Banner */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-100 p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-primary flex-shrink-0">
            <span className="material-symbols-outlined text-[20px]">desk</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-slate-900 truncate">
              Front Desk - Main Gate Lobby
            </span>
            <span className="text-[11px] text-slate-500 truncate">
              Operator: Claire Davis • Terminal #01
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
          <span className="text-[11px] font-semibold text-primary">Live Hub</span>
        </div>
      </div>

      {/* Operational Metric Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {/* Expected */}
        <div className="bg-white p-3 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Expected Today</span>
            <span className="material-symbols-outlined text-secondary text-[18px]">
              calendar_today
            </span>
          </div>
          <div className="flex items-baseline gap-1 mt-1.5">
            <span className="text-2xl font-bold text-slate-900">{expectedTotal}</span>
            <span className="text-[11px] text-secondary font-medium">total</span>
          </div>
        </div>

        {/* Checked In */}
        <div className="bg-white p-3 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Checked In</span>
            <span className="material-symbols-outlined text-primary text-[18px]">
              verified_user
            </span>
          </div>
          <div className="flex items-baseline gap-1 mt-1.5">
            <span className="text-2xl font-bold text-primary">{activeCount + 10}</span>
            <span className="text-[11px] text-primary font-medium">cleared</span>
          </div>
        </div>

        {/* On-Site Active */}
        <div className="bg-white p-3 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">On-Site (Active)</span>
            <span className="material-symbols-outlined text-blue-600 text-[18px]">
              groups
            </span>
          </div>
          <div className="flex items-baseline gap-1 mt-1.5">
            <span className="text-2xl font-bold text-slate-900">{activeCount}</span>
            <span className="text-[11px] text-slate-400 font-medium">badges</span>
          </div>
        </div>

        {/* Checked Out */}
        <div className="bg-white p-3 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Checked Out</span>
            <span className="material-symbols-outlined text-slate-400 text-[18px]">
              logout
            </span>
          </div>
          <div className="flex items-baseline gap-1 mt-1.5">
            <span className="text-2xl font-bold text-slate-900">{checkedOutList.length + 10}</span>
            <span className="text-[11px] text-slate-400 font-medium">departed</span>
          </div>
        </div>
      </div>

      {/* Primary Action Bar */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => setShowScannerModal(true)}
          className="flex items-center justify-center gap-2 py-3 px-3 bg-primary hover:bg-primary-container text-white rounded-xl shadow-xs active:scale-98 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
          <span className="text-xs font-semibold">Scan / Verify</span>
        </button>
        <button
          onClick={() => {
            setWalkInStep(1);
            setShowWalkInModal(true);
          }}
          className="flex items-center justify-center gap-2 py-3 px-3 bg-blue-50 hover:bg-blue-100 text-primary rounded-xl border border-blue-100 shadow-xs active:scale-98 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">person_add</span>
          <span className="text-xs font-semibold whitespace-nowrap">+ Walk-in Reg</span>
        </button>
      </div>

      {/* Fast Pass Verification & Manual Lookup Card */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-100 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined text-[20px]">fact_check</span>
            <span className="text-xs font-semibold text-slate-900">Quick Pass Validation</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">Auto-sync ON</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
              tag
            </span>
            <input
              type="text"
              value={inputPassId}
              onChange={(e) => setInputPassId(e.target.value)}
              placeholder="Pass ID e.g. VPASS-9941"
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-medium pl-9 pr-3 py-2 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 uppercase tracking-wider"
            />
          </div>
          <button
            onClick={() => handleVerifyPass()}
            className="bg-primary hover:bg-primary-container text-white text-xs font-semibold px-4 py-2 rounded-xl active:scale-98 transition-all flex items-center gap-1 shadow-xs"
          >
            <span>Verify</span>
          </button>
        </div>

        {/* Verified Pass Result Box */}
        {verifiedPass && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {verifiedPass.visitorName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {verifiedPass.visitorName}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        verifiedPass.status === 'Checked In'
                          ? 'bg-emerald-500'
                          : verifiedPass.status === 'Approved'
                          ? 'bg-primary'
                          : 'bg-amber-500'
                      }`}
                    ></span>
                  </div>
                  <span className="text-[11px] text-slate-500 truncate">
                    {verifiedPass.company || 'External'} • {verifiedPass.category}
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-mono bg-blue-50 text-primary border border-blue-100 px-2 py-0.5 rounded-full flex-shrink-0">
                #{verifiedPass.id}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded-lg border border-slate-100 text-xs">
              <div>
                <span className="text-[11px] text-slate-400 block">Host Sponsor</span>
                <span className="font-semibold text-slate-800 truncate block">
                  {verifiedPass.hostName} ({verifiedPass.hostDepartment})
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Clearance Level</span>
                <span className="font-semibold text-primary truncate block">
                  {verifiedPass.zoneClearance}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              {verifiedPass.status === 'Checked In' ? (
                <div className="flex-1 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold flex items-center justify-center gap-1 border border-emerald-200">
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  <span>Badge Active • Currently On-Site</span>
                </div>
              ) : (
                <button
                  onClick={() => handleCompleteCheckIn(verifiedPass.id)}
                  className="flex-1 bg-primary hover:bg-primary-container text-white py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-transform"
                >
                  <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
                  <span>Complete Check-In</span>
                </button>
              )}

              <button
                onClick={() => showToast(`Badge printing dispatched for #${verifiedPass.id}`)}
                className="w-10 h-9 bg-white border border-slate-200 text-primary hover:bg-slate-50 rounded-lg flex items-center justify-center active:scale-98 transition-transform shadow-xs"
                title="Print Badge"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live Visitor Board Header & Filters */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-slate-900">Active Visitor Board</span>
            <span className="bg-primary text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {activeCount}
            </span>
          </div>
          <button
            onClick={() => setBoardFilter('all')}
            className="text-xs text-primary hover:underline font-medium"
          >
            Reset Filters
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
            search
          </span>
          <input
            type="text"
            value={boardSearch}
            onChange={(e) => setBoardSearch(e.target.value)}
            placeholder="Search visitor, host, or pass ID..."
            className="w-full bg-white text-slate-900 text-xs pl-9 pr-3 py-2 rounded-xl shadow-xs border border-slate-200 outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Status filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          <button
            onClick={() => setBoardFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              boardFilter === 'all'
                ? 'bg-primary text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            All ({activeCount})
          </button>
          <button
            onClick={() => setBoardFilter('recent')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              boardFilter === 'recent'
                ? 'bg-primary text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Recent Entry
          </button>
          <button
            onClick={() => setBoardFilter('overstay')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              boardFilter === 'overstay'
                ? 'bg-primary text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Overstay (&gt;3h)
          </button>
          <button
            onClick={() => setBoardFilter('contractor')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              boardFilter === 'contractor'
                ? 'bg-primary text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Contractors
          </button>
        </div>
      </div>

      {/* Live Visitor Cards Container */}
      <div className="flex flex-col gap-2.5">
        {filteredVisitors.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-2xl border border-dashed border-slate-200">
            <span className="material-symbols-outlined text-3xl text-slate-400">group_off</span>
            <p className="text-xs font-semibold text-slate-700 mt-1">No active visitors matching filter</p>
            <p className="text-[11px] text-slate-400">Scan or check in visitors above to populate live board.</p>
          </div>
        ) : (
          filteredVisitors.map((visitor) => (
            <div
              key={visitor.id}
              className="bg-white rounded-2xl shadow-xs border border-slate-100 p-3.5 flex flex-col gap-2 transition-all hover:border-blue-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0">
                    {visitor.visitorName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {visitor.visitorName}
                    </span>
                    <span className="text-[11px] text-slate-500 truncate">
                      {visitor.company || 'External'} • {visitor.category}
                    </span>
                  </div>
                </div>

                {/* Overstay or Time Badge */}
                {(visitor.overstayMinutes || 0) > 180 ? (
                  <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                    <span>3h 40m</span>
                  </span>
                ) : (
                  <span className="bg-blue-50 text-primary border border-blue-100 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    <span>Active Badge</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 block">Host</span>
                  <span className="text-slate-800 font-medium truncate block">
                    {visitor.hostName}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Check-in</span>
                  <span className="text-slate-800 font-medium truncate block">
                    {visitor.checkInTime || '10:15 AM'} ({visitor.checkInGate || 'Gate A'})
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="font-mono text-[11px] text-slate-400">
                  Badge: #{visitor.id}
                </span>
                <button
                  onClick={() => checkOutVisitor(visitor.id)}
                  className="bg-slate-100 hover:bg-slate-200 text-primary font-semibold text-xs px-3.5 py-1.5 rounded-lg active:scale-95 transition-all flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">logout</span>
                  <span>Check Out</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* QR SCANNER MODAL DIALOG */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-4 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">
                  center_focus_strong
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  Scan Visitor Badge
                </span>
              </div>
              <button
                onClick={() => setShowScannerModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Viewfinder Screen Box */}
            <div className="relative w-full h-56 bg-slate-950 rounded-xl flex items-center justify-center overflow-hidden">
              <div className="absolute inset-4 rounded-lg flex items-center justify-center">
                {/* Reticle Corners */}
                <div className="w-40 h-40 relative flex items-center justify-center">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary"></div>
                  {/* Laser line animation */}
                  <div className="w-full h-0.5 bg-primary shadow-[0_0_12px_#1976D2] animate-bounce"></div>
                </div>
              </div>

              <div className="absolute bottom-3 text-center px-4">
                <span className="text-[11px] text-slate-300">
                  Point optical scanner at Visitor QR or Apple / Google Wallet
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => handleSimulateScan('VPASS-9941')}
                className="w-full bg-primary hover:bg-primary-container text-white py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">qr_code_2</span>
                <span>Simulate Scan: David Miller (#VPASS-9941)</span>
              </button>
              {passes.find((p) => p.status === 'Approved' && p.id !== 'VPASS-9941') && (
                <button
                  onClick={() => {
                    const approved = passes.find(
                      (p) => p.status === 'Approved' && p.id !== 'VPASS-9941'
                    );
                    if (approved) handleSimulateScan(approved.id);
                  }}
                  className="w-full bg-blue-50 hover:bg-blue-100 text-primary py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 border border-blue-100 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">bolt</span>
                  <span>Scan Most Recent Approved Pass</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WALK-IN REGISTRATION MODAL (4-Step Wizard) */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-4 flex flex-col gap-3 animate-in fade-in duration-150 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-900">Walk-in Registration</span>
                <span className="text-[11px] text-slate-500">
                  Step {walkInStep} of 4:{' '}
                  {walkInStep === 1
                    ? 'Visitor Details'
                    : walkInStep === 2
                    ? 'Instant OTP'
                    : walkInStep === 3
                    ? 'Host & Purpose'
                    : 'Campus Safety & NDA'}
                </span>
              </div>
              <button
                onClick={() => setShowWalkInModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Step Progress Dots */}
            <div className="flex items-center gap-1.5 py-1">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`flex-1 h-1.5 rounded-full transition-colors ${
                    step <= walkInStep ? 'bg-primary' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>

            {/* Step 1: Details */}
            {walkInStep === 1 && (
              <div className="flex flex-col gap-2.5 mt-1 text-xs">
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Full Name *</span>
                  <input
                    type="text"
                    required
                    value={wName}
                    onChange={(e) => setWName(e.target.value)}
                    placeholder="e.g. Jordan Miller"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3 py-2 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Mobile Number *</span>
                  <input
                    type="tel"
                    required
                    value={wPhone}
                    onChange={(e) => setWPhone(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3 py-2 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">
                    Organization / Company
                  </span>
                  <input
                    type="text"
                    value={wCompany}
                    onChange={(e) => setWCompany(e.target.value)}
                    placeholder="e.g. Acme Industries"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3 py-2 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Simulated OTP */}
            {walkInStep === 2 && (
              <div className="flex flex-col gap-2.5 mt-1 text-xs">
                <span className="text-slate-500 leading-relaxed">
                  An instant SMS security token was dispatched to {wPhone || '+1 (555) 019-2834'} to verify physical ownership of the device.
                </span>
                <div className="flex justify-between gap-2 my-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => {
                        const newDigits = [...otpDigits];
                        newDigits[idx] = e.target.value;
                        setOtpDigits(newDigits);
                      }}
                      className="w-12 h-12 text-center text-lg font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-primary">
                  <span>Resend code in 42s</span>
                  <span className="text-emerald-600 font-semibold">Phone Verified ✓</span>
                </div>
              </div>
            )}

            {/* Step 3: Visit Info & Host Selection */}
            {walkInStep === 3 && (
              <div className="flex flex-col gap-2.5 mt-1 text-xs">
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Host Employee *</span>
                  <select
                    value={wHost}
                    onChange={(e) => setWHost(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3 py-2 rounded-xl outline-none focus:bg-white"
                  >
                    <option>Alex Morgan - Lead Architect</option>
                    <option>David Sterling - Operations Lead</option>
                    <option>Sarah Vance - BioLabs Director</option>
                    <option>Claire Davis - Reception & Facilities</option>
                    <option>Michael Chang - Security Compliance</option>
                  </select>
                </div>
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">Purpose of Visit</span>
                  <select
                    value={wPurpose}
                    onChange={(e) => setWPurpose(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-3 py-2 rounded-xl outline-none focus:bg-white"
                  >
                    <option>Client Meeting</option>
                    <option>Facility Inspection</option>
                    <option>Contractor Work</option>
                    <option>Interview</option>
                    <option>Equipment Delivery</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 4: Consent & Instant Check-In */}
            {walkInStep === 4 && (
              <div className="flex flex-col gap-2.5 mt-1 text-xs">
                <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex flex-col gap-1">
                  <span className="font-semibold text-slate-900">
                    Campus Safety & NDA Agreement
                  </span>
                  <span className="text-[11px] text-slate-500 leading-relaxed">
                    Visitor agrees to wear badge at all times, remain within authorized zones,
                    and observe physical safety and non-disclosure guidelines.
                  </span>
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={wAcknowledge}
                    onChange={(e) => setWAcknowledge(e.target.checked)}
                    className="w-4 h-4 rounded text-primary focus:ring-primary/20"
                  />
                  <span className="text-slate-800 font-medium">Visitor acknowledged terms & NDA</span>
                </label>
              </div>
            )}

            {/* Wizard Navigation Buttons */}
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
              {walkInStep > 1 && (
                <button
                  type="button"
                  onClick={() => setWalkInStep(walkInStep - 1)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-semibold"
                >
                  Back
                </button>
              )}
              {walkInStep < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (walkInStep === 1 && !wName.trim()) {
                      showToast('Please enter visitor full name');
                      return;
                    }
                    setWalkInStep(walkInStep + 1);
                  }}
                  className="flex-1 bg-primary hover:bg-primary-container text-white py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 shadow-xs active:scale-98 transition-all"
                >
                  <span>{walkInStep === 2 ? 'Verify OTP' : 'Next'}</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCompleteWalkIn}
                  className="flex-1 bg-primary hover:bg-primary-container text-white py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 shadow-xs active:scale-98 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">badge</span>
                  <span>Confirm & Issue Badge</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
