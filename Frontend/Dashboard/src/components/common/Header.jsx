import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVms } from '../../context/VmsContext';

export const Header = ({ onOpenNotifications }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, currentRole, unreadNotificationCount, showToast, logout } = useVms();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const getRoleTitle = (role) => {
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
    logout();
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

          {/* Right Action Icons: Notifications & User Avatar */}
          <div className="flex items-center gap-2 flex-shrink-0">
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
                <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-slate-200">
                  {currentUser.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                </span>
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

                  <div className="pt-1">
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
