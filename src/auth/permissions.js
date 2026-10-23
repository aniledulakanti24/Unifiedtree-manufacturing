// Role-Based Access Control (RBAC) definitions.
// Every screen and every action in the app checks a permission from this file.
// The administrator can change which role has which permission on the Roles & Access page;
// those changes are kept in the store and applied here through setAccessOverrides().
// Modules the administrator switches off (features.js) take their permissions away from every role.

import { permOff } from './features';

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
  'orders.edit': { label: 'Edit work order details until it is dispatched', roles: ['admin', 'sales'] },
  'orders.review': { label: 'Accept / hold order (material check)', roles: ['admin', 'factory'] },
  'production.view': { label: 'View production board', roles: ['admin', 'sales', 'factory', 'supervisor', 'qc'] },
  'production.update': { label: 'Update production stages', roles: ['admin', 'factory'] },
  'stage.approve': { label: 'Approve each stage', roles: ['admin', 'supervisor'] },
  'qc.inspect': { label: 'Perform QC inspection', roles: ['admin', 'qc'] },
  'client.approve': { label: 'Share QC report & record client approval', roles: ['admin', 'sales'] },
  'dispatch.view': { label: 'See dispatches: ready to ship, on the way, delivered', roles: ['admin', 'sales', 'factory', 'supervisor'] },
  'dispatch.manage': { label: 'Assign vehicle / courier & tracking ID', roles: ['admin', 'factory'] },
  'delivery.confirm': { label: 'Confirm delivery', roles: ['admin', 'sales', 'factory'] },
  'customers.view': { label: 'View customer summaries (orders, progress, materials)', roles: ['admin', 'sales', 'factory', 'supervisor'] },
  'reports.view': { label: 'View production reports (today, month, financial year…)', roles: ['admin', 'sales', 'factory', 'supervisor', 'qc'] },
  'orders.delay': { label: 'Report a delay (push the delivery date)', roles: ['admin', 'factory', 'supervisor'] },
  'purchase.view': { label: 'View supplier purchase orders', roles: ['admin', 'factory', 'supervisor'] },
  'purchase.manage': { label: 'Raise / receive supplier purchase orders', roles: ['admin', 'factory'] },
  'machines.view': { label: 'View machines, capacity & maintenance', roles: ['admin', 'factory', 'supervisor'] },
  'machines.manage': { label: 'Mark machines down / record maintenance', roles: ['admin', 'factory', 'supervisor'] },
  'plants.manage': { label: 'Move work orders between factories', roles: ['admin', 'factory'] },
  'setup.manage': { label: 'Set up products, machines, suppliers, job workers, factories & calendar', roles: ['admin', 'factory'] },
  'inventory.view': { label: 'View raw material inventory', roles: ['admin', 'sales', 'factory', 'supervisor'] },
  'inventory.manage': { label: 'Restock / add raw materials', roles: ['admin', 'factory'] },
  'scan.use': { label: 'Scan batch labels & job cards', roles: ['admin', 'factory', 'supervisor', 'qc'] },
  'ask.use': { label: 'Ask questions (question box)', roles: ['admin', 'sales', 'factory', 'supervisor', 'qc'] },
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
  return Boolean(role && PERMISSIONS[permission] && !permOff(permission) && rolesFor(permission).includes(role));
}
