import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVms } from '../../context/VmsContext';

export const WorkflowHelper = ({
  isOpen: controlledIsOpen,
  onOpen,
  onClose,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isDrawerOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalOpen;

  const handleOpen = () => {
    if (onOpen) onOpen();
    else setInternalOpen(true);
  };

  const handleClose = () => {
    if (onClose) onClose();
    else setInternalOpen(false);
  };

  const {
    currentUser,
    currentRole,
    logout,
    showToast,
  } = useVms();
  const navigate = useNavigate();
  const location = useLocation();

  const demoUsers = [
    {
      role: 'host',
      name: 'Alex Morgan',
      title: 'Host • Lead Architect',
      department: 'Engineering Dept',
      path: '/host',
      avatar:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      description: 'Invites guests, requests passes, views digital QR codes',
    },
    {
      role: 'site-admin',
      name: 'Elena Vance',
      title: 'Site Facility Admin',
      department: 'Campus Security & Facilities',
      path: '/site-admin',
      avatar:
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      description: 'Approves/rejects clearance queue, turnstiles, pass registry',
    },
    {
      role: 'receptionist',
      name: 'Claire Davis',
      title: 'Front Desk Operator',
      department: 'Main Gate Lobby Operations',
      path: '/receptionist',
      avatar:
        'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
      description: 'Scans QR badges, completes check-ins, walk-in OTP wizard',
    },
    {
      role: 'super-admin',
      name: 'Marcus Vance',
      title: 'Super Admin',
      department: 'Global Infrastructure',
      path: '/super-admin',
      avatar:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      description: 'Oversees 14 campuses, global policies, SOC audit logs, backups',
    },
  ];

  const handleSwitchUser = (target) => {
    if (!target) return;
    handleClose();
    if (currentRole === target.role) {
      navigate(target.path);
      return;
    }
    logout();
    navigate('/login');
    showToast(`Signed out. Sign in with a provisioned ${target.role} account to continue.`);
  };

  return (
    <>
      {/* Floating Trigger Pill at Bottom-Right */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          onClick={handleOpen}
          className="group flex items-center gap-2 bg-slate-900 hover:bg-primary text-white pl-3 pr-4 py-2.5 rounded-full shadow-2xl border border-white/20 active:scale-95 transition-all text-xs font-semibold"
          title="Open Role Workflow Guide"
        >
          <div className="w-5 h-5 rounded-full bg-primary group-hover:bg-white text-white group-hover:text-primary flex items-center justify-center transition-colors">
            <span className="material-symbols-outlined text-[14px]">alt_route</span>
          </div>
          <span className="tracking-tight">Role Workflow Guide</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        </button>
      </div>

      {/* Interactive Modal Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={handleClose}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
            <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
              {/* Header */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">alt_route</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold leading-tight">
                      Role Workflow Guide
                    </h2>
                    <p className="text-[11px] text-slate-300">
                      Simulate the complete visitor lifecycle
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Current Active Persona Banner */}
              <div className="p-3.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img
                    alt={currentUser.name}
                    src={currentUser.avatarUrl}
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-primary/30"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900">
                        {currentUser.name}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-primary text-white uppercase">
                        Current User
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">{currentUser.department}</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold text-primary">
                  /{currentRole}
                </span>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {/* SECTION 1: INSTANT USER SWITCHER */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      1. Open a role dashboard
                    </span>
                    <span className="text-[11px] text-slate-400">Sign in to a provisioned account for each role</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {demoUsers.map((user) => {
                      const isActive = currentRole === user.role;
                      return (
                        <button
                          key={user.role}
                          onClick={() => handleSwitchUser(user)}
                          className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                            isActive
                              ? 'bg-blue-50 border-primary ring-2 ring-primary/20 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <img
                              alt={user.name}
                              src={user.avatar}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {user.name}
                              </p>
                              <p className="text-[10px] font-medium text-slate-500 truncate">
                                {user.title}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px]">
                            <span
                              className={`font-semibold ${
                                isActive ? 'text-primary' : 'text-slate-400'
                              }`}
                            >
                              {isActive ? 'Active Now ✓' : 'Sign in as this role →'}
                            </span>
                            <span className="font-mono text-slate-400">{user.path}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 2: 5-STEP WORKFLOW WALKTHROUGH */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      2. Workflow steps
                    </span>
                    <span className="text-[11px] text-slate-500">End-to-End Lifecycle</span>
                  </div>

                  {/* Step 1 */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-primary font-bold text-[11px] flex items-center justify-center">
                          1
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          Host Requests a Pass
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500">Alex Morgan</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Host invites external guest with schedule and zone clearance.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() =>
                          handleSwitchUser(demoUsers.find((u) => u.role === 'host'))
                        }
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700"
                      >
                        Go to Host
                      </button>
                      <button
                        onClick={() => handleSwitchUser(demoUsers.find((u) => u.role === 'host'))}
                        className="px-2.5 py-1 bg-primary text-white rounded-lg text-[11px] font-semibold hover:bg-primary-container shadow-xs flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[13px]">bolt</span>
                        <span>Open Host Dashboard</span>
                      </button>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-primary font-bold text-[11px] flex items-center justify-center">
                          2
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          Site Admin Approves Pass
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500">Elena Vance</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Facility administrator evaluates access clearance queue.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() =>
                          handleSwitchUser(demoUsers.find((u) => u.role === 'site-admin'))
                        }
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700"
                      >
                        Go to Site Admin
                      </button>
                      <button
                        onClick={() => handleSwitchUser(demoUsers.find((u) => u.role === 'site-admin'))}
                        className="px-2.5 py-1 bg-primary text-white rounded-lg text-[11px] font-semibold hover:bg-primary-container shadow-xs flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[13px]">check</span>
                        <span>Open Admin Dashboard</span>
                      </button>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-primary font-bold text-[11px] flex items-center justify-center">
                          3
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          Host Views Generated QR Pass
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500">Alex Morgan</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Approved pass generates digital barcode ready for guest mobile wallet.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() =>
                          handleSwitchUser(demoUsers.find((u) => u.role === 'host'))
                        }
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700"
                      >
                        Go to Host Passes
                      </button>
                    </div>
                  </div>

                  {/* Step 4 & 5 */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-primary font-bold text-[11px] flex items-center justify-center">
                          4 & 5
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          Front Desk Check-In & Check-Out
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500">Claire Davis</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Receptionist validates Pass ID, triggers live arrival alert, and manages board.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() =>
                          handleSwitchUser(demoUsers.find((u) => u.role === 'receptionist'))
                        }
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700"
                      >
                        Go to Front Desk
                      </button>
                      <button
                        onClick={() => handleSwitchUser(demoUsers.find((u) => u.role === 'receptionist'))}
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-semibold hover:bg-emerald-700 shadow-xs flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[13px]">how_to_reg</span>
                        <span>Open Reception Dashboard</span>
                      </button>
                      <button
                        onClick={() => handleSwitchUser(demoUsers.find((u) => u.role === 'receptionist'))}
                        className="px-2.5 py-1 bg-slate-700 text-white rounded-lg text-[11px] font-semibold hover:bg-slate-800 shadow-xs flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[13px]">logout</span>
                        <span>Open Reception Dashboard</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  Total Active Records: {passes.length}
                </span>
                <button
                  onClick={handleClose}
                  className="px-3 py-1.5 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
