// Demo data. Dates are relative to "now" so the demo always looks current.
import { APPROVAL_STAGES, DEFAULT_JOURNEY } from './statuses';
import { DEFAULT_REASONS } from './reasons';

export const USERS = [
  { id: 'u-admin', name: 'Anita Rao', role: 'admin', email: 'admin@unifiedtree.in' },
  { id: 'u-sales1', name: 'Rahul Mehta', role: 'sales', email: 'rahul.sales@unifiedtree.in' },
  { id: 'u-sales2', name: 'Priya Nair', role: 'sales', email: 'priya.sales@unifiedtree.in' },
  { id: 'u-factory', name: 'Suresh Kumar', role: 'factory', email: 'factory@unifiedtree.in' },
  { id: 'u-qc', name: 'Deepa Iyer', role: 'qc', email: 'qc@unifiedtree.in' },
  { id: 'u-sup', name: 'Kiran Patil', role: 'supervisor', email: 'supervisor@unifiedtree.in' },
];

export const VEHICLE_OPTIONS = {
  own: [
    'TN-09-AK-4521 · Tata 407 (3T)',
    'TN-10-BC-7788 · Ashok Leyland Dost (1.5T)',
    'TN-22-CD-1190 · Eicher Pro 2049 (5T)',
  ],
  courier: ['Blue Dart', 'DTDC', 'Delhivery', 'Professional Couriers'],
  transporter: ['VRL Logistics', 'Gati', 'TCI Freight', 'Safexpress'],
};

export const DISPATCH_MODES = {
  own: 'Own Vehicle',
  courier: 'Courier Service',
  transporter: 'Transport / Logistics Partner',
};

export const QC_CHECKS = [
  'Dimensions as per specification',
  'Surface finish / paint',
  'Functional / load test',
  'Quantity verified against PO',
  'Packaging & labelling intact',
];

// `stock` is filled in from the lots below (total across factories).
const RAW_MATERIALS = [
  { id: 'RM-01', name: 'Steel Sheet (CRCA 1.2mm)', unit: 'kg', reorderLevel: 1000 },
  { id: 'RM-02', name: 'Aluminium Rod', unit: 'kg', reorderLevel: 400 },
  { id: 'RM-03', name: 'Plastic Granules (PP)', unit: 'kg', reorderLevel: 300 },
  { id: 'RM-04', name: 'Copper Wire 2.5 sq.mm', unit: 'm', reorderLevel: 1000 },
  { id: 'RM-05', name: 'Powder Coat Paint', unit: 'L', reorderLevel: 60 },
  { id: 'RM-06', name: 'Corrugated Packaging Box', unit: 'pcs', reorderLevel: 150 },
  { id: 'RM-07', name: 'Bolts & Nuts Kit', unit: 'pcs', reorderLevel: 2000 },
];

// Opening stock per factory: [material, factory, quantity, batch number].
const OPENING_LOTS = [
  ['RM-01', 'P1', 3000, 'SST-2609-114'],
  ['RM-01', 'P2', 1200, 'SST-2609-115'],
  ['RM-02', 'P1', 1200, 'SAG-AL-7702'],
  ['RM-03', 'P2', 850, 'PP-26-0931'],
  ['RM-04', 'P2', 1800, 'VW-CU-4410'],
  ['RM-05', 'P1', 25, 'CC-PC-2208'],
  ['RM-05', 'P2', 15, 'CC-PC-2209'],
  ['RM-06', 'P1', 200, 'PKW-1180'],
  ['RM-06', 'P2', 320, 'PKW-1181'],
  ['RM-07', 'P1', 6000, 'SST-BN-5521'],
  ['RM-07', 'P2', 3000, 'SST-BN-5522'],
];

// Bill of materials: raw material required per 1 unit of finished product.
// Route: the processes each unit goes through, with machine hours per unit (used for capacity planning).
const PRODUCTS = [
  {
    id: 'FG-101',
    name: 'Steel Storage Cabinet',
    bom: { 'RM-01': 25, 'RM-05': 1.5, 'RM-07': 40, 'RM-06': 1 },
    route: { cutting: 0.5, welding: 0.4, coating: 0.3, assembly: 0.3, packing: 0.1 },
  },
  {
    id: 'FG-102',
    name: 'Aluminium Ladder 8ft',
    bom: { 'RM-02': 8, 'RM-07': 20, 'RM-06': 1 },
    route: { cutting: 0.2, assembly: 0.3, packing: 0.05 },
  },
  {
    id: 'FG-103',
    name: 'Electrical Distribution Panel',
    bom: { 'RM-01': 12, 'RM-04': 30, 'RM-03': 3, 'RM-07': 30, 'RM-06': 1 },
    route: { cutting: 0.4, coating: 0.2, wiring: 1.0, packing: 0.1 },
  },
  {
    id: 'FG-104',
    name: 'Plastic Storage Bin 50L',
    bom: { 'RM-03': 2, 'RM-06': 1 },
    route: { moulding: 0.05, packing: 0.02 },
  },
];

const day = 86400000;
const ago = (d, h = 0) => new Date(Date.now() - d * day - h * 3600000).toISOString();
const ahead = (d) => new Date(Date.now() + d * day).toISOString().slice(0, 10);

// Production processes. `making` processes run while an order is "Making"; packing runs in "Packing".
export const PROCESSES = {
  cutting: { label: 'Cutting & bending' },
  welding: { label: 'Welding' },
  coating: { label: 'Powder coating' },
  moulding: { label: 'Injection moulding' },
  wiring: { label: 'Wiring' },
  assembly: { label: 'Assembly' },
  packing: { label: 'Packing' },
};

const PLANTS = [
  { id: 'P1', name: 'Hosur Plant', city: 'Hosur, TN' },
  { id: 'P2', name: 'Chennai Plant', city: 'Chennai, TN' },
];

/** A machine (or work station): which process it does, in which plant, and how many hours a day it runs. */
function machine(id, name, plantId, process, hoursPerDay, { lastMaintenance, everyDays = 30, downtime = [] }) {
  return { id, name, plantId, process, hoursPerDay, lastMaintenance, maintenanceEveryDays: everyDays, downtime, maintenanceLog: [] };
}

const MACHINES = [
  machine('M-01', 'Press brake PB-1', 'P1', 'cutting', 8, {
    lastMaintenance: ahead(-20),
    // Matches the "bending machine broken" problem on WO-2026-0001.
    downtime: [{ from: ago(0, 3), to: null, reason: 'Hydraulic leak – mechanic coming tomorrow' }],
  }),
  machine('M-02', 'Welding bay W-1', 'P1', 'welding', 8, { lastMaintenance: ahead(-12), downtime: [{ from: ago(9), to: ago(8, 20), reason: 'Power cut' }] }),
  machine('M-03', 'Powder coat line PC-1', 'P1', 'coating', 8, { lastMaintenance: ahead(-32) }),
  machine('M-04', 'Assembly line A-1', 'P1', 'assembly', 16, { lastMaintenance: ahead(-5), everyDays: 60 }),
  machine('M-05', 'Packing station P-1', 'P1', 'packing', 8, { lastMaintenance: ahead(-40), everyDays: 90 }),
  machine('M-06', 'Press brake PB-2', 'P2', 'cutting', 8, { lastMaintenance: ahead(-27) }),
  machine('M-07', 'Welding bay W-2', 'P2', 'welding', 8, { lastMaintenance: ahead(-10) }),
  machine('M-08', 'Powder coat line PC-2', 'P2', 'coating', 8, { lastMaintenance: ahead(-15) }),
  machine('M-09', 'Injection moulding IM-1', 'P2', 'moulding', 16, { lastMaintenance: ahead(-8), downtime: [{ from: ago(4), to: ago(3, 18), reason: 'Mould change' }] }),
  machine('M-10', 'Wiring bench WB-1', 'P2', 'wiring', 16, { lastMaintenance: ahead(-50), everyDays: 90 }),
  machine('M-11', 'Assembly line A-2', 'P2', 'assembly', 8, { lastMaintenance: ahead(-18), everyDays: 60 }),
  machine('M-12', 'Packing station P-2', 'P2', 'packing', 8, { lastMaintenance: ahead(-29) }),
];

// Outside workshops that do a process for us (job work): material goes out on a challan and comes back.
const JOB_WORKERS = [
  { id: 'J1', name: 'Sri Murugan Coatings', process: 'coating', phone: '+91 98940 33127', leadDays: 3 },
  { id: 'J2', name: 'Precision Laser Cutters', process: 'cutting', phone: '+91 99620 81455', leadDays: 2 },
  { id: 'J3', name: 'Balaji Wiring Works', process: 'wiring', phone: '+91 94451 60298', leadDays: 4 },
];

const SUPPLIERS = [
  { id: 'S1', name: 'Shakti Steel Traders', phone: '+91 94430 11872', materials: ['RM-01', 'RM-07'], leadDays: 4 },
  { id: 'S2', name: 'Sagar Aluminium Co.', phone: '+91 98410 66203', materials: ['RM-02'], leadDays: 5 },
  { id: 'S3', name: 'Prime Polymers', phone: '+91 90031 45120', materials: ['RM-03'], leadDays: 3 },
  { id: 'S4', name: 'Vidyut Wires & Cables', phone: '+91 99400 27781', materials: ['RM-04'], leadDays: 3 },
  { id: 'S5', name: 'ColourCoat Powders', phone: '+91 97910 55634', materials: ['RM-05'], leadDays: 2 },
  { id: 'S6', name: 'Packwell Corrugators', phone: '+91 93810 70045', materials: ['RM-06'], leadDays: 2 },
];

const sales1 = USERS[1];
const sales2 = USERS[2];
const factory = USERS[3];
const qc = USERS[4];
const sup = USERS[5];
const ev = (status, at, user, note = '', extra = {}) => ({ status, at, by: user.name, role: user.role, note, ...extra });

/** Stage approval record: `approver` given = approved, `rejected` = sent back with that note, else pending. */
const approval = (status, at, user, approver, { rejected } = {}) => ({
  status,
  requestedBy: user.name,
  requestedById: user.id,
  at,
  state: rejected ? 'rejected' : approver ? 'approved' : 'pending',
  ...(approver && { decidedBy: approver.name, decidedById: approver.id, decidedAt: at, note: rejected ?? 'Stage approved' }),
});
const approvedEv = (status, at, approver) => ev(status, at, approver, '✔ Approved – Stage approved', { approval: 'approved' });

const msg = (n, at, user, { kind = 'text', code = null, text = '' }) => ({
  id: `M${n}`, kind, code, text, at, by: user.name, byId: user.id, role: user.role,
});

function order(o) {
  return {
    holdReason: null, holdCode: null, holdNote: '', qc: null, clientApproval: null, dispatch: null, approval: null,
    materialsDeducted: false, problem: null, messages: [], ...o,
  };
}

const ORDERS = [
  order({
    id: 'WO-2026-0006',
    customerPoNo: 'KMC/PUR/2026/118',
    piNo: 'PI-2026-0142',
    customer: {
      name: 'Kaveri Medical College',
      contact: 'Dr. Arvind S',
      email: 'purchase@kaverimed.edu',
      phone: '+91 98450 11223',
      address: 'Hosur Road, Bengaluru, KA 560068',
    },
    items: [{ productId: 'FG-101', qty: 12, specs: 'Grey RAL 7035, 4 shelves' }],
    requirements: 'Lockable doors with 2 keys each. Deliver to Block C stores.',
    expectedDeliveryDate: ahead(4),
    priority: 'High',
    createdBy: sales2.id,
    createdByName: sales2.name,
    createdAt: ago(9),
    status: 'QC_APPROVED',
    materialsDeducted: true,
    qc: {
      result: 'PASS',
      checks: [true, true, true, true, true],
      inspectedQty: 12,
      remarks: 'All 12 cabinets passed. Locks and keys verified.',
      by: qc.name,
      at: ago(0, 5),
    },
    approval: approval('QC_APPROVED', ago(0, 4), qc, sup),
    history: [
      ev('PENDING_REVIEW', ago(9), sales2, 'Work order entered and sent to factory'),
      ev('ACCEPTED', ago(8, 20), factory, 'Raw material available'),
      approvedEv('ACCEPTED', ago(8, 19), sup),
      ev('IN_PRODUCTION', ago(8), factory),
      approvedEv('IN_PRODUCTION', ago(7, 22), sup),
      ev('PACKAGING', ago(2), factory),
      approvedEv('PACKAGING', ago(1, 20), sup),
      ev('READY_TO_DISPATCH', ago(1), factory),
      approvedEv('READY_TO_DISPATCH', ago(0, 22), sup),
      ev('QC_APPROVED', ago(0, 5), qc, 'All 12 cabinets passed.'),
      approvedEv('QC_APPROVED', ago(0, 4), sup),
    ],
  }),
  order({
    id: 'WO-2026-0005',
    customerPoNo: 'SH-PO-77821',
    piNo: 'PI-2026-0128',
    customer: {
      name: 'Sunrise Hospitals',
      contact: 'Meena Joseph',
      email: 'stores@sunrisehospitals.in',
      phone: '+91 99620 44110',
      address: 'Anna Salai, Chennai, TN 600002',
    },
    items: [{ productId: 'FG-101', qty: 10, specs: 'White, 5 shelves' }],
    requirements: 'Medical-grade white powder coat.',
    expectedDeliveryDate: ahead(1),
    priority: 'Normal',
    createdBy: sales1.id,
    createdByName: sales1.name,
    createdAt: ago(14),
    status: 'DISPATCHED',
    materialsDeducted: true,
    qc: {
      result: 'PASS',
      checks: [true, true, true, true, true],
      inspectedQty: 10,
      remarks: 'Passed.',
      by: qc.name,
      at: ago(3),
    },
    clientApproval: { note: 'Client confirmed QC report on call.', by: sales1.name, at: ago(2, 6) },
    dispatch: {
      mode: 'transporter',
      carrier: 'VRL Logistics',
      vehicleNo: '',
      driverName: '',
      driverPhone: '',
      trackingId: 'VRL-LR-5520193',
      dispatchDate: ago(2).slice(0, 10),
      eta: ahead(1),
      remarks: '',
      by: factory.name,
      at: ago(2),
    },
    history: [
      ev('PENDING_REVIEW', ago(14), sales1, 'Work order entered and sent to factory'),
      ev('ACCEPTED', ago(13), factory),
      ev('IN_PRODUCTION', ago(12), factory),
      ev('PACKAGING', ago(5), factory),
      ev('READY_TO_DISPATCH', ago(4), factory),
      ev('QC_APPROVED', ago(3), qc, 'Passed.'),
      ev('CLIENT_APPROVED', ago(2, 6), sales1, 'Client confirmed QC report on call.'),
      ev('DISPATCHED', ago(2), factory, 'VRL Logistics · LR VRL-LR-5520193'),
    ],
  }),
  order({
    id: 'WO-2026-0004',
    customerPoNo: 'GLW/2026/0931',
    piNo: 'PI-2026-0151',
    customer: {
      name: 'GreenLeaf Warehousing',
      contact: 'Imran Shaikh',
      email: 'ops@greenleafwh.com',
      phone: '+91 90030 77881',
      address: 'Bhiwandi Logistics Park, MH 421302',
    },
    items: [{ productId: 'FG-102', qty: 200, specs: 'Anti-skid rubber feet' }],
    requirements: 'ISI marked. Phased delivery acceptable.',
    // Promised in 3 days, pushed back 15 days because aluminium rod is short.
    originalDeliveryDate: ahead(3),
    expectedDeliveryDate: ahead(18),
    delays: [
      {
        days: 15,
        code: 'material_short',
        note: 'Aluminium Rod short by 400 kg. Supplier delivers in 5 days, then 8 days to make.',
        from: ahead(3),
        to: ahead(18),
        by: factory.name,
        byId: factory.id,
        at: ago(2, 8),
      },
    ],
    priority: 'Normal',
    createdBy: sales1.id,
    createdByName: sales1.name,
    createdAt: ago(3),
    status: 'ON_HOLD',
    holdReason: 'Aluminium Rod short by 400 kg. Purchase raised with supplier, ETA 5 days.',
    holdCode: 'material_short',
    holdNote: 'Aluminium Rod short by 400 kg. Supplier will send in 5 days.',
    messages: [
      msg(1, ago(2, 10), sales1, { code: 'quick.when_ready' }),
      msg(2, ago(2, 8), factory, { text: 'Aluminium comes in 5 days. Then 8 days to make. Tell customer 2 weeks.' }),
      msg(3, ago(2, 7), sales1, { code: 'quick.ok' }),
    ],
    history: [
      ev('PENDING_REVIEW', ago(3), sales1, 'Work order entered and sent to factory'),
      ev('ON_HOLD', ago(2, 18), factory, 'Aluminium Rod short by 400 kg. Purchase raised with supplier, ETA 5 days.'),
      ev('ON_HOLD', ago(2, 8), factory, `⏳ Delayed 15 days (${ahead(3)} → ${ahead(18)}): Raw material short – Aluminium Rod short by 400 kg`, {
        delay: true,
      }),
    ],
  }),
  order({
    id: 'WO-2026-0003',
    customerPoNo: 'MB-EL-4410',
    piNo: 'PI-2026-0137',
    customer: {
      name: 'Metro Builders Pvt Ltd',
      contact: 'Karthik Raman',
      email: 'procurement@metrobuilders.co.in',
      phone: '+91 94440 55667',
      address: 'OMR, Sholinganallur, Chennai, TN 600119',
    },
    items: [{ productId: 'FG-103', qty: 40, specs: '12-way, IP54' }],
    requirements: 'Test certificate required with each panel.',
    expectedDeliveryDate: ahead(6),
    priority: 'Urgent',
    createdBy: sales2.id,
    createdByName: sales2.name,
    createdAt: ago(11),
    status: 'READY_TO_DISPATCH',
    materialsDeducted: true,
    approval: approval('READY_TO_DISPATCH', ago(0, 8), factory),
    history: [
      ev('PENDING_REVIEW', ago(11), sales2, 'Work order entered and sent to factory'),
      ev('ACCEPTED', ago(10), factory),
      approvedEv('ACCEPTED', ago(10), sup),
      ev('IN_PRODUCTION', ago(10), factory),
      approvedEv('IN_PRODUCTION', ago(9, 20), sup),
      ev('PACKAGING', ago(2), factory),
      approvedEv('PACKAGING', ago(1, 22), sup),
      ev('READY_TO_DISPATCH', ago(0, 8), factory, 'Packed, test certificates attached'),
    ],
  }),
  order({
    id: 'WO-2026-0002',
    customerPoNo: 'NR/STORE/2291',
    piNo: 'PI-2026-0160',
    customer: {
      name: 'Nova Retail',
      contact: 'Sneha Kapoor',
      email: 'buying@novaretail.in',
      phone: '+91 98110 22334',
      address: 'Sector 18, Noida, UP 201301',
    },
    items: [
      { productId: 'FG-104', qty: 300, specs: 'Blue colour, with lid' },
      { productId: 'FG-101', qty: 8, specs: 'Grey' },
    ],
    requirements: 'Print Nova Retail logo on bins.',
    expectedDeliveryDate: ahead(12),
    priority: 'Normal',
    createdBy: sales1.id,
    createdByName: sales1.name,
    createdAt: ago(0, 6),
    status: 'PENDING_REVIEW',
    history: [ev('PENDING_REVIEW', ago(0, 6), sales1, 'Work order entered and sent to factory')],
  }),
  order({
    id: 'WO-2026-0001',
    customerPoNo: 'APX-2026-552',
    piNo: 'PI-2026-0133',
    customer: {
      name: 'Apex Industries',
      contact: 'Vijay Menon',
      email: 'vijay@apexind.com',
      phone: '+91 97890 12345',
      address: 'SIPCOT, Hosur, TN 635126',
    },
    items: [{ productId: 'FG-101', qty: 20, specs: 'Blue RAL 5015' }],
    requirements: 'Standard packaging.',
    expectedDeliveryDate: ahead(-1),
    priority: 'High',
    createdBy: sales1.id,
    createdByName: sales1.name,
    createdAt: ago(6),
    status: 'IN_PRODUCTION',
    materialsDeducted: true,
    approval: approval('IN_PRODUCTION', ago(4), factory, sup),
    problem: { code: 'machine_down', note: 'Bending machine broken. Mechanic coming tomorrow.', by: factory.name, at: ago(0, 3) },
    messages: [
      msg(1, ago(0, 3), factory, { kind: 'problem', code: 'reason.machine_down', text: 'Bending machine broken. Mechanic coming tomorrow.' }),
    ],
    history: [
      ev('PENDING_REVIEW', ago(6), sales1, 'Work order entered and sent to factory'),
      ev('ACCEPTED', ago(5), factory, 'Material reserved'),
      approvedEv('ACCEPTED', ago(4, 20), sup),
      ev('IN_PRODUCTION', ago(4), factory),
      approvedEv('IN_PRODUCTION', ago(3, 22), sup),
    ],
  }),
  order({
    id: 'WO-2026-0007',
    customerPoNo: 'SVS/PO/2026/064',
    piNo: 'PI-2026-0158',
    customer: {
      name: 'Sri Venkateswara Schools',
      contact: 'Lakshmi Prasad',
      email: 'admin@svschools.org',
      phone: '+91 93800 41122',
      address: 'Tirupati Road, Chittoor, AP 517001',
    },
    items: [{ productId: 'FG-104', qty: 120, specs: 'Green, school logo sticker' }],
    requirements: 'Pack 10 bins per carton. Label each carton with school branch name.',
    expectedDeliveryDate: ahead(2),
    priority: 'High',
    createdBy: sales2.id,
    createdByName: sales2.name,
    createdAt: ago(5),
    status: 'PACKAGING',
    materialsDeducted: true,
    approval: approval('PACKAGING', ago(0, 10), factory, sup, { rejected: 'Branch labels missing on 4 cartons' }),
    history: [
      ev('PENDING_REVIEW', ago(5), sales2, 'Work order entered and sent to factory'),
      ev('ACCEPTED', ago(4, 20), factory),
      approvedEv('ACCEPTED', ago(4, 18), sup),
      ev('IN_PRODUCTION', ago(4), factory),
      approvedEv('IN_PRODUCTION', ago(3, 20), sup),
      ev('PACKAGING', ago(0, 10), factory),
      ev('PACKAGING', ago(0, 6), sup, '✖ Rejected – Branch labels missing on 4 cartons', { approval: 'rejected' }),
    ],
  }),
];

/**
 * Finished orders from about a month ago, so period comparisons ("this month vs previous month")
 * have something to compare with. Each one ran the full flow and was delivered.
 */
function pastOrder(n, customerName, items, daysAgo, seller, priority = 'Normal') {
  const customer = ORDERS.find((o) => o.customer.name === customerName).customer;
  const at = (offset) => ago(daysAgo - offset);
  return order({
    id: `WO-2026-${String(n).padStart(4, '0')}`,
    customerPoNo: `${customerName.split(' ')[0].toUpperCase()}/PO/${1000 + n}`,
    piNo: `PI-2026-${String(90 + n).padStart(4, '0')}`,
    customer,
    items,
    requirements: 'Standard packaging.',
    expectedDeliveryDate: ahead(-(daysAgo - 14)),
    priority,
    createdBy: seller.id,
    createdByName: seller.name,
    createdAt: at(0),
    status: 'DELIVERED',
    materialsDeducted: true,
    qc: { result: 'PASS', checks: [true, true, true, true, true], inspectedQty: items[0].qty, remarks: 'All checks OK', by: qc.name, at: at(8) },
    clientApproval: { note: 'Client approved QC report', by: seller.name, at: at(9) },
    dispatch: {
      mode: 'transporter', carrier: 'TCI Freight', vehicleNo: '', driverName: '', driverPhone: '',
      trackingId: `TCI-${700000 + n * 37}`, dispatchDate: at(10).slice(0, 10), eta: at(12).slice(0, 10), remarks: '', by: factory.name, at: at(10),
    },
    history: [
      ev('PENDING_REVIEW', at(0), seller, 'Work order entered and sent to factory'),
      ev('ACCEPTED', at(1), factory, 'Raw material available'),
      approvedEv('ACCEPTED', at(1), sup),
      ev('IN_PRODUCTION', at(1.5), factory),
      approvedEv('IN_PRODUCTION', at(1.5), sup),
      ev('PACKAGING', at(6), factory),
      approvedEv('PACKAGING', at(6), sup),
      ev('READY_TO_DISPATCH', at(7), factory),
      approvedEv('READY_TO_DISPATCH', at(7), sup),
      ev('QC_APPROVED', at(8), qc, 'All checks OK'),
      approvedEv('QC_APPROVED', at(8), sup),
      ev('CLIENT_APPROVED', at(9), seller, 'Client approved QC report'),
      approvedEv('CLIENT_APPROVED', at(9), sup),
      ev('DISPATCHED', at(10), factory, `TCI Freight · Tracking TCI-${700000 + n * 37}`),
      ev('DELIVERED', at(12), seller, 'Delivered to customer'),
    ],
  });
}

ORDERS.push(
  pastOrder(8, 'Apex Industries', [{ productId: 'FG-101', qty: 15, specs: 'Blue RAL 5015' }], 45, sales1, 'High'),
  pastOrder(9, 'Apex Industries', [{ productId: 'FG-103', qty: 10, specs: '8-way, IP54' }], 33, sales1),
  pastOrder(10, 'Sunrise Hospitals', [{ productId: 'FG-101', qty: 6, specs: 'White, 5 shelves' }], 38, sales1),
  pastOrder(11, 'Metro Builders Pvt Ltd', [{ productId: 'FG-103', qty: 25, specs: '12-way, IP54' }], 41, sales2, 'Urgent'),
  pastOrder(12, 'Kaveri Medical College', [{ productId: 'FG-104', qty: 80, specs: 'Grey, with lid' }], 30, sales2),
);

const NOTIFICATIONS = [
  { id: 'N1', roles: ['factory'], userId: null, orderId: 'WO-2026-0002', message: 'New work order WO-2026-0002 from Nova Retail awaiting review', at: ago(0, 6), readBy: [] },
  { id: 'N2', roles: ['qc'], userId: sales2.id, orderId: 'WO-2026-0003', message: 'WO-2026-0003 is ready to dispatch – QC inspection required', at: ago(0, 8), readBy: [] },
  { id: 'N3', roles: [], userId: sales2.id, orderId: 'WO-2026-0006', message: 'QC passed for WO-2026-0006 – share report with Kaveri Medical College', at: ago(0, 5), readBy: [] },
  { id: 'N4', roles: ['supervisor'], userId: null, orderId: 'WO-2026-0003', message: 'WO-2026-0003: stage "Ready to Dispatch" by Suresh Kumar is waiting for your approval', at: ago(0, 8), readBy: [] },
  { id: 'N5', roles: [], userId: factory.id, orderId: 'WO-2026-0007', message: 'WO-2026-0007: stage "Packaging" rejected – Branch labels missing on 4 cartons by Kiran Patil', at: ago(0, 6), readBy: [] },
];

// Panels and bins are made in Chennai (wiring, moulding); cabinets and ladders in Hosur.
const plantFor = (o) => (o.items.some((it) => ['FG-103', 'FG-104'].includes(it.productId)) ? 'P2' : 'P1');

// Two past deliveries (one on time, one late with a rejection at incoming inspection) for the supplier
// scorecard, and the open purchase order for the aluminium that WO-2026-0004 is waiting on.
const PURCHASES = [
  {
    id: 'PUR-2026-0001',
    supplierId: 'S1',
    plantId: 'P1',
    items: [{ rmId: 'RM-01', qty: 2000 }],
    forOrders: [],
    status: 'RECEIVED',
    expectedDate: ahead(-36),
    note: 'Monthly steel',
    createdAt: ago(40),
    createdBy: factory.name,
    receipts: [{ at: ago(37), by: factory.name, batchNo: 'SST-2608-090', lines: [{ rmId: 'RM-01', accepted: 2000, rejected: 0, reason: '' }] }],
  },
  {
    id: 'PUR-2026-0002',
    supplierId: 'S5',
    plantId: 'P1',
    items: [{ rmId: 'RM-05', qty: 60 }],
    forOrders: [],
    status: 'RECEIVED',
    expectedDate: ahead(-33),
    note: 'Powder coat – grey and white',
    createdAt: ago(36),
    createdBy: factory.name,
    receipts: [{ at: ago(31), by: factory.name, batchNo: 'CC-PC-2190', lines: [{ rmId: 'RM-05', accepted: 55, rejected: 5, reason: 'Lumps in 1 drum' }] }],
  },
  {
    id: 'PUR-2026-0003',
    supplierId: 'S2',
    plantId: 'P1',
    items: [{ rmId: 'RM-02', qty: 600 }],
    forOrders: ['WO-2026-0004'],
    status: 'SENT',
    expectedDate: ahead(2),
    note: 'Aluminium Rod for GreenLeaf ladders',
    // The supplier has dispatched it – on the road with the transporter.
    shipment: {
      carrier: 'VRL Logistics',
      trackingId: 'VRL-LR-8841207',
      vehicleNo: 'TN-30-AB-4471',
      dispatchedOn: ahead(-1),
      eta: ahead(2),
      at: ago(1, 2),
      by: factory.name,
    },
    createdAt: ago(2, 8),
    createdBy: factory.name,
  },
];

const LOTS = OPENING_LOTS.map(([rmId, plantId, qty, batchNo], i) => ({
  id: `LOT-${String(i + 1).padStart(4, '0')}`,
  rmId,
  plantId,
  qty,
  received: qty,
  batchNo,
  source: 'Opening stock',
  receivedAt: ago(30),
}));

/** Demo orders already in production record the opening batches they were made from. */
function withBatches(o) {
  if (!o.materialsDeducted || o.materialLots) return o;
  const used = {};
  o.items.forEach((it) =>
    Object.entries(PRODUCTS.find((p) => p.id === it.productId).bom).forEach(([rmId, q]) => (used[rmId] = (used[rmId] ?? 0) + q * it.qty)),
  );
  return {
    ...o,
    materialLots: Object.entries(used).map(([rmId, qty]) => {
      const lot = LOTS.find((l) => l.rmId === rmId && l.plantId === o.plantId) ?? LOTS.find((l) => l.rmId === rmId);
      return { rmId, lotId: lot.id, batchNo: lot.batchNo, qty: Math.round(qty * 100) / 100 };
    }),
  };
}

/** Labour time, job work and scrap on a few demo orders. */
const SHOP_FLOOR = {
  'WO-2026-0001': {
    timeLogs: [
      { id: 'T1', process: 'cutting', by: factory.name, byId: factory.id, start: ago(4, 2), end: ago(3, 20) },
      { id: 'T2', process: 'welding', by: factory.name, byId: factory.id, start: ago(2, 6), end: ago(2, 1) },
    ],
    jobWork: [
      { id: 'JW-0001', process: 'coating', workerId: 'J1', qty: 20, challanNo: 'JWC-0412', expectedBack: ahead(2), status: 'OUT', sentAt: ago(1, 4), sentBy: factory.name },
    ],
  },
  'WO-2026-0006': {
    timeLogs: [{ id: 'T1', process: 'assembly', by: factory.name, byId: factory.id, start: ago(3, 8), end: ago(3, 2) }],
    jobWork: [
      {
        id: 'JW-0000', process: 'coating', workerId: 'J1', qty: 12, challanNo: 'JWC-0398', expectedBack: ahead(-5), status: 'DONE',
        sentAt: ago(8), sentBy: factory.name, returnedAt: ago(5), returnedBy: factory.name, okQty: 12, rejectedQty: 0, note: '',
      },
    ],
  },
  'WO-2026-0007': {
    scrap: [{ qty: 4, code: 'damaged', note: 'Lids cracked in moulding', stage: 'IN_PRODUCTION', at: ago(2, 3), by: factory.name }],
  },
};

export function createSeedState() {
  const orders = ORDERS.map((o) => withBatches({ plantId: plantFor(o), ...structuredClone(o), ...structuredClone(SHOP_FLOOR[o.id] ?? {}) }));
  // The opening batches' "received" includes what the demo orders already took, so "left / received" adds up.
  const lots = LOTS.map((l) => {
    const used = orders.flatMap((o) => o.materialLots ?? []).filter((u) => u.lotId === l.id).reduce((s, u) => s + u.qty, 0);
    return { ...l, received: Math.round((l.qty + used) * 100) / 100 };
  });
  return {
    materials: RAW_MATERIALS.map((m) => ({ ...m, stock: lots.filter((l) => l.rmId === m.id).reduce((s, l) => s + l.qty, 0) })),
    lots,
    products: PRODUCTS.map((p) => ({ ...p, bom: { ...p.bom }, route: { ...p.route } })),
    orders,
    plants: PLANTS.map((p) => ({ ...p })),
    machines: MACHINES.map((m) => structuredClone(m)),
    suppliers: SUPPLIERS.map((s) => ({ ...s, materials: [...s.materials] })),
    purchases: PURCHASES.map((p) => structuredClone(p)),
    notifications: NOTIFICATIONS.map((n) => ({ ...n })),
    inventoryLog: [],
    jobWorkers: JOB_WORKERS.map((w) => ({ ...w })),
    users: USERS.map((u) => ({ ...u })),
    processes: Object.fromEntries(Object.entries(PROCESSES).map(([k, p]) => [k, { ...p }])),
    counters: { order: 12, notif: 5, log: 0, purchase: 3, lot: LOTS.length, master: 0, jobWork: 1 },
    // Administrator settings: renamed sections, access changes, which stages need approval, and the
    // working calendar (0 = Sunday … 6 = Saturday) that capacity planning counts days with.
    settings: {
      labels: {},
      access: {},
      approvalStages: [...APPROVAL_STAGES],
      // Production stages between "accepted" and QC, modules switched off, and extra work order fields.
      workflow: { journey: DEFAULT_JOURNEY.map((s) => ({ ...s })), removed: [], names: {} },
      features: {},
      orderFields: [],
      // Pick-lists the admin can edit: reasons, the QC checklist, and vehicles / couriers / transporters.
      lists: {
        reasons: Object.fromEntries(Object.entries(DEFAULT_REASONS).map(([g, codes]) => [g, [...codes]])),
        customReasons: {},
        qcChecks: [...QC_CHECKS],
        vehicles: Object.fromEntries(Object.entries(VEHICLE_OPTIONS).map(([k, v]) => [k, [...v]])),
      },
      calendar: {
        workDays: [1, 2, 3, 4, 5, 6],
        holidays: [
          { date: ahead(17), name: 'Diwali' },
          { date: ahead(18), name: 'Diwali (Govardhan Puja)' },
        ],
      },
    },
  };
}
