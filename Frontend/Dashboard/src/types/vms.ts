export type UserRole = 'super-admin' | 'site-admin' | 'host' | 'receptionist';

export type PassStatus = 'Pending Review' | 'Approved' | 'Checked In' | 'Checked Out' | 'Rejected' | 'Restricted';

export interface VisitorPass {
  id: string; // e.g. "VPASS-9941"
  visitorName: string;
  email: string;
  phone?: string;
  company?: string;
  category: 'Customer' | 'Vendor' | 'Interview' | 'VIP' | 'Contractor' | 'Auditor';
  hostName: string;
  hostDepartment: string;
  hostEmail?: string;
  scheduledDate: string; // "Today", "Tomorrow", "2026-10-12"
  scheduledTime: string; // "2:30 PM"
  slotDescription?: string; // "Today, 2:30 PM - 5:00 PM"
  zoneClearance: string; // "Executive Boardroom A", "Hardware Bay", "Level 2 Facility"
  status: PassStatus;
  purpose: string;
  rejectionReason?: string;
  avatarUrl?: string;
  checkInTime?: string;
  checkOutTime?: string;
  checkInGate?: string;
  overstayMinutes?: number;
}

export interface SiteInfo {
  id: string;
  name: string;
  location: string;
  district: string;
  status: 'Active' | 'High Load' | 'Maintenance';
  siteLead: string;
  activeEntries: number;
  capacityMax: number;
  kiosksOnline: number;
  kiosksOffline: number;
  readersSyncPercent: number;
  utilizationPercent: number;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  type: 'warning' | 'success' | 'policy';
  title: string;
  description: string;
}

export interface SystemNotification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'action';
  read: boolean;
  linkPath?: string;
}
