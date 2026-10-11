import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useVms } from '../../context/VmsContext';

export const NotificationDrawer = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { notifications, markNotificationsAsRead, clearNotifications, setCurrentRole } = useVms();

  if (!isOpen) return null;

  const handleNotificationClick = (linkPath) => {
    if (linkPath) {
      if (linkPath.includes('super-admin')) setCurrentRole('super-admin');
      else if (linkPath.includes('site-admin')) setCurrentRole('site-admin');
      else if (linkPath.includes('host')) setCurrentRole('host');
      else if (linkPath.includes('receptionist')) setCurrentRole('receptionist');
      navigate(linkPath);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-sm bg-white shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">
                notifications
              </span>
              <h2 className="text-base font-semibold text-slate-900">Notifications</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                {notifications.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Action strip */}
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
            <button
              onClick={markNotificationsAsRead}
              className="text-primary hover:underline font-medium"
            >
              Mark all as read
            </button>
            <button
              onClick={clearNotifications}
              className="text-slate-500 hover:text-red-600 transition-colors"
            >
              Clear all
            </button>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
            {notifications.length === 0 ? (
              <div className="text-center py-12 flex flex-col items-center text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">
                  notifications_off
                </span>
                <p className="text-sm font-medium text-slate-600">No notifications</p>
                <p className="text-xs text-slate-400">All alerts have been cleared.</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif.linkPath)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    notif.read
                      ? 'bg-white border-slate-100 text-slate-600'
                      : 'bg-blue-50/50 border-blue-100 text-slate-900'
                  } hover:border-primary/40 hover:shadow-xs`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                      {notif.type}
                    </span>
                    <span className="text-[11px] text-slate-400">{notif.timestamp}</span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-0.5">{notif.title}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{notif.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
