// Modules the administrator can switch on or off for the whole company (Customize page).
// Switching a module off hides its screens, menu items and buttons for every role: each module lists
// the permissions it owns, and `can()` refuses those while the module is off.

export const FEATURES = [
  { key: 'customers', label: 'Customers', desc: 'Customer list and per-customer summaries', perms: ['customers.view'] },
  { key: 'reports', label: 'Reports', desc: 'Production reports with date filters', perms: ['reports.view'] },
  { key: 'machines', label: 'Machines', desc: 'Machine capacity, breakdowns and maintenance', perms: ['machines.view', 'machines.manage'] },
  { key: 'purchasing', label: 'Purchasing', desc: 'Supplier purchase orders, shipments and receipts', perms: ['purchase.view', 'purchase.manage'] },
  { key: 'scan', label: 'Scan', desc: 'QR scanning of batch labels and job cards', perms: ['scan.use'] },
  // Steps of the order journey, set in the stage editor (Customize → Stages), not on the Modules tab. QC and
  // customer approval are on while the journey has those steps.
  { key: 'review', label: 'Factory review', desc: 'Factory checks raw material before accepting. When off, orders with material in stock are accepted automatically', stage: true },
  { key: 'qc', label: 'Quality check stage', desc: 'QC inspection after production', perms: ['qc.inspect'], stage: true },
  { key: 'clientApproval', label: 'Customer approval stage', desc: 'Customer OKs the QC report before dispatch', perms: ['client.approve'], stage: true },
  { key: 'delivery', label: 'Delivery confirmation', desc: 'Someone confirms the goods arrived. When off, an order is complete once dispatched', perms: ['delivery.confirm'], stage: true },
  { key: 'stageApprovals', label: 'Stage sign-off', desc: 'A supervisor approves each chosen stage', perms: ['stage.approve'] },
  { key: 'delays', label: 'Delay reporting', desc: 'Push the delivery date with a reason', perms: ['orders.delay'] },
  { key: 'shopFloor', label: 'Shop floor', desc: 'Job work, labour time and scrap on each work order' },
  { key: 'problems', label: 'Report a problem', desc: 'Raise a problem on a work order' },
  { key: 'chat', label: 'Work order chat', desc: 'Messages between teams on a work order' },
  { key: 'whatsapp', label: 'WhatsApp updates', desc: 'Tap-to-send customer updates' },
  { key: 'customerView', label: 'Customer tracking page', desc: 'A no-login page the customer can open' },
  { key: 'ask', label: 'Ask', desc: 'Question box in the top bar', perms: ['ask.use'] },
];

// Always on – the rest of the app is built on these.
export const CORE_MODULES = ['My work', 'Dashboard', 'Work orders', 'Factory review', 'Production', 'Dispatch', 'Raw materials', 'Setup', 'Roles & access'];

let off = new Set();

/** Applies the administrator's module switches ({ key: false } turns a module off). */
export function setFeatures(next) {
  off = new Set(Object.entries(next ?? {}).filter(([, on]) => on === false).map(([k]) => k));
}

export const featureOn = (key) => !off.has(key);

/** True if the permission belongs to a module that is switched off. */
export const permOff = (permission) => FEATURES.some((f) => off.has(f.key) && f.perms?.includes(permission));
