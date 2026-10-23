// Preset reasons workers tap instead of typing. Labels live in i18n.jsx as `reason.<code>`.

export const REASON_ICONS = {
  material_short: '📦',
  machine_busy: '⚙️',
  workers_short: '👷',
  spec_unclear: '❓',
  machine_down: '🔧',
  power_cut: '⚡',
  will_be_late: '⏰',
  wrong_size: '📏',
  finish_bad: '✨',
  wrong_colour: '🎨',
  damaged: '💥',
  qty_short: '🔢',
  want_changes: '✏️',
  other: '💬',
};

// Built-in reason lists. The administrator can switch reasons off per list and add their own on the Customize
// page; `setReasonLists()` applies that, and `REASONS` is a live binding every picker reads.
export const DEFAULT_REASONS = {
  hold: ['material_short', 'machine_busy', 'workers_short', 'spec_unclear', 'other'],
  problem: ['machine_down', 'material_short', 'power_cut', 'workers_short', 'spec_unclear', 'will_be_late', 'other'],
  qcFail: ['wrong_size', 'finish_bad', 'wrong_colour', 'damaged', 'qty_short', 'other'],
  concern: ['wrong_colour', 'wrong_size', 'damaged', 'qty_short', 'want_changes', 'other'],
  delay: ['material_short', 'machine_down', 'workers_short', 'power_cut', 'spec_unclear', 'want_changes', 'other'],
};

// Quick choices for "delayed by how many days".
export const DELAY_DAYS = [3, 7, 15, 30];

// Ready-made chat replies, stored as codes so each reader sees them in their own language.
export const QUICK_REPLIES = ['ok', 'call_me', 'when_ready', 'checking', 'done'];

// One picture per stage for the worker screens.
export const STAGE_ICONS = {
  PENDING_REVIEW: '📥',
  ON_HOLD: '⏸️',
  ACCEPTED: '✅',
  IN_PRODUCTION: '🔨',
  PACKAGING: '📦',
  READY_TO_DISPATCH: '🔍',
  QC_APPROVED: '📞',
  CLIENT_APPROVED: '🚚',
  DISPATCHED: '🛣️',
  DELIVERED: '🏁',
};

/** What each reason list is for (Customize page). */
export const REASON_GROUPS = {
  hold: 'Putting an order on hold',
  problem: 'Reporting a problem',
  qcFail: 'QC failure',
  concern: "Customer's concern",
  delay: 'Reporting a delay',
};

export let REASONS = DEFAULT_REASONS;
let customLabels = {};

/** Applies the admin's lists: `{ reasons: { group: [codes] }, customReasons: { code: label } }`. */
export function setReasonLists(lists) {
  REASONS = { ...DEFAULT_REASONS, ...(lists?.reasons ?? {}) };
  customLabels = lists?.customReasons ?? {};
}

/** Name of a reason the admin added (built-in reasons are translated in i18n.jsx). */
export const customReasonLabel = (code) => customLabels[code] ?? null;

export const reasonIcon = (code) => REASON_ICONS[code] ?? '🏷️';
