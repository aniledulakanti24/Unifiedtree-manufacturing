import { can, rolesFor } from '../auth/permissions';
import { featureOn } from '../auth/features';
import { daysUntil } from '../utils';

// The order journey is set by the administrator on Customize → Stages: an ordered list of steps between
// "order received" and "ready to dispatch". Each step is one of three kinds:
//   work     – someone moves the order on when done (cutting, welding, packing…)
//   qc       – QC inspects; pass moves on, fail sends the order back to production
//   customer – the customer approves; a concern sends the order back to production
// The QC step always uses the status READY_TO_DISPATCH and the customer step QC_APPROVED (existing records keep
// working), but either can sit anywhere in the list. "Order received", "Ready to dispatch" and "Sent" are always
// there; "Delivered" is optional. `setWorkflow()` rebuilds everything below; the exports are live bindings.

const FIXED_STATUS = {
  PENDING_REVIEW: { label: 'Pending Factory Review', tone: 'amber' },
  ON_HOLD: { label: 'On Hold', tone: 'red' },
  CLIENT_APPROVED: { label: 'Cleared for Dispatch', tone: 'green' },
  DISPATCHED: { label: 'Dispatched', tone: 'green' },
  DELIVERED: { label: 'Delivered', tone: 'gray' },
};

export const QC_STEP = 'READY_TO_DISPATCH';
export const CUSTOMER_STEP = 'QC_APPROVED';
export const STEP_KINDS = {
  work: { label: 'Work step', perm: 'production.update' },
  qc: { label: 'Quality check', perm: 'qc.inspect' },
  customer: { label: 'Customer approval', perm: 'client.approve' },
};

/** Built-in step names (English). A step keeps its translation until the admin gives it another name. */
export const DEFAULT_NAMES = {
  PENDING_REVIEW: 'Order received',
  ACCEPTED: 'Accepted',
  IN_PRODUCTION: 'Making',
  PACKAGING: 'Packing',
  READY_TO_DISPATCH: 'Quality check',
  QC_APPROVED: 'Customer approval',
  CLIENT_APPROVED: 'Ready to dispatch',
  DISPATCHED: 'Sent',
  DELIVERED: 'Delivered',
};

/** The journey a new company starts with. */
export const DEFAULT_JOURNEY = [
  { key: 'ACCEPTED', kind: 'work', name: 'Accepted' },
  { key: 'IN_PRODUCTION', kind: 'work', name: 'Making' },
  { key: 'PACKAGING', kind: 'work', name: 'Packing' },
  { key: QC_STEP, kind: 'qc', name: 'Quality check' },
  { key: CUSTOMER_STEP, kind: 'customer', name: 'Customer approval' },
];
export const DEFAULT_WORKFLOW = { journey: DEFAULT_JOURNEY, removed: [], names: {} };

/** Steps orders can be waiting at: such a step cannot be removed while work orders are still there. */
export const ordersAt = (orders, key) => orders.filter((o) => o.status === key).length;

const WORK_TONES = ['blue', 'indigo', 'violet', 'cyan'];

export let STATUS = {};
export let FLOW = [];
/** step → the step after it. */
export let NEXT_STAGE = {};
/** Every step of the admin's journey, in order (the production board's columns). */
export let JOURNEY_STATUSES = [];
/** The work steps only ("in production"). */
export let PRODUCTION_STATUSES = [];
/** Steps that can require a sign-off before the order moves on (the admin picks which). */
export let APPROVAL_STAGES = [];
export let STATUS_GROUPS = [];
export let ORDER_FILTERS = [];
let journey = DEFAULT_JOURNEY;
let custom = {}; // status key → name the admin gave it (shown instead of the translation)
let STAGE_OWNER = {};
let ACTION_BY_STATUS = {};

/** The journey stored before steps could be reordered: production stages plus on/off switches. */
function legacyJourney(wf) {
  return [
    ...(featureOn('acceptedStep') ? [{ key: 'ACCEPTED', kind: 'work', name: wf.names?.ACCEPTED || 'Accepted' }] : []),
    ...(wf.stages ?? []).map((s) => ({ ...s, kind: 'work' })),
    ...(featureOn('qc') ? [{ key: QC_STEP, kind: 'qc', name: wf.names?.[QC_STEP] || DEFAULT_NAMES[QC_STEP] }] : []),
    ...(featureOn('clientApproval') ? [{ key: CUSTOMER_STEP, kind: 'customer', name: wf.names?.[CUSTOMER_STEP] || DEFAULT_NAMES[CUSTOMER_STEP] }] : []),
  ];
}

/** The admin's journey (list of { key, kind, name }), whichever way it was saved. */
export function journeyOf(workflow) {
  if (workflow?.journey?.length) return workflow.journey;
  if (workflow?.stages?.length) return legacyJourney(workflow);
  return DEFAULT_JOURNEY;
}

/** Where an order goes when the factory accepts it: the first step of the journey. */
export const acceptStatus = () => journey[0]?.key ?? 'CLIENT_APPROVED';
/** Where QC rejects and customer concerns send an order back to: the first real production step. */
export const reworkStage = () => {
  const work = journey.filter((s) => s.kind === 'work');
  return (work.find((s) => s.key !== 'ACCEPTED') ?? work[0])?.key ?? acceptStatus();
};
/** True for a work step, including one the admin has since removed (old history still uses it). */
export const isProductionStage = (status) => Boolean(STATUS[status]?.production);
export const kindOf = (status) => journey.find((s) => s.key === status)?.kind ?? null;
/** True once the order has passed the last work step (made, whatever checks are left). */
export const afterLastWork = (status) => {
  const keys = FLOW.map((f) => f.key);
  const lastWork = Math.max(...PRODUCTION_STATUSES.map((k) => keys.indexOf(k)));
  return keys.indexOf(status) > lastWork;
};

/** Rebuilds the life-cycle from the admin's journey and the delivery switch. */
export function setWorkflow(workflow) {
  const wf = workflow ?? DEFAULT_WORKFLOW;
  journey = journeyOf(wf);
  const delivery = featureOn('delivery');
  const keys = journey.map((s) => s.key);
  const prevOf = (k) => (k === keys[0] ? 'PENDING_REVIEW' : keys[keys.indexOf(k) - 1]);

  // Names the admin chose: journey steps carry their own, the fixed steps are in `names`.
  custom = {};
  [...(wf.removed ?? []), ...journey].forEach((s) => {
    if (s.name?.trim() && s.name.trim() !== DEFAULT_NAMES[s.key]) custom[s.key] = s.name.trim();
  });
  Object.entries(wf.names ?? {}).forEach(([k, n]) => n?.trim() && n.trim() !== DEFAULT_NAMES[k] && (custom[k] = n.trim()));

  STATUS = { ...FIXED_STATUS };
  (wf.removed ?? []).forEach((s) => (STATUS[s.key] = { label: s.name, tone: 'gray', production: s.kind !== 'qc' && s.kind !== 'customer', removed: true }));
  let w = 0;
  journey.forEach((s) => {
    const label = s.name?.trim() || DEFAULT_NAMES[s.key] || s.key;
    if (s.kind === 'qc') STATUS[s.key] = { label: `${label} · QC Pending`, tone: 'cyan', kind: 'qc' };
    else if (s.kind === 'customer') STATUS[s.key] = { label: `${label} · Awaiting Customer`, tone: 'teal', kind: 'customer' };
    else STATUS[s.key] = { label, tone: WORK_TONES[w++ % WORK_TONES.length], production: true, kind: 'work' };
  });
  ['PENDING_REVIEW', 'CLIENT_APPROVED', 'DISPATCHED', 'DELIVERED'].forEach((k) => custom[k] && (STATUS[k] = { ...STATUS[k], label: custom[k] }));

  FLOW = ['PENDING_REVIEW', ...keys, 'CLIENT_APPROVED', 'DISPATCHED', ...(delivery ? ['DELIVERED'] : [])].map((key) => ({ key }));
  NEXT_STAGE = Object.fromEntries(keys.map((k, i) => [k, keys[i + 1] ?? 'CLIENT_APPROVED']));
  JOURNEY_STATUSES = keys;
  PRODUCTION_STATUSES = journey.filter((s) => s.kind === 'work').map((s) => s.key);
  APPROVAL_STAGES = [...keys, 'CLIENT_APPROVED'];

  // Who completed each step (and fixes it if its sign-off is rejected): whoever acts on the step before it.
  const actor = (k) => (k === 'PENDING_REVIEW' ? 'orders.review' : STEP_KINDS[kindOf(k)]?.perm ?? 'production.update');
  STAGE_OWNER = Object.fromEntries([...keys, 'CLIENT_APPROVED'].map((k) => [k, actor(k === 'CLIENT_APPROVED' ? keys.at(-1) ?? 'PENDING_REVIEW' : prevOf(k))]));

  const name = (k) => STATUS[k].label.split(' · ')[0].toLowerCase();
  ACTION_BY_STATUS = {
    PENDING_REVIEW: ['orders.review', 'Check raw materials and accept / hold'],
    ON_HOLD: ['orders.review', 'Re-check materials for held order'],
    ...Object.fromEntries(
      journey.map((s) => {
        const next = NEXT_STAGE[s.key];
        if (s.kind === 'qc') return [s.key, ['qc.inspect', 'Perform QC inspection']];
        if (s.kind === 'customer')
          return [s.key, ['client.approve', kindOf(prevOf(s.key)) === 'qc' ? 'Share QC report & get client approval' : 'Get customer approval']];
        const text = next === 'CLIENT_APPROVED' ? 'Mark ready to dispatch' : s.key === 'ACCEPTED' ? `Start ${name(next)}` : `Move to ${name(next)}`;
        return [s.key, ['production.update', text]];
      }),
    ),
    CLIENT_APPROVED: ['dispatch.manage', 'Assign vehicle & tracking ID'],
    ...(delivery ? { DISPATCHED: ['delivery.confirm', 'Confirm delivery'] } : {}),
  };

  // Status filters used by dashboard tiles and the orders page.
  const checks = journey.filter((s) => s.kind !== 'work').map((s) => s.key);
  const checkLabel = checks.length === 2 ? 'QC & Client Approval' : checks[0] === QC_STEP ? 'Quality Check' : checks.length ? 'Customer Approval' : null;
  STATUS_GROUPS = [
    { key: 'review', label: 'Pending / On Hold', statuses: ['PENDING_REVIEW', 'ON_HOLD'], tone: 'amber', icon: 'factory' },
    { key: 'production', label: 'In Production', statuses: PRODUCTION_STATUSES, tone: 'indigo', icon: 'layers' },
    ...(checkLabel ? [{ key: 'qc', label: checkLabel, statuses: checks, tone: 'teal', icon: 'shield' }] : []),
    { key: 'ready', label: 'Ready to Ship', statuses: ['CLIENT_APPROVED'], tone: 'green', icon: 'truck' },
    { key: 'shipped', label: delivery ? 'Dispatched / Delivered' : 'Dispatched', statuses: ['DISPATCHED', 'DELIVERED'], tone: 'gray', icon: 'checkCircle' },
  ];
  // Every filter as a test function: the status groups plus delayed orders and stages waiting for approval.
  ORDER_FILTERS = [
    ...STATUS_GROUPS.map((g) => ({ ...g, test: (o) => g.statuses.includes(o.status) })),
    { key: 'delayed', label: 'Delayed', tone: 'red', icon: 'alert', test: isDelayed },
    ...(featureOn('stageApprovals')
      ? [{ key: 'approval', label: 'Awaiting Approval', tone: 'violet', icon: 'lock', test: (o) => Boolean(openApproval(o)) }]
      : []),
  ];
}

/**
 * Name the admin gave a step, used instead of the built-in translation (`status.<key>` / `flow.<key>`).
 * Also words the QC / customer / dispatch steps to fit where the admin placed them.
 */
export function stageText(kind, key) {
  if (custom[key]) return custom[key];
  if (kind !== 'status') return null;
  const keys = JOURNEY_STATUSES;
  if (key === QC_STEP && keys.at(-1) !== QC_STEP && NEXT_STAGE[QC_STEP] !== CUSTOMER_STEP) return 'Waiting for QC';
  if (key === CUSTOMER_STEP && kindOf(keys[keys.indexOf(CUSTOMER_STEP) - 1]) !== 'qc') return 'Ask customer to approve';
  if (key === 'CLIENT_APPROVED' && keys.at(-1) !== CUSTOMER_STEP) return 'Ready – send it';
  return null;
}

export const stepIndex = (status) => {
  if (status === 'ON_HOLD') return 0;
  const i = FLOW.findIndex((f) => f.key === status);
  return i >= 0 ? i : 1; // a step the admin removed since: show it as early production
};

export const stageOwnerPerm = (status) => STAGE_OWNER[status] ?? 'production.update';

/** The approval record for the order's current stage, if that stage still needs a sign-off. */
export function openApproval(order) {
  const a = order.approval;
  return featureOn('stageApprovals') && a && a.status === order.status && a.state !== 'approved' ? a : null;
}

/** True if this user may sign off the current stage (no one approves their own work, except the admin). */
export function canApprove(user, order) {
  const a = openApproval(order);
  return Boolean(a && a.state === 'pending' && can(user.role, 'stage.approve') && (user.role === 'admin' || a.requestedById !== user.id));
}

function entryFor(order) {
  const a = openApproval(order);
  if (a?.state === 'pending') return ['stage.approve', `Approve stage: ${STATUS[order.status]?.label.split(' · ')[0] ?? order.status}`];
  if (a?.state === 'rejected') return [stageOwnerPerm(order.status), 'Approval rejected – fix & resubmit'];
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

/** Sales (own orders) and the admin can change a work order's details until it is dispatched. */
export const canEditOrder = (user, o) =>
  Boolean(user && isOpen(o) && can(user.role, 'orders.edit') && (can(user.role, 'orders.viewAll') || o.createdBy === user.id));

/** Nothing left to do: delivered, or dispatched when the admin left out delivery confirmation. */
export const isComplete = (status) => status === 'DELIVERED' || (status === 'DISPATCHED' && !featureOn('delivery'));
/** Not yet dispatched – still in the factory's hands. */
export const isOpen = (o) => !['DISPATCHED', 'DELIVERED'].includes(o.status);
/** Not yet sent, and either past the delivery date or pushed back by a reported delay. */
export const isDelayed = (o) => isOpen(o) && (daysUntil(o.expectedDeliveryDate) < 0 || (o.delays?.length ?? 0) > 0);

setWorkflow(DEFAULT_WORKFLOW);

/**
 * Every QC inspection on an order: the moment it left the QC step (passed on, or sent back). Works for all records,
 * whatever note was written. Returns [{ ...historyEntry, pass }].
 */
export function qcInspections(order) {
  const steps = order.history.filter((h) => !h.approval && !h.delay && !h.edit);
  return steps
    .map((h, i) => ({ h, prev: steps[i - 1] }))
    .filter(({ h, prev }) => prev?.status === QC_STEP && h.status !== QC_STEP)
    .map(({ h }) => ({ ...h, pass: !/^QC failed/.test(h.note ?? '') && !isProductionStage(h.status) }));
}
