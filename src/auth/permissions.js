// Role-Based Access Control (RBAC) definitions.
// Every screen and every action in the app checks a permission from this file.

export const ROLES = {
  admin: { label: 'Administrator', tone: 'violet' },
  sales: { label: 'Sales Executive', tone: 'blue' },
  factory: { label: 'Factory Manager', tone: 'amber' },
  qc: { label: 'QC Inspector', tone: 'teal' },
};

export const PERMISSIONS = {
  'dashboard.view': { label: 'View dashboard', roles: ['admin', 'sales', 'factory', 'qc'] },
  'work.view': { label: 'Simple "My work" screen for the shop floor', roles: ['admin', 'factory', 'qc'] },
  'orders.view': { label: 'View purchase orders', roles: ['admin', 'sales', 'factory', 'qc'] },
  'orders.viewAll': { label: 'View orders of all sales persons', roles: ['admin', 'factory', 'qc'] },
  'orders.create': { label: 'Enter customer PO', roles: ['admin', 'sales'] },
  'orders.review': { label: 'Accept / hold order (material check)', roles: ['admin', 'factory'] },
  'production.update': { label: 'Update production stages', roles: ['admin', 'factory'] },
  'qc.inspect': { label: 'Perform QC inspection', roles: ['admin', 'qc'] },
  'client.approve': { label: 'Share QC report & record client approval', roles: ['admin', 'sales'] },
  'dispatch.manage': { label: 'Assign vehicle / courier & tracking ID', roles: ['admin', 'factory'] },
  'delivery.confirm': { label: 'Confirm delivery', roles: ['admin', 'sales', 'factory'] },
  'inventory.view': { label: 'View raw material inventory', roles: ['admin', 'sales', 'factory'] },
  'inventory.manage': { label: 'Restock / add raw materials', roles: ['admin', 'factory'] },
  'access.view': { label: 'View roles & access matrix', roles: ['admin'] },
};

export function can(role, permission) {
  return Boolean(role && PERMISSIONS[permission]?.roles.includes(role));
}
