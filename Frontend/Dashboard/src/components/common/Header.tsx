import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVms } from '../../context/VmsContext';
import { UserRole } from '../../types/vms';

interface HeaderProps {
  onOpenNotifications: () => void;
  onOpenWorkflow?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenNotifications, onOpenWorkflow }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, currentRole, unreadNotificationCount, showToast } = useVms();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const getRoleTitle = (role: UserRole) => {
    switch (role) {
      case 'super-admin':
        return 'Super Admin';
      case 'site-admin':
        return 'Site Admin';
      case 'host':
        return 'Host';
      case 'receptionist':
        return 'Receptionist';
      default:
        return 'User';
    }
  };

  const handleLogout = () => {
    setShowProfileMenu(false);
    showToast('Secure session terminated. Logged out.');
    navigate('/login');
  };

  return (
    <>
      <header className="fixed top-0 w-full z-40 bg-white/90 backdrop-blur-xl border-b border-slate-100 shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
        <div className="max-w-7xl mx-auto h-14 px-4 flex items-center justify-between gap-3">
          {/* Logo & Portal Branding */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(location.pathname === '/login' ? '/login' : `/${currentRole}`)}
              className="flex items-center gap-2.5 text-left focus:outline-none"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  shield
                </span>
              </div>
              <div className="flex flex-col truncate">
                <span className="text-[15px] font-semibold text-on-surface tracking-tight leading-none">
                  VMS Portal
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  <span className="text-[11px] font-medium text-slate-500 truncate">
                    {getRoleTitle(currentRole)}
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* Right Action Icons: Demo Flow Trigger, Notifications & User Avatar */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Demo Flow Trigger */}
            {onOpenWorkflow && (
              <button
                onClick={onOpenWorkflow}
                className="h-8 px-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-primary text-xs font-semibold flex items-center gap-1.5 border border-blue-100 transition-colors shadow-xs"
                title="Open Demo Workflow Guide & Switch User"
              >
                <span className="material-symbols-outlined text-[16px]">alt_route</span>
                <span className="hidden sm:inline">Demo Flow</span>
              </button>
            )}

            {/* Notification Trigger */}
            <button
              aria-label="Notifications"
              onClick={onOpenNotifications}
              className="relative w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-primary transition-colors focus:outline-none"
            >
              <span className="material-symbols-outlined text-[22px]">notifications</span>
              {unreadNotificationCount > 0 && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-white animate-pulse"></span>
              )}
            </button>

            {/* Profile Menu Trigger */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-10 h-10 rounded-full p-0.5 hover:ring-2 hover:ring-primary/20 transition-all flex items-center justify-center focus:outline-none"
                title="Account menu"
              >
                <img
                  alt={currentUser.name}
                  src={currentUser.avatarUrl}
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200"
                />
              </button>

              {/* Profile Dropdown */}
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900">{currentUser.name}</p>
                    <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                      {getRoleTitle(currentUser.role)}
                    </span>
                  </div>

                  <div className="py-2 px-4 text-xs text-slate-500 flex flex-col gap-1 border-b border-slate-100">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-slate-400">Department</span>
                      <span className="font-medium text-slate-700">{currentUser.department}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-slate-400">Security Node</span>
                      <span className="font-medium text-primary">Node #04 Active</span>
                    </div>
                  </div>

                  <div className="pt-1">
                    {onOpenWorkflow && (
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          onOpenWorkflow();
                        }}
                        className="w-full px-4 py-2 text-left text-xs text-primary hover:bg-blue-50 flex items-center gap-2 font-medium transition-colors border-b border-slate-100"
                      >
                        <span className="material-symbols-outlined text-[16px]">alt_route</span>
                        <span>Switch User / Demo Guide</span>
                      </button>
                    )}
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">logout</span>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Backdrop for closing dropdown */}
      {showProfileMenu && (
        <div
          className="fixed inset-0 z-30 bg-transparent"
          onClick={() => setShowProfileMenu(false)}
        />
      )}
    </>
  );
};
