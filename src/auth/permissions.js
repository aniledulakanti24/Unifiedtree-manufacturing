// Role-Based Access Control (RBAC) definitions.
// Every screen and every action in the app checks a permission from this file.
// The administrator can change which role has which permission on the Roles & Access page;
// those changes are kept in the store and applied here through setAccessOverrides().

export const ROLES = {
  admin: { label: 'Administrator', tone: 'violet' },
  sales: { label: 'Sales Executive', tone: 'blue' },
  factory: { label: 'Factory Manager', tone: 'amber' },
  supervisor: { label: 'Production Supervisor', tone: 'indigo' },
  qc: { label: 'QC Inspector', tone: 'teal' },
};

export const PERMISSIONS = {
  'dashboard.view': { label: 'View dashboard', roles: ['admin', 'sales', 'factory', 'supervisor', 'qc'] },
  'work.view': { label: '"My work" screen', roles: ['admin', 'sales', 'factory', 'supervisor', 'qc'] },
  'orders.view': { label: 'View work orders', roles: ['admin', 'sales', 'factory', 'supervisor', 'qc'] },
  'orders.viewAll': { label: 'View work orders of all sales persons', roles: ['admin', 'factory', 'supervisor', 'qc'] },
  'orders.create': { label: 'Create work order (customer PO & PI)', roles: ['admin', 'sales'] },
  'orders.review': { label: 'Accept / hold order (material check)', roles: ['admin', 'factory'] },
  'production.view': { label: 'View production board', roles: ['admin', 'sales', 'factory', 'supervisor', 'qc'] },
  'production.update': { label: 'Update production stages', roles: ['admin', 'factory'] },
  'stage.approve': { label: 'Approve each stage', roles: ['admin', 'supervisor'] },
  'qc.inspect': { label: 'Perform QC inspection', roles: ['admin', 'qc'] },
  'client.approve': { label: 'Share QC report & record client approval', roles: ['admin', 'sales'] },
  'dispatch.manage': { label: 'Assign vehicle / courier & tracking ID', roles: ['admin', 'factory'] },
  'delivery.confirm': { label: 'Confirm delivery', roles: ['admin', 'sales', 'factory'] },
  'inventory.view': { label: 'View raw material inventory', roles: ['admin', 'sales', 'factory', 'supervisor'] },
  'inventory.manage': { label: 'Restock / add raw materials', roles: ['admin', 'factory'] },
  'access.view': { label: 'Manage roles, access & section names', roles: ['admin'] },
};

let overrides = {};

/** Applies the administrator's access changes ({ permission: [roles] }). */
export function setAccessOverrides(next) {
  overrides = next ?? {};
}

/** Roles that currently hold a permission. The administrator always holds every permission. */
export function rolesFor(permission) {
  const roles = overrides[permission] ?? PERMISSIONS[permission]?.roles ?? [];
  return roles.includes('admin') ? roles : ['admin', ...roles];
}

export function can(role, permission) {
  return Boolean(role && PERMISSIONS[permission] && rolesFor(permission).includes(role));
}
