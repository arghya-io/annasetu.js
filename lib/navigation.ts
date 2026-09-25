import type { AppRole } from '@/types/database';

export interface NavItem {
  href: string;
  label: string;
}

export const NAV_BY_ROLE: Record<AppRole, NavItem[]> = {
  farmer: [
    { href: '/farmer/dashboard', label: 'Dashboard' },
    { href: '/farmer/annasathi', label: 'AnnaSathi' },
    { href: '/farmer/book', label: 'Book' },
    { href: '/farmer/bookings', label: 'Bookings' },
    { href: '/farmer/queue', label: 'Queue' },
    { href: '/farmer/crops', label: 'Crops' },
    { href: '/farmer/documents', label: 'Documents' },
    { href: '/farmer/help', label: 'Help' },
  ],
  centre_operator: [
    { href: '/operator/dashboard', label: 'Queue' },
    { href: '/operator/scan', label: 'Scan QR' },
  ],
  government_admin: [
    { href: '/gov-admin/dashboard', label: 'Dashboard' },
    { href: '/gov-admin/farmer-verification', label: 'Verification' },
    { href: '/gov-admin/crop-change-requests', label: 'Crop changes' },
    { href: '/gov-admin/centres', label: 'Centres' },
    { href: '/gov-admin/operators', label: 'Operators' },
    { href: '/gov-admin/csc-management', label: 'CSC' },
    { href: '/gov-admin/account-provisioning', label: 'Provisioning' },
    { href: '/gov-admin/audit-logs', label: 'Audit' },
  ],
  csc_operator: [
    { href: '/csc/dashboard', label: 'Dashboard' },
    { href: '/csc/help-requests', label: 'Help requests' },
    { href: '/csc/csc-locator', label: 'CSC locator' },
  ],
};

export const ROLE_LABEL: Record<AppRole, string> = {
  farmer: 'Farmer',
  centre_operator: 'Centre Operator',
  government_admin: 'Government Admin',
  csc_operator: 'CSC Operator',
};

export const DASHBOARD_BY_ROLE: Record<AppRole, string> = {
  farmer: '/farmer/dashboard',
  centre_operator: '/operator/dashboard',
  government_admin: '/gov-admin/dashboard',
  csc_operator: '/csc/dashboard',
};
