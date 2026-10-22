import { can, rolesFor } from '../auth/permissions';
import { daysUntil } from '../utils';

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
  { key: 'PENDING_REVIEW', label: 'WO Received' },
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

// Stages that can require a sign-off before the order moves on. The administrator picks which ones
// on the Roles & Access page; all of them are on by default.
export const APPROVAL_STAGES = ['ACCEPTED', 'IN_PRODUCTION', 'PACKAGING', 'READY_TO_DISPATCH', 'QC_APPROVED', 'CLIENT_APPROVED'];

// Who completed each stage (and fixes it if the approval is rejected).
const STAGE_OWNER = {
  ACCEPTED: 'orders.review',
  IN_PRODUCTION: 'production.update',
  PACKAGING: 'production.update',
  READY_TO_DISPATCH: 'production.update',
  QC_APPROVED: 'qc.inspect',
  CLIENT_APPROVED: 'client.approve',
};
export const stageOwnerPerm = (status) => STAGE_OWNER[status];

/** The approval record for the order's current stage, if that stage still needs a sign-off. */
export function openApproval(order) {
  const a = order.approval;
  return a && a.status === order.status && a.state !== 'approved' ? a : null;
}

/** True if this user may sign off the current stage (no one approves their own work, except the admin). */
export function canApprove(user, order) {
  const a = openApproval(order);
  return Boolean(a && a.state === 'pending' && can(user.role, 'stage.approve') && (user.role === 'admin' || a.requestedById !== user.id));
}

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

function entryFor(order) {
  const a = openApproval(order);
  if (a?.state === 'pending') return ['stage.approve', `Approve stage: ${STATUS[order.status].label.split(' · ')[0]}`];
  if (a?.state === 'rejected') return [STAGE_OWNER[order.status], 'Approval rejected – fix & resubmit'];
  return ACTION_BY_STATUS[order.status];
}

/** Returns the pending action text if the given role is responsible for the order's next step. */
export function pendingActionFor(role, order) {
  const entry = entryFor(order);
  return entry && can(role, entry[0]) ? entry[1] : null;
}

/** The order's next step and which roles (other than admin) can do it. */
export function nextStep(order) {
  const entry = entryFor(order);
  if (!entry) return null;
  return { text: entry[1], roles: rolesFor(entry[0]).filter((r) => r !== 'admin'), approval: Boolean(openApproval(order)) };
}

const OPEN = (o) => !['DISPATCHED', 'DELIVERED'].includes(o.status);
/** Past the expected delivery date and not yet sent. */
export const isDelayed = (o) => OPEN(o) && daysUntil(o.expectedDeliveryDate) < 0;

// Status filters used by dashboard tiles and the orders page.
export const STATUS_GROUPS = [
  { key: 'review', label: 'Pending / On Hold', statuses: ['PENDING_REVIEW', 'ON_HOLD'], tone: 'amber', icon: 'factory' },
  { key: 'production', label: 'In Production', statuses: ['ACCEPTED', 'IN_PRODUCTION', 'PACKAGING'], tone: 'indigo', icon: 'layers' },
  { key: 'qc', label: 'QC & Client Approval', statuses: ['READY_TO_DISPATCH', 'QC_APPROVED'], tone: 'teal', icon: 'shield' },
  { key: 'ready', label: 'Ready to Ship', statuses: ['CLIENT_APPROVED'], tone: 'green', icon: 'truck' },
  { key: 'shipped', label: 'Dispatched / Delivered', statuses: ['DISPATCHED', 'DELIVERED'], tone: 'gray', icon: 'checkCircle' },
];

// Every filter as a test function: the status groups plus delayed orders and stages waiting for approval.
export const ORDER_FILTERS = [
  ...STATUS_GROUPS.map((g) => ({ ...g, test: (o) => g.statuses.includes(o.status) })),
  { key: 'delayed', label: 'Delayed', tone: 'red', icon: 'alert', test: isDelayed },
  { key: 'approval', label: 'Awaiting Approval', tone: 'violet', icon: 'lock', test: (o) => Boolean(openApproval(o)) },
];
