import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { VisitorPass, SiteInfo, AuditLogItem, SystemNotification, UserRole } from '../types/vms';

interface VmsContextType {
  currentUser: {
    name: string;
    email: string;
    role: UserRole;
    department: string;
    avatarUrl: string;
  };
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  passes: VisitorPass[];
  sites: SiteInfo[];
  auditLogs: AuditLogItem[];
  notifications: SystemNotification[];
  unreadNotificationCount: number;
  markNotificationsAsRead: () => void;
  clearNotifications: () => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  addPassRequest: (pass: Omit<VisitorPass, 'id' | 'status'>) => VisitorPass;
  approvePass: (id: string) => void;
  rejectPass: (id: string, reason?: string) => void;
  checkInVisitor: (id: string, gate?: string) => boolean;
  checkOutVisitor: (id: string) => void;
  addSite: (site: Omit<SiteInfo, 'id' | 'utilizationPercent'>) => void;
  liveLobbyAlert: {
    visible: boolean;
    visitorName: string;
    location: string;
    time: string;
  } | null;
  dismissLiveLobbyAlert: () => void;
  resetDemoData: () => void;
}

const INITIAL_PASSES: VisitorPass[] = [
  {
    id: 'VPASS-9941',
    visitorName: 'David Miller',
    email: 'david.miller@zenithventures.com',
    phone: '+1 (555) 392-1084',
    company: 'Zenith Ventures',
    category: 'Customer',
    hostName: 'Alex Morgan',
    hostDepartment: 'Engineering Dept',
    scheduledDate: 'Today',
    scheduledTime: '2:30 PM',
    slotDescription: 'Today, 2:30 PM - 5:00 PM',
    zoneClearance: 'Executive Boardroom A',
    status: 'Approved',
    purpose: 'Quarterly Infrastructure & Cloud Architecture Review',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'VPASS-8812',
    visitorName: 'Chloe Bennett',
    email: 'c.bennett@designcraft.io',
    phone: '+1 (555) 918-2431',
    company: 'Design Team',
    category: 'Interview',
    hostName: 'Alex Morgan',
    hostDepartment: 'Engineering Dept',
    scheduledDate: 'Today',
    scheduledTime: '10:00 AM',
    slotDescription: 'Today • Checked In at 10:15 AM',
    zoneClearance: 'Design Studio 4B',
    status: 'Checked In',
    purpose: 'Senior UX Candidate Onsite Portfolio Presentation',
    checkInTime: '10:15 AM',
    checkInGate: 'East Lobby',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'VPASS-7731',
    visitorName: 'Robert Chen',
    email: 'robert.chen@apexinstruments.com',
    phone: '+1 (555) 438-9901',
    company: 'Apex Instruments',
    category: 'Vendor',
    hostName: 'Alex Morgan',
    hostDepartment: 'Engineering Dept',
    scheduledDate: 'Tomorrow',
    scheduledTime: '9:00 AM',
    slotDescription: 'Tomorrow, 9:00 AM • Hardware Bay',
    zoneClearance: 'Hardware Bay Level 1',
    status: 'Pending Review',
    purpose: 'Specialized Server Rack Sensor Calibrations',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'VPASS-6620',
    visitorName: 'Samuel Brooks',
    email: 'samuel@brookshvac.com',
    phone: '+1 (555) 720-1923',
    company: 'Brooks HVAC',
    category: 'Contractor',
    hostName: 'Alex Morgan',
    hostDepartment: 'Engineering Dept',
    scheduledDate: 'Today',
    scheduledTime: '11:30 AM',
    slotDescription: 'Today, 11:30 AM',
    zoneClearance: 'Central Chiller Plant',
    status: 'Rejected',
    purpose: 'Refrigerant pressure gauge maintenance check',
    rejectionReason: 'Missing safety credential upload',
    avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'VPASS-1042',
    visitorName: 'Sarah Jenkins',
    email: 's.jenkins@partnercapital.com',
    phone: '+1 (555) 883-2940',
    company: 'Partner Capital',
    category: 'VIP',
    hostName: 'Engineering VP',
    hostDepartment: 'Executive Team',
    scheduledDate: 'Today',
    scheduledTime: '2:00 PM',
    slotDescription: 'Today, 2:00 PM',
    zoneClearance: 'Executive Suite & Labs',
    status: 'Pending Review',
    purpose: 'Series B Strategic Partnership Briefing',
  },
  {
    id: 'VPASS-1043',
    visitorName: 'Mark Wood',
    email: 'mark.wood@alumninetwork.edu',
    phone: '+1 (555) 674-8891',
    company: 'Fall Graduate Pool',
    category: 'Interview',
    hostName: 'HR Pool',
    hostDepartment: 'People Operations',
    scheduledDate: 'Today',
    scheduledTime: '3:15 PM',
    slotDescription: 'Slot 11-B • Group Clearance',
    zoneClearance: 'Auditorium Wing',
    status: 'Pending Review',
    purpose: 'Graduate Hiring Drive Cohort 2 Assessment',
  },
  {
    id: 'VPASS-1044',
    visitorName: 'Dr. Elena Vance',
    email: 'e.vance@techbio-partners.com',
    phone: '+1 (555) 234-9102',
    company: 'TechBio Labs',
    category: 'Vendor',
    hostName: 'David Sterling',
    hostDepartment: 'R&D Operations',
    scheduledDate: 'Today',
    scheduledTime: '1:45 PM',
    slotDescription: 'Hardware Delivery Escort',
    zoneClearance: 'R&D Lab 4 Secure Cleanroom',
    status: 'Pending Review',
    purpose: 'Cryo-cooling sensor calibration and handover',
  },
  {
    id: 'VPASS-8820',
    visitorName: 'Elena Rostova',
    email: 'elena.rostova@apexbio.com',
    phone: '+1 (555) 678-2234',
    company: 'Apex BioLabs',
    category: 'Auditor',
    hostName: 'Dr. Sarah Vance',
    hostDepartment: 'Research Operations',
    scheduledDate: 'Today',
    scheduledTime: '8:15 AM',
    slotDescription: 'Check-in 08:15 AM (Gate A)',
    zoneClearance: 'Cleanroom B1',
    status: 'Checked In',
    purpose: 'Annual ISO Compliance Protocol Audit',
    checkInTime: '08:15 AM',
    checkInGate: 'Gate A',
    overstayMinutes: 220,
  },
  {
    id: 'VPASS-9102',
    visitorName: 'Kenji Takahashi',
    email: 'kenji@kurodapower.jp',
    phone: '+1 (555) 887-1903',
    company: 'Kuroda Power',
    category: 'Contractor',
    hostName: 'Mark Wilson',
    hostDepartment: 'Facilities',
    scheduledDate: 'Today',
    scheduledTime: '10:30 AM',
    slotDescription: 'Check-in 10:30 AM (North Dock)',
    zoneClearance: 'Substation Gamma',
    status: 'Checked In',
    purpose: 'Uninterruptible power supply battery bank inspection',
    checkInTime: '10:30 AM',
    checkInGate: 'North Dock',
    overstayMinutes: 75,
  },
  {
    id: 'VPASS-9443',
    visitorName: 'Priya Patel',
    email: 'priya.patel@globalventures.com',
    phone: '+1 (555) 432-8765',
    company: 'Global Ventures',
    category: 'Customer',
    hostName: 'Ananya Sen',
    hostDepartment: 'Product',
    scheduledDate: 'Today',
    scheduledTime: '11:25 AM',
    slotDescription: 'Check-in 11:25 AM (Lobby Gate)',
    zoneClearance: 'Conference Room 3',
    status: 'Checked In',
    purpose: 'Enterprise SaaS expansion contract sign-off',
    checkInTime: '11:25 AM',
    checkInGate: 'Lobby Gate',
    overstayMinutes: 22,
  },
  {
    id: 'VPASS-8821',
    visitorName: 'Kavita Sharma',
    email: 'kavita.s@partnertech.io',
    company: 'Partner Tech',
    category: 'Vendor',
    hostName: 'Alex Mercer',
    hostDepartment: 'Engineering',
    scheduledDate: 'Today',
    scheduledTime: '10:14 AM',
    slotDescription: 'Gate 1 • 10:14 AM',
    zoneClearance: 'Zone A - Floor 3',
    status: 'Checked In',
    purpose: 'API Gateway Integration Sync',
    checkInTime: '10:14 AM',
    checkInGate: 'Gate 1',
  },
  {
    id: 'VPASS-8819',
    visitorName: 'Arthur Pendleton',
    email: 'arthur.p@facilities-corp.com',
    company: 'Pendleton Security',
    category: 'Contractor',
    hostName: 'Marcus Cole',
    hostDepartment: 'Facilities',
    scheduledDate: 'Today',
    scheduledTime: '1:30 PM',
    slotDescription: 'ETA: 01:30 PM',
    zoneClearance: 'Campus Perimeter',
    status: 'Approved',
    purpose: 'Turnstile mechanical maintenance audit',
  },
  {
    id: 'VPASS-7704',
    visitorName: 'Victor Kravitz',
    email: 'victor.k@unknown.org',
    company: 'Flagged Entity',
    category: 'Vendor',
    hostName: 'Unassigned',
    hostDepartment: 'Site Security Lead',
    scheduledDate: 'Today',
    scheduledTime: '09:00 AM',
    slotDescription: 'Deny Gate Access',
    zoneClearance: 'None (Restricted)',
    status: 'Restricted',
    purpose: 'Unauthorized access attempt - flagged watchlist',
    rejectionReason: 'Flagged on federal denied party & corporate watch list',
  },
];

const INITIAL_SITES: SiteInfo[] = [
  {
    id: 'site-1',
    name: 'Tech Park Campus A',
    location: 'San Jose, CA',
    district: 'Innovation District',
    status: 'High Load',
    siteLead: 'Marcus Vance',
    activeEntries: 218,
    capacityMax: 240,
    kiosksOnline: 8,
    kiosksOffline: 0,
    readersSyncPercent: 100,
    utilizationPercent: 92,
  },
  {
    id: 'site-2',
    name: 'Downtown HQ Tower',
    location: 'New York, NY',
    district: 'Financial District',
    status: 'Active',
    siteLead: 'Elena Rostova',
    activeEntries: 145,
    capacityMax: 210,
    kiosksOnline: 12,
    kiosksOffline: 1,
    readersSyncPercent: 98,
    utilizationPercent: 68,
  },
  {
    id: 'site-3',
    name: 'Innovation R&D Hub',
    location: 'Austin, TX',
    district: 'Silicon Hills',
    status: 'Active',
    siteLead: 'Devon Brooks',
    activeEntries: 78,
    capacityMax: 175,
    kiosksOnline: 4,
    kiosksOffline: 0,
    readersSyncPercent: 100,
    utilizationPercent: 45,
  },
  {
    id: 'site-4',
    name: 'Metro Research Center',
    location: 'Boston, MA',
    district: 'Kendall Square',
    status: 'Active',
    siteLead: 'Sarah Vance',
    activeEntries: 45,
    capacityMax: 150,
    kiosksOnline: 6,
    kiosksOffline: 0,
    readersSyncPercent: 100,
    utilizationPercent: 30,
  },
];

const INITIAL_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'log-1',
    timestamp: '14:28:12 UTC',
    type: 'warning',
    title: 'Badge Swipe Reject - Unassigned Level',
    description: 'Visitor: Jordan K. • Server Room Fl. 4 • Tech Park A',
  },
  {
    id: 'log-2',
    timestamp: '14:19:04 UTC',
    type: 'success',
    title: 'Kiosk Fast-Pass Authorization',
    description: 'Host: Sarah Lin • Downtown HQ Front Lobby',
  },
  {
    id: 'log-3',
    timestamp: '13:55:40 UTC',
    type: 'policy',
    title: 'NDA Auto-Signed & Stored',
    description: 'Guest: Liam Nguyen • Innovation R&D Hub',
  },
  {
    id: 'log-4',
    timestamp: '13:42:18 UTC',
    type: 'success',
    title: 'Automated Check-out via BLE Sensor',
    description: 'Visitor: Rachel Adams • Metro Research Center',
  },
];

const INITIAL_NOTIFICATIONS: SystemNotification[] = [
  {
    id: 'notif-1',
    timestamp: '10:15 AM',
    title: 'Visitor Arrived at East Lobby',
    message: 'Chloe Bennett checked in for UX Candidate interview.',
    type: 'success',
    read: false,
    linkPath: '/host',
  },
  {
    id: 'notif-2',
    timestamp: '09:45 AM',
    title: 'New Pass Clearance Request',
    message: 'Sarah Jenkins VIP pass submitted by Engineering VP.',
    type: 'action',
    read: false,
    linkPath: '/site-admin',
  },
  {
    id: 'notif-3',
    timestamp: '08:30 AM',
    title: 'System Vault Snapshot Complete',
    message: 'Daily encrypted backup snapshot synced across all 14 nodes.',
    type: 'info',
    read: true,
    linkPath: '/super-admin',
  },
];

const VmsContext = createContext<VmsContextType | null>(null);

export const VmsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRoleState] = useState<UserRole>(() => {
    return (localStorage.getItem('vms_current_role') as UserRole) || 'super-admin';
  });

  const [passes, setPasses] = useState<VisitorPass[]>(() => {
    const saved = localStorage.getItem('vms_passes');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return INITIAL_PASSES;
  });

  const [sites, setSites] = useState<SiteInfo[]>(() => {
    const saved = localStorage.getItem('vms_sites');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return INITIAL_SITES;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() => {
    const saved = localStorage.getItem('vms_audit_logs');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return INITIAL_AUDIT_LOGS;
  });

  const [notifications, setNotifications] = useState<SystemNotification[]>(() => {
    const saved = localStorage.getItem('vms_notifications');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return INITIAL_NOTIFICATIONS;
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [liveLobbyAlert, setLiveLobbyAlert] = useState<{
    visible: boolean;
    visitorName: string;
    location: string;
    time: string;
  } | null>({
    visible: true,
    visitorName: 'Chloe Bennett',
    location: 'East Lobby Reception • Waiting in Lounge B',
    time: '10:15 AM',
  });

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('vms_current_role', currentRole);
  }, [currentRole]);

  useEffect(() => {
    localStorage.setItem('vms_passes', JSON.stringify(passes));
  }, [passes]);

  useEffect(() => {
    localStorage.setItem('vms_sites', JSON.stringify(sites));
  }, [sites]);

  useEffect(() => {
    localStorage.setItem('vms_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('vms_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  const setCurrentRole = (role: UserRole) => {
    setCurrentRoleState(role);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const dismissLiveLobbyAlert = () => {
    setLiveLobbyAlert(null);
  };

  const markNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  // Workflow Action 1: Host creates a pass request
  const addPassRequest = (passData: Omit<VisitorPass, 'id' | 'status'>): VisitorPass => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const newId = `VPASS-${randomNum}`;
    const newPass: VisitorPass = {
      ...passData,
      id: newId,
      status: 'Pending Review',
    };

    setPasses((prev) => [newPass, ...prev]);

    // Push notification to site admin
    const newNotif: SystemNotification = {
      id: `notif-${Date.now()}`,
      timestamp: 'Just now',
      title: `Pass Request for ${newPass.visitorName}`,
      message: `Requested by ${newPass.hostName} for ${newPass.scheduledDate} (${newId}).`,
      type: 'action',
      read: false,
      linkPath: '/site-admin',
    };
    setNotifications((prev) => [newNotif, ...prev]);

    // Add audit log
    const nowStr = new Date().toTimeString().split(' ')[0] + ' UTC';
    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: nowStr,
        type: 'policy',
        title: `Pass clearance requested: ${newId}`,
        description: `Visitor: ${newPass.visitorName} • Host: ${newPass.hostName}`,
      },
      ...prev,
    ]);

    showToast(`Pass request submitted for ${newPass.visitorName} (#${newId})! Pending Site Admin approval.`);
    return newPass;
  };

  // Workflow Action 2: Site Admin approves pass
  const approvePass = (id: string) => {
    setPasses((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, status: 'Approved' };
        }
        return p;
      })
    );

    const approvedPass = passes.find((p) => p.id === id);
    const vName = approvedPass ? approvedPass.visitorName : id;

    // Push notification to host
    const newNotif: SystemNotification = {
      id: `notif-${Date.now()}`,
      timestamp: 'Just now',
      title: `Pass Approved: ${vName}`,
      message: `Site Admin approved badge #${id}. QR Pass is now ready to view & share.`,
      type: 'success',
      read: false,
      linkPath: '/host',
    };
    setNotifications((prev) => [newNotif, ...prev]);

    const nowStr = new Date().toTimeString().split(' ')[0] + ' UTC';
    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: nowStr,
        type: 'success',
        title: `Pass clearance granted: #${id}`,
        description: `Visitor ${vName} pre-cleared for campus entry`,
      },
      ...prev,
    ]);

    showToast(`Pass #${id} approved! Digital QR badge issued.`);
  };

  // Workflow Action 2b: Site Admin rejects pass
  const rejectPass = (id: string, reason = 'Administrative review denied access') => {
    setPasses((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, status: 'Rejected', rejectionReason: reason };
        }
        return p;
      })
    );

    const rejectedPass = passes.find((p) => p.id === id);
    const vName = rejectedPass ? rejectedPass.visitorName : id;

    const newNotif: SystemNotification = {
      id: `notif-${Date.now()}`,
      timestamp: 'Just now',
      title: `Pass Rejected: ${vName}`,
      message: `Pass #${id} was rejected: ${reason}`,
      type: 'warning',
      read: false,
      linkPath: '/host',
    };
    setNotifications((prev) => [newNotif, ...prev]);

    showToast(`Pass #${id} rejected.`);
  };

  // Workflow Action 3: Receptionist checks in visitor (verifies pass)
  const checkInVisitor = (id: string, gate = 'Main Gate Lobby'): boolean => {
    const target = passes.find((p) => p.id.toUpperCase() === id.toUpperCase());
    if (!target) {
      showToast(`Pass ID "${id}" not found in system.`);
      return false;
    }

    if (target.status === 'Checked In') {
      showToast(`${target.visitorName} is already checked in.`);
      return true;
    }

    if (target.status === 'Restricted' || target.status === 'Rejected') {
      showToast(`WARNING: Pass #${target.id} is ${target.status}! Gate entry denied.`);
      return false;
    }

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setPasses((prev) =>
      prev.map((p) => {
        if (p.id.toUpperCase() === id.toUpperCase()) {
          return {
            ...p,
            status: 'Checked In',
            checkInTime: nowTime,
            checkInGate: gate,
          };
        }
        return p;
      })
    );

    // Trigger Live Lobby Alert for host
    setLiveLobbyAlert({
      visible: true,
      visitorName: target.visitorName,
      location: `${gate} • Waiting in Lobby`,
      time: nowTime,
    });

    // Notify host
    const newNotif: SystemNotification = {
      id: `notif-${Date.now()}`,
      timestamp: nowTime,
      title: `${target.visitorName} has arrived`,
      message: `Checked in at ${gate}. Host notification sent.`,
      type: 'success',
      read: false,
      linkPath: '/host',
    };
    setNotifications((prev) => [newNotif, ...prev]);

    const nowStr = new Date().toTimeString().split(' ')[0] + ' UTC';
    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: nowStr,
        type: 'success',
        title: `Kiosk Check-In: #${target.id}`,
        description: `Visitor ${target.visitorName} checked in at ${gate}`,
      },
      ...prev,
    ]);

    showToast(`${target.visitorName} checked in successfully! NFC badge activated.`);
    return true;
  };

  // Workflow Action 4: Receptionist checks out visitor
  const checkOutVisitor = (id: string) => {
    const target = passes.find((p) => p.id === id);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setPasses((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return {
            ...p,
            status: 'Checked Out',
            checkOutTime: nowTime,
          };
        }
        return p;
      })
    );

    const nowStr = new Date().toTimeString().split(' ')[0] + ' UTC';
    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: nowStr,
        type: 'success',
        title: `Visitor checked out: #${id}`,
        description: `${target ? target.visitorName : 'Guest'} departed facility`,
      },
      ...prev,
    ]);

    showToast(`${target ? target.visitorName : 'Visitor'} checked out successfully.`);
  };

  const addSite = (newSiteData: Omit<SiteInfo, 'id' | 'utilizationPercent'>) => {
    const newSite: SiteInfo = {
      ...newSiteData,
      id: `site-${Date.now()}`,
      utilizationPercent: Math.round((newSiteData.activeEntries / newSiteData.capacityMax) * 100),
    };
    setSites((prev) => [...prev, newSite]);
    showToast(`New facility campus "${newSite.name}" registered.`);
  };

  const resetDemoData = () => {
    setPasses(INITIAL_PASSES);
    setSites(INITIAL_SITES);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setNotifications(INITIAL_NOTIFICATIONS);
    showToast('Demo data reset to factory preset.');
  };

  // Dynamic user profile based on role
  const currentUser = {
    name:
      currentRole === 'super-admin'
        ? 'Marcus Vance'
        : currentRole === 'site-admin'
        ? 'Elena Vance'
        : currentRole === 'host'
        ? 'Alex Morgan'
        : 'Claire Davis',
    email:
      currentRole === 'super-admin'
        ? 'super.admin@enterprise-vms.global'
        : currentRole === 'site-admin'
        ? 'building-a.lead@enterprise-vms.global'
        : currentRole === 'host'
        ? 'alex.morgan@enterprise-vms.global'
        : 'claire.davis@enterprise-vms.global',
    role: currentRole,
    department:
      currentRole === 'super-admin'
        ? 'Global Infrastructure'
        : currentRole === 'site-admin'
        ? 'Campus Facilities & Security'
        : currentRole === 'host'
        ? 'Engineering Dept • Lead Architect'
        : 'Front Desk & Gate Operations',
    avatarUrl:
      currentRole === 'host'
        ? 'https://lh3.googleusercontent.com/aida-public/AB6AXuBmNqWNX-K4hCElBt1l4hSPESjdgWM3e6lkv1IWDOUMMgsJ-PrGCxdOFugjVQquALU6VsddoxKEugik37vpIbPq3PdzjgYRgNoI_vMFCQwB6aZhhpKpm56qCO-SrbiFenwtkFpG6wTb9OUVUm6wg17aFTimlcPGXsAKJoGeOMZjuLk9Gs3a7PB6YYtcOiYsxYLfi-ewF4JrgI9TuBPqePD0JHsCdVrvZwPXv8UsGAfySnFt0Vk_03Lq9w'
        : 'https://lh3.googleusercontent.com/aida-public/AB6AXuBUUlirDZ3eNAd4RsKv1qFht_LjdXcSFM57-HGRUbO8JEc_iTUcrL6rVuSiFwshojgy7AIiB9gZxkc9mNV3hU3L7p3E1FdgHHwlv878NvpVycssnC17y96j559_w9yJ836ZaximaMtGPmdiYy0WgZbdrX0pgZ0w-EHflkNDE5eHyVNL679lkEkmr17gG361kopWoWHvwIUT1wE1XT374DKj0B5R_PK8w1SNeYom6H1DkGq2uSgT4Y6DMQ',
  };

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  return (
    <VmsContext.Provider
      value={{
        currentUser,
        currentRole,
        setCurrentRole,
        passes,
        sites,
        auditLogs,
        notifications,
        unreadNotificationCount,
        markNotificationsAsRead,
        clearNotifications,
        toastMessage,
        showToast,
        addPassRequest,
        approvePass,
        rejectPass,
        checkInVisitor,
        checkOutVisitor,
        addSite,
        liveLobbyAlert,
        dismissLiveLobbyAlert,
        resetDemoData,
      }}
    >
      {children}
    </VmsContext.Provider>
  );
};

export const useVms = () => {
  const context = useContext(VmsContext);
  if (!context) {
    throw new Error('useVms must be used within a VmsProvider');
  }
  return context;
};
