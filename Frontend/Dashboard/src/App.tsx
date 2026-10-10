/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { VmsProvider, useVms } from './context/VmsContext';
import { Header } from './components/common/Header';
import { NotificationDrawer } from './components/common/NotificationDrawer';
import { Login } from './pages/Login';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { SiteAdminDashboard } from './pages/SiteAdminDashboard';
import { HostDashboard } from './pages/HostDashboard';
import { ReceptionistDashboard } from './pages/ReceptionistDashboard';
import { WorkflowHelper } from './components/common/WorkflowHelper';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { toastMessage } = useVms();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isWorkflowOpen, setIsWorkflowOpen] = useState(false);

  const isLoginPage = location.pathname === '/login';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-primary/20 selection:text-primary">
      {!isLoginPage && (
        <Header
          onOpenNotifications={() => setIsNotifOpen(true)}
          onOpenWorkflow={() => setIsWorkflowOpen(true)}
        />
      )}

      <main className={`flex-1 flex flex-col w-full ${!isLoginPage ? 'pt-14' : ''}`}>
        {children}
      </main>

      {/* Global Interactive Demo Workflow Guide & User Switcher */}
      <WorkflowHelper
        isOpen={isWorkflowOpen}
        onOpen={() => setIsWorkflowOpen(true)}
        onClose={() => setIsWorkflowOpen(false)}
      />

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

export default function App() {
  return (
    <VmsProvider>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/super-admin" element={<SuperAdminDashboard />} />
            <Route path="/site-admin" element={<SiteAdminDashboard />} />
            <Route path="/host" element={<HostDashboard />} />
            <Route path="/receptionist" element={<ReceptionistDashboard />} />
            {/* Default redirect to Login */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </VmsProvider>
  );
}
