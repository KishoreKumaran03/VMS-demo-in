/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { VmsProvider, useVms } from './context/VmsContext.jsx';
import { Header } from './components/common/Header.jsx';
import { NotificationDrawer } from './components/common/NotificationDrawer.jsx';
import { Login } from './pages/Login.jsx';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard.jsx';
import { SiteAdminDashboard } from './pages/SiteAdminDashboard.jsx';
import { HostDashboard } from './pages/HostDashboard.jsx';
import { ReceptionistDashboard } from './pages/ReceptionistDashboard.jsx';

const AppLayout = ({ children }) => {
  const location = useLocation();
  const { toastMessage, dataError } = useVms();
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const isLoginPage = location.pathname === '/login';

  const { currentUser, authLoading } = useVms();
  const showHeader = !isLoginPage && !authLoading && !!currentUser;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-primary/20 selection:text-primary">
        {showHeader && (
          <Header
            onOpenNotifications={() => setIsNotifOpen(true)}
          />
        )}

      <main className={`flex-1 flex flex-col w-full ${!isLoginPage ? 'pt-14' : ''}`}>
        {dataError && currentUser && (
          <div role="alert" className="mx-auto mt-3 w-full max-w-4xl px-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Dashboard data could not be refreshed: {dataError}
            </div>
          </div>
        )}
        {children}
      </main>

      {/* Global Slide-Over Notification Drawer */}
      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />

      {/* Global Interactive Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-4 right-4 max-w-md mx-auto bg-slate-900 text-white py-2.5 px-4 rounded-xl shadow-xl flex items-center justify-between transition-all z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="material-symbols-outlined text-blue-400 text-[20px] flex-shrink-0">
              verified
            </span>
            <span className="text-xs text-slate-100 font-medium truncate">
              {toastMessage}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const RoleRoute = ({ role, children }) => {
  const { currentUser, authLoading } = useVms();
  if (authLoading) return <div className="min-h-screen grid place-items-center text-sm text-slate-500">Restoring your sign-in…</div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role !== role) {
    const route = ({ 'super-admin': '/super-admin', 'site-admin': '/site-admin', host: '/host', receptionist: '/receptionist' })[currentUser.role];
    return <Navigate to={route || '/login'} replace />;
  }
  return children;
};

export default function App() {
  return (
    <VmsProvider>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/super-admin" element={<RoleRoute role="super-admin"><SuperAdminDashboard /></RoleRoute>} />
            <Route path="/site-admin" element={<RoleRoute role="site-admin"><SiteAdminDashboard /></RoleRoute>} />
            <Route path="/host" element={<RoleRoute role="host"><HostDashboard /></RoleRoute>} />
            <Route path="/receptionist" element={<RoleRoute role="receptionist"><ReceptionistDashboard /></RoleRoute>} />
            {/* Default redirect to Login */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </VmsProvider>
  );
}
