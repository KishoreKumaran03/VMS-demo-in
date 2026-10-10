import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVms } from '../context/VmsContext';
import { UserRole } from '../types/vms';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { setCurrentRole, showToast } = useVms();

  // Portal modes: 'super-admin' | 'admin' | 'host-desk'
  const [selectedPortal, setSelectedPortal] = useState<'super-admin' | 'admin' | 'host-desk'>('admin');
  const [deskSubRole, setDeskSubRole] = useState<'host' | 'receptionist'>('host');

  const [email, setEmail] = useState('building-a.lead@enterprise-vms.global');
  const [password, setPassword] = useState('••••••••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [keepActive, setKeepActive] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Update credentials based on selected role
  const handlePortalChange = (portal: 'super-admin' | 'admin' | 'host-desk') => {
    setSelectedPortal(portal);
    if (portal === 'super-admin') {
      setEmail('super.admin@enterprise-vms.global');
    } else if (portal === 'admin') {
      setEmail('building-a.lead@enterprise-vms.global');
    } else {
      if (deskSubRole === 'host') {
        setEmail('alex.morgan@enterprise-vms.global');
      } else {
        setEmail('frontdesk.claire@enterprise-vms.global');
      }
    }
  };

  const handleDeskSubRoleChange = (subRole: 'host' | 'receptionist') => {
    setDeskSubRole(subRole);
    if (subRole === 'host') {
      setEmail('alex.morgan@enterprise-vms.global');
    } else {
      setEmail('frontdesk.claire@enterprise-vms.global');
    }
  };

  const handleAutofill = () => {
    if (selectedPortal === 'super-admin') {
      setEmail('super.admin@enterprise-vms.global');
    } else if (selectedPortal === 'admin') {
      setEmail('building-a.lead@enterprise-vms.global');
    } else {
      if (deskSubRole === 'host') {
        setEmail('alex.morgan@enterprise-vms.global');
      } else {
        setEmail('frontdesk.claire@enterprise-vms.global');
      }
    }
    setPassword('VMS-Enterprise-2026!');
    showToast('Demo credentials autofilled');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    let targetRole: UserRole = 'site-admin';
    let targetPath = '/site-admin';

    if (selectedPortal === 'super-admin') {
      targetRole = 'super-admin';
      targetPath = '/super-admin';
    } else if (selectedPortal === 'admin') {
      targetRole = 'site-admin';
      targetPath = '/site-admin';
    } else {
      if (deskSubRole === 'host') {
        targetRole = 'host';
        targetPath = '/host';
      } else {
        targetRole = 'receptionist';
        targetPath = '/receptionist';
      }
    }

    setTimeout(() => {
      setIsLoading(false);
      setCurrentRole(targetRole);
      navigate(targetPath);
      showToast(`Authenticated successfully as ${targetRole.replace('-', ' ')}`);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 py-8">
      {/* Brand Icon Shield */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-primary to-primary-container shadow-md flex items-center justify-center text-white mb-4">
        <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>
          verified_user
        </span>
      </div>

      {/* Enterprise Tag */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100/70 text-primary text-xs font-semibold uppercase tracking-wider mb-2">
        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
          check_circle
        </span>
        <span>Enterprise Access</span>
      </div>

      {/* Main Title & Subtitle */}
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight text-center">
        VMS — Visitor Management
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-6 text-center">
        Secure. Simplify. Welcome.
      </p>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-5">
        {/* Portal Mode Switcher */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-700">Select Access Portal</label>
          <div className="bg-slate-100 p-1 rounded-xl grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => handlePortalChange('super-admin')}
              className={`py-2 text-xs font-medium rounded-lg transition-all text-center ${
                selectedPortal === 'super-admin'
                  ? 'bg-white text-primary font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Super Admin
            </button>
            <button
              type="button"
              onClick={() => handlePortalChange('admin')}
              className={`py-2 text-xs font-medium rounded-lg transition-all text-center ${
                selectedPortal === 'admin'
                  ? 'bg-white text-primary font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => handlePortalChange('host-desk')}
              className={`py-2 text-xs font-medium rounded-lg transition-all text-center ${
                selectedPortal === 'host-desk'
                  ? 'bg-white text-primary font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Host / Desk
            </button>
          </div>

          {/* Sub-role selector if Host / Desk is active */}
          {selectedPortal === 'host-desk' && (
            <div className="flex items-center gap-2 mt-1 p-1 bg-blue-50/60 rounded-lg border border-blue-100">
              <span className="text-[11px] font-semibold text-slate-600 ml-2">Demo Role:</span>
              <button
                type="button"
                onClick={() => handleDeskSubRoleChange('host')}
                className={`flex-1 py-1 text-xs rounded-md font-medium transition-all ${
                  deskSubRole === 'host'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Host
              </button>
              <button
                type="button"
                onClick={() => handleDeskSubRoleChange('receptionist')}
                className={`flex-1 py-1 text-xs rounded-md font-medium transition-all ${
                  deskSubRole === 'receptionist'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Receptionist (Front Desk)
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Role Description Box */}
        <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="material-symbols-outlined text-[20px]">
              {selectedPortal === 'super-admin'
                ? 'shield'
                : selectedPortal === 'admin'
                ? 'domain'
                : deskSubRole === 'host'
                ? 'badge'
                : 'desk'}
            </span>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-900">
              {selectedPortal === 'super-admin'
                ? 'Global Infrastructure Engine'
                : selectedPortal === 'admin'
                ? 'Site Facility Administrator'
                : deskSubRole === 'host'
                ? 'Host & Department Sponsor'
                : 'Front Desk & Gate Receptionist'}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              {selectedPortal === 'super-admin'
                ? 'Manage enterprise campuses, tenant compliance policies, tier-4 security audits, and geo-replicated backups.'
                : selectedPortal === 'admin'
                ? 'Manage building badges, zone access barriers, hardware gates, and kiosk consoles.'
                : deskSubRole === 'host'
                ? 'Invite guests, request security passes, monitor real-time lobby arrivals, and view QR passes.'
                : 'Instant pass verification, walk-in registration, fast optical QR scanning, and live visitor board.'}
            </p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Username or Enterprise Email
              </label>
              <button
                type="button"
                onClick={handleAutofill}
                className="text-primary hover:underline text-[11px] font-semibold flex items-center gap-0.5"
              >
                <span className="material-symbols-outlined text-[13px]">bolt</span>
                <span>Autofill</span>
              </button>
            </div>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-slate-400 text-[18px]">
                badge
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@enterprise-vms.global"
                className="w-full h-11 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* Password input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Security Credential / PIN
              </label>
              <span className="text-[11px] text-slate-400">Location Pin Req.</span>
            </div>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-slate-400 text-[18px]">
                lock
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••••"
                className="w-full h-11 pl-9 pr-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* Keep active & Reset credentials */}
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600">
              <input
                type="checkbox"
                checked={keepActive}
                onChange={(e) => setKeepActive(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary/30"
              />
              <span>Keep active terminal</span>
            </label>
            <button
              type="button"
              onClick={() => showToast('Credential reset link dispatched to security supervisor.')}
              className="text-primary hover:underline text-xs font-medium"
            >
              Reset Credential?
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-primary hover:bg-primary-container text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all disabled:opacity-75"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Authenticating Terminal...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">login</span>
                <span>Authenticate Portal</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Security Compliance Footer */}
      <div className="mt-6 flex flex-col items-center text-center max-w-sm px-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <span className="material-symbols-outlined text-[15px] text-slate-400">lock</span>
          <span>256-bit TLS Encrypted • SOC2 Type II Certified</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
          All access attempts are logged for physical security audit requirements.
        </p>
      </div>
    </div>
  );
};
