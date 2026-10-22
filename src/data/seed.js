// Demo data. Dates are relative to "now" so the demo always looks current.

export const USERS = [
  { id: 'u-admin', name: 'Anita Rao', role: 'admin', email: 'admin@unifiedtree.in' },
  { id: 'u-sales1', name: 'Rahul Mehta', role: 'sales', email: 'rahul.sales@unifiedtree.in' },
  { id: 'u-sales2', name: 'Priya Nair', role: 'sales', email: 'priya.sales@unifiedtree.in' },
  { id: 'u-factory', name: 'Suresh Kumar', role: 'factory', email: 'factory@unifiedtree.in' },
  { id: 'u-qc', name: 'Deepa Iyer', role: 'qc', email: 'qc@unifiedtree.in' },
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

const RAW_MATERIALS = [
  { id: 'RM-01', name: 'Steel Sheet (CRCA 1.2mm)', unit: 'kg', stock: 4200, reorderLevel: 1000 },
  { id: 'RM-02', name: 'Aluminium Rod', unit: 'kg', stock: 1200, reorderLevel: 400 },
  { id: 'RM-03', name: 'Plastic Granules (PP)', unit: 'kg', stock: 850, reorderLevel: 300 },
  { id: 'RM-04', name: 'Copper Wire 2.5 sq.mm', unit: 'm', stock: 1800, reorderLevel: 1000 },
  { id: 'RM-05', name: 'Powder Coat Paint', unit: 'L', stock: 40, reorderLevel: 60 },
  { id: 'RM-06', name: 'Corrugated Packaging Box', unit: 'pcs', stock: 520, reorderLevel: 150 },
  { id: 'RM-07', name: 'Bolts & Nuts Kit', unit: 'pcs', stock: 9000, reorderLevel: 2000 },
];

// Bill of materials: raw material required per 1 unit of finished product.
const PRODUCTS = [
  {
    id: 'FG-101',
    name: 'Steel Storage Cabinet',
    bom: { 'RM-01': 25, 'RM-05': 1.5, 'RM-07': 40, 'RM-06': 1 },
  },
  { id: 'FG-102', name: 'Aluminium Ladder 8ft', bom: { 'RM-02': 8, 'RM-07': 20, 'RM-06': 1 } },
  {
    id: 'FG-103',
    name: 'Electrical Distribution Panel',
    bom: { 'RM-01': 12, 'RM-04': 30, 'RM-03': 3, 'RM-07': 30, 'RM-06': 1 },
  },
  { id: 'FG-104', name: 'Plastic Storage Bin 50L', bom: { 'RM-03': 2, 'RM-06': 1 } },
];

const day = 86400000;
const ago = (d, h = 0) => new Date(Date.now() - d * day - h * 3600000).toISOString();
const ahead = (d) => new Date(Date.now() + d * day).toISOString().slice(0, 10);

const sales1 = USERS[1];
const sales2 = USERS[2];
const factory = USERS[3];
const qc = USERS[4];
const ev = (status, at, user, note = '') => ({ status, at, by: user.name, role: user.role, note });

const msg = (n, at, user, { kind = 'text', code = null, text = '' }) => ({
  id: `M${n}`, kind, code, text, at, by: user.name, byId: user.id, role: user.role,
});

function order(o) {
  return {
    holdReason: null, holdCode: null, holdNote: '', qc: null, clientApproval: null, dispatch: null,
    materialsDeducted: false, problem: null, messages: [], ...o,
  };
}

const ORDERS = [
  order({
    id: 'PO-2026-0006',
    customerPoNo: 'KMC/PUR/2026/118',
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
    history: [
      ev('PENDING_REVIEW', ago(9), sales2, 'Customer PO entered and sent to factory'),
      ev('ACCEPTED', ago(8, 20), factory, 'Raw material available'),
      ev('IN_PRODUCTION', ago(8), factory),
      ev('PACKAGING', ago(2), factory),
      ev('READY_TO_DISPATCH', ago(1), factory),
      ev('QC_APPROVED', ago(0, 5), qc, 'All 12 cabinets passed.'),
    ],
  }),
  order({
    id: 'PO-2026-0005',
    customerPoNo: 'SH-PO-77821',
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
      ev('PENDING_REVIEW', ago(14), sales1, 'Customer PO entered and sent to factory'),
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
    id: 'PO-2026-0004',
    customerPoNo: 'GLW/2026/0931',
    customer: {
      name: 'GreenLeaf Warehousing',
      contact: 'Imran Shaikh',
      email: 'ops@greenleafwh.com',
      phone: '+91 90030 77881',
      address: 'Bhiwandi Logistics Park, MH 421302',
    },
    items: [{ productId: 'FG-102', qty: 200, specs: 'Anti-skid rubber feet' }],
    requirements: 'ISI marked. Phased delivery acceptable.',
    expectedDeliveryDate: ahead(18),
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
      ev('PENDING_REVIEW', ago(3), sales1, 'Customer PO entered and sent to factory'),
      ev('ON_HOLD', ago(2, 18), factory, 'Aluminium Rod short by 400 kg. Purchase raised with supplier, ETA 5 days.'),
    ],
  }),
  order({
    id: 'PO-2026-0003',
    customerPoNo: 'MB-EL-4410',
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
    history: [
      ev('PENDING_REVIEW', ago(11), sales2, 'Customer PO entered and sent to factory'),
      ev('ACCEPTED', ago(10), factory),
      ev('IN_PRODUCTION', ago(10), factory),
      ev('PACKAGING', ago(2), factory),
      ev('READY_TO_DISPATCH', ago(0, 8), factory, 'Packed, test certificates attached'),
    ],
  }),
  order({
    id: 'PO-2026-0002',
    customerPoNo: 'NR/STORE/2291',
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
    history: [ev('PENDING_REVIEW', ago(0, 6), sales1, 'Customer PO entered and sent to factory')],
  }),
  order({
    id: 'PO-2026-0001',
    customerPoNo: 'APX-2026-552',
    customer: {
      name: 'Apex Industries',
      contact: 'Vijay Menon',
      email: 'vijay@apexind.com',
      phone: '+91 97890 12345',
      address: 'SIPCOT, Hosur, TN 635126',
    },
    items: [{ productId: 'FG-101', qty: 20, specs: 'Blue RAL 5015' }],
    requirements: 'Standard packaging.',
    expectedDeliveryDate: ahead(9),
    priority: 'High',
    createdBy: sales1.id,
    createdByName: sales1.name,
    createdAt: ago(6),
    status: 'IN_PRODUCTION',
    materialsDeducted: true,
    problem: { code: 'machine_down', note: 'Bending machine broken. Mechanic coming tomorrow.', by: factory.name, at: ago(0, 3) },
    messages: [
      msg(1, ago(0, 3), factory, { kind: 'problem', code: 'reason.machine_down', text: 'Bending machine broken. Mechanic coming tomorrow.' }),
    ],
    history: [
      ev('PENDING_REVIEW', ago(6), sales1, 'Customer PO entered and sent to factory'),
      ev('ACCEPTED', ago(5), factory, 'Material reserved'),
      ev('IN_PRODUCTION', ago(4), factory),
    ],
  }),
];

const NOTIFICATIONS = [
  { id: 'N1', roles: ['factory'], userId: null, orderId: 'PO-2026-0002', message: 'New PO PO-2026-0002 from Nova Retail awaiting review', at: ago(0, 6), readBy: [] },
  { id: 'N2', roles: ['qc'], userId: sales2.id, orderId: 'PO-2026-0003', message: 'PO-2026-0003 is ready to dispatch – QC inspection required', at: ago(0, 8), readBy: [] },
  { id: 'N3', roles: [], userId: sales2.id, orderId: 'PO-2026-0006', message: 'QC passed for PO-2026-0006 – share report with Kaveri Medical College', at: ago(0, 5), readBy: [] },
];

export function createSeedState() {
  return {
    materials: RAW_MATERIALS.map((m) => ({ ...m })),
    products: PRODUCTS.map((p) => ({ ...p, bom: { ...p.bom } })),
    orders: ORDERS.map((o) => structuredClone(o)),
    notifications: NOTIFICATIONS.map((n) => ({ ...n })),
    inventoryLog: [],
    counters: { order: 6, notif: 3, log: 0 },
  };
}
