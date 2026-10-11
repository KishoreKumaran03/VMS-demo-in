import React from 'react';
import { useVms } from '../../context/VmsContext';

export const PassModal = ({ pass, onClose }) => {
  const { showToast } = useVms();

  if (!pass) return null;

  const handleShare = () => {
    const text = `VMS Digital Pass: https://vms.corp/pass/${pass.id} (${pass.visitorName})`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showToast(`Pass link for #${pass.id} copied to clipboard!`);
    } else {
      showToast(`Pass #${pass.id} ready.`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 flex flex-col gap-4 shadow-2xl relative overflow-hidden border border-slate-100">
        {/* Top Aesthetic Color Accent Bar */}
        <div className="h-2 w-full bg-primary absolute top-0 left-0"></div>

        {/* Modal Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[18px]">badge</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 leading-tight">
                {pass.visitorName}
              </h3>
              <p className="text-xs font-mono font-medium text-primary">
                #{pass.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Dynamic QR Code Badge Area */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col items-center justify-center gap-3">
          {/* SVG Crisp QR Graphic */}
          <div className="w-44 h-44 bg-white rounded-xl p-3 shadow-inner flex items-center justify-center border border-slate-100">
            <svg
              className="w-full h-full text-slate-900"
              fill="currentColor"
              viewBox="0 0 100 100"
            >
              {/* Corner position markers */}
              <path d="M5 5h30v30H5V5zm6 6v18h18V11H11z" />
              <rect height="10" width="10" x="15" y="15" />
              <path d="M65 5h30v30H65V5zm6 6v18h18V11H71z" />
              <rect height="10" width="10" x="75" y="15" />
              <path d="M5 65h30v30H5V65zm6 6v18h18V71H11z" />
              <rect height="10" width="10" x="15" y="75" />
              {/* Data modules pattern */}
              <rect height="10" width="5" x="42" y="8" />
              <rect height="6" width="6" x="52" y="15" />
              <rect height="5" width="8" x="42" y="24" />
              <rect height="6" width="6" x="12" y="42" />
              <rect height="6" width="8" x="22" y="48" />
              <rect height="5" width="6" x="8" y="54" />
              <rect height="12" width="12" x="45" y="42" />
              <rect height="6" width="6" x="62" y="42" />
              <rect height="6" width="8" x="72" y="48" />
              <rect height="12" width="8" x="84" y="42" />
              <rect height="10" width="6" x="42" y="62" />
              <rect height="6" width="8" x="52" y="65" />
              <rect height="6" width="14" x="42" y="78" />
              <rect height="14" width="8" x="62" y="72" />
              <rect height="6" width="6" x="76" y="65" />
              <rect height="10" width="10" x="85" y="78" />
              <rect height="6" width="8" x="72" y="88" />
            </svg>
          </div>
          <div className="flex items-center gap-1.5 text-primary text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span>Fast NFC & Optical Scanner Active</span>
          </div>
        </div>

        {/* Visitor Details Block */}
        <div className="flex flex-col gap-2 text-slate-800 text-xs">
          <div className="flex justify-between items-center py-0.5 border-b border-slate-100">
            <span className="text-slate-500">Visitor:</span>
            <span className="font-semibold text-slate-900">{pass.visitorName}</span>
          </div>
          <div className="flex justify-between items-center py-0.5 border-b border-slate-100">
            <span className="text-slate-500">Host:</span>
            <span className="text-slate-900 font-medium">
              {pass.hostName} ({pass.hostDepartment})
            </span>
          </div>
          <div className="flex justify-between items-center py-0.5 border-b border-slate-100">
            <span className="text-slate-500">Slot:</span>
            <span className="text-slate-900 font-medium">
              {pass.slotDescription || `${pass.scheduledDate}, ${pass.scheduledTime}`}
            </span>
          </div>
          <div className="flex justify-between items-center py-0.5 border-b border-slate-100">
            <span className="text-slate-500">Clearance:</span>
            <span className="font-semibold text-secondary">{pass.zoneClearance}</span>
          </div>
          <div className="flex justify-between items-center py-0.5">
            <span className="text-slate-500">Pass Status:</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                pass.status === 'Approved'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : pass.status === 'Checked In'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {pass.status}
            </span>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={handleShare}
            className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">share</span>
            <span>Share Link</span>
          </button>
          <button
            onClick={handlePrint}
            className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            <span>Print Badge</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-primary hover:bg-primary-container text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm active:scale-98 transition-transform"
        >
          <span className="material-symbols-outlined text-[16px]">done</span>
          <span>Close Preview</span>
        </button>
      </div>
    </div>
  );
};
