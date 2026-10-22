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

export const REASONS = {
  hold: ['material_short', 'machine_busy', 'workers_short', 'spec_unclear', 'other'],
  problem: ['machine_down', 'material_short', 'power_cut', 'workers_short', 'spec_unclear', 'will_be_late', 'other'],
  qcFail: ['wrong_size', 'finish_bad', 'wrong_colour', 'damaged', 'qty_short', 'other'],
  concern: ['wrong_colour', 'wrong_size', 'damaged', 'qty_short', 'want_changes', 'other'],
};

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
