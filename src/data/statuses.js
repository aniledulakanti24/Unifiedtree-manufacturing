import { can, PERMISSIONS } from '../auth/permissions';

export const STATUS = {
  PENDING_REVIEW: { label: 'Pending Factory Review', tone: 'amber' },
  ON_HOLD: { label: 'On Hold', tone: 'red' },
  ACCEPTED: { label: 'Accepted', tone: 'blue' },
  IN_PRODUCTION: { label: 'Under Production', tone: 'indigo' },
  PACKAGING: { label: 'Packaging', tone: 'violet' },
  READY_TO_DISPATCH: { label: 'Ready to Dispatch · QC Pending', tone: 'cyan' },
  QC_APPROVED: { label: 'QC Approved · Awaiting Client', tone: 'teal' },
  CLIENT_APPROVED: { label: 'Cleared for Dispatch', tone: 'green' },
  DISPATCHED: { label: 'Dispatched', tone: 'green' },
  DELIVERED: { label: 'Delivered', tone: 'gray' },
};

// The order life-cycle shown in the stage tracker.
export const FLOW = [
  { key: 'PENDING_REVIEW', label: 'PO Received' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'IN_PRODUCTION', label: 'Under Production' },
  { key: 'PACKAGING', label: 'Packaging' },
  { key: 'READY_TO_DISPATCH', label: 'Ready to Dispatch' },
  { key: 'QC_APPROVED', label: 'QC Approved' },
  { key: 'CLIENT_APPROVED', label: 'Client Approved' },
  { key: 'DISPATCHED', label: 'Dispatched' },
  { key: 'DELIVERED', label: 'Delivered' },
];

export const stepIndex = (status) =>
  status === 'ON_HOLD' ? 0 : FLOW.findIndex((f) => f.key === status);

// Production stages the factory moves an accepted order through.
export const NEXT_STAGE = {
  ACCEPTED: 'IN_PRODUCTION',
  IN_PRODUCTION: 'PACKAGING',
  PACKAGING: 'READY_TO_DISPATCH',
};

const ACTION_BY_STATUS = {
  PENDING_REVIEW: ['orders.review', 'Check raw materials and accept / hold'],
  ON_HOLD: ['orders.review', 'Re-check materials for held order'],
  ACCEPTED: ['production.update', 'Start production'],
  IN_PRODUCTION: ['production.update', 'Move to packaging'],
  PACKAGING: ['production.update', 'Mark ready to dispatch'],
  READY_TO_DISPATCH: ['qc.inspect', 'Perform QC inspection'],
  QC_APPROVED: ['client.approve', 'Share QC report & get client approval'],
  CLIENT_APPROVED: ['dispatch.manage', 'Assign vehicle & tracking ID'],
  DISPATCHED: ['delivery.confirm', 'Confirm delivery'],
};

/** Returns the pending action text if the given role is responsible for the order's next step. */
export function pendingActionFor(role, order) {
  const entry = ACTION_BY_STATUS[order.status];
  return entry && can(role, entry[0]) ? entry[1] : null;
}

/** The order's next step and which roles (other than admin) can do it. */
export function nextStep(order) {
  const entry = ACTION_BY_STATUS[order.status];
  if (!entry) return null;
  return { text: entry[1], roles: PERMISSIONS[entry[0]].roles.filter((r) => r !== 'admin') };
}

// Status filters used by dashboard tiles and the orders page.
export const STATUS_GROUPS = [
  { key: 'review', label: 'Pending / On Hold', statuses: ['PENDING_REVIEW', 'ON_HOLD'], tone: 'amber', icon: 'factory' },
  { key: 'production', label: 'In Production', statuses: ['ACCEPTED', 'IN_PRODUCTION', 'PACKAGING'], tone: 'indigo', icon: 'layers' },
  { key: 'qc', label: 'QC & Client Approval', statuses: ['READY_TO_DISPATCH', 'QC_APPROVED'], tone: 'teal', icon: 'shield' },
  { key: 'ready', label: 'Ready to Ship', statuses: ['CLIENT_APPROVED'], tone: 'green', icon: 'truck' },
  { key: 'shipped', label: 'Dispatched / Delivered', statuses: ['DISPATCHED', 'DELIVERED'], tone: 'gray', icon: 'checkCircle' },
];
