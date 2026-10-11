/**
 * VMS Data Models & JSDoc Type Definitions
 * @module types/vms
 */

/**
 * @typedef {'super-admin' | 'site-admin' | 'host' | 'receptionist'} UserRole
 * @typedef {'Pending Review' | 'Approved' | 'Checked In' | 'Checked Out' | 'Rejected' | 'Restricted'} PassStatus
 * @typedef {'Customer' | 'Vendor' | 'Interview' | 'VIP' | 'Contractor' | 'Auditor'} VisitorCategory
 */

export const USER_ROLES = {
  SUPER_ADMIN: 'super-admin',
  SITE_ADMIN: 'site-admin',
  HOST: 'host',
  RECEPTIONIST: 'receptionist',
};

export const PASS_STATUS = {
  PENDING: 'Pending Review',
  APPROVED: 'Approved',
  CHECKED_IN: 'Checked In',
  CHECKED_OUT: 'Checked Out',
  REJECTED: 'Rejected',
  RESTRICTED: 'Restricted',
};
