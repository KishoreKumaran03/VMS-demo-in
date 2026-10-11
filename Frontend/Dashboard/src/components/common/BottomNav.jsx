import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVms } from '../../context/VmsContext';

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setCurrentRole } = useVms();

  const navItems = [
    {
      id: 'super-admin',
      path: '/super-admin',
      label: 'Platform',
      icon: 'corporate_fare',
    },
    {
      id: 'site-admin',
      path: '/site-admin',
      label: 'Campus',
      icon: 'domain_verification',
    },
    {
      id: 'host',
      path: '/host',
      label: 'Host',
      icon: 'badge',
    },
    {
      id: 'receptionist',
      path: '/receptionist',
      label: 'Front Desk',
      icon: 'passkey',
    },
  ];

  // Don't show on login page
  if (location.pathname === '/login') {
    return null;
  }

  const handleNavClick = (item) => {
    setCurrentRole(item.id);
    navigate(item.path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-100 shadow-[0_-2px_12px_rgba(0,0,0,0.04)] md:hidden">
      <div className="flex justify-around items-center h-16 px-2 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`flex flex-col items-center justify-center min-w-[64px] h-12 transition-all rounded-lg ${
                isActive
                  ? 'text-primary font-semibold'
                  : 'text-slate-500 hover:text-slate-900 font-medium'
              }`}
            >
              <span
                className={`material-symbols-outlined text-[22px] transition-transform ${
                  isActive ? 'scale-110' : ''
                }`}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              <span className="text-[11px] mt-0.5 tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
