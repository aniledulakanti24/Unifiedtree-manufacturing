import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createSeedState } from '../data/seed';
import { buildPlan, riskOf } from '../data/planning';
import { APPROVAL_STAGES, CUSTOMER_STEP, NEXT_STAGE, QC_STEP, STATUS, acceptStatus, canEditOrder, isOpen, journeyOf, kindOf, openApproval, reworkStage, setWorkflow } from '../data/statuses';
import { featureOn, setFeatures } from '../auth/features';
import { setUsers } from '../data/users';
import { setReasonLists } from '../data/reasons';
import { setProcesses } from '../data/processes';
import { useToast } from './ToastContext';
import { ROLES, can, rolesFor, setAccessOverrides } from '../auth/permissions';
import { addDays, sameData } from '../utils';
import { addLot, issueFifo, orderAvailability, poRemaining, returnLots } from '../data/stock';
import { useAuth } from './AuthContext';
import { tr, useLang } from '../i18n';

// All app data lives here and is persisted to localStorage.
// Swap the reducer's actions for API calls when a backend is added.

const STORAGE_KEY = 'unifiedtree-scm-v6';
// Data saved by earlier versions of the app; no longer read, so it is cleared.
const OLD_KEYS = ['unifiedtree-scm-v1', 'unifiedtree-scm-v2', 'unifiedtree-scm-v3', 'unifiedtree-scm-v4', 'unifiedtree-scm-v5'];
const PLANT_KEY = 'unifiedtree-scm-plant';
const StoreContext = createContext(null);

function load() {
  try {
    OLD_KEYS.forEach((k) => localStorage.removeItem(k));
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const s = JSON.parse(saved);
      const seed = createSeedState();
      return { ...s, users: s.users ?? seed.users, processes: s.processes ?? seed.processes, settings: { ...seed.settings, ...s.settings } };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return createSeedState();
}

// Read once at start-up so the sign-in code (above the store) already knows people the admin added.
const initialState = load();
setUsers(initialState.users);

const event = (status, p, note = '', extra = {}) => ({ status, at: p.at, by: p.user.name, role: p.user.role, note, ...extra });
const stageName = (status) => STATUS[status].label.split(' · ')[0];

function notify(state, p, { roles = [], userId = null, orderId = null, message }) {
  const n = state.counters.notif + 1;
  return {
    ...state,
    counters: { ...state.counters, notif: n },
    notifications: [{ id: `N${n}`, roles, userId, orderId, message, at: p.at, readBy: [] }, ...state.notifications],
  };
}

function updateOrder(state, id, fn) {
  return { ...state, orders: state.orders.map((o) => (o.id === id ? fn(o) : o)) };
}

/** Moves an order into a stage, logs who did it, and opens a stage approval if the admin requires one. */
function enterStage(state, o, status, p, note = '', extra = {}) {
  const needs = featureOn('stageApprovals') && state.settings.approvalStages.includes(status);
  return {
    ...o,
    status,
    approval: needs ? { status, state: 'pending', requestedBy: p.user.name, requestedById: p.user.id, at: p.at } : null,
    history: [...o.history, event(status, p, note, extra)],
  };
}

/** Tells the stage approvers that a stage is waiting for their sign-off. */
function askApproval(state, p, id) {
  const o = state.orders.find((x) => x.id === id);
  if (!openApproval(o)) return state;
  return notify(state, p, {
    roles: rolesFor('stage.approve').filter((r) => r !== 'admin'),
    orderId: id,
    message: `${id}: stage "${stageName(o.status)}" by ${p.user.name} is waiting for your approval`,
  });
}

/** What happens next, for messages: "ready for dispatch", "share report with …", "continue with welding". */
function nextText(status, order) {
  if (status === 'CLIENT_APPROVED') return 'ready for dispatch';
  if (status === CUSTOMER_STEP) return `share report with ${order.customer.name}`;
  if (status === QC_STEP) return 'QC inspection required';
  return `continue with ${STATUS[status].label.toLowerCase()}`;
}

const plantName = (state, id) => state.plants.find((x) => x.id === id)?.name ?? id;

/** Next id like FG-105 / M-13: the prefix plus one more than the highest number used so far. */
const nextId = (prefix, width) => (list) => {
  const max = list.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0);
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
};

// Setup lists the administrator / factory can edit, with the defaults a new record starts from.
const MASTER_KINDS = {
  products: { newId: nextId('FG-', 3), blank: { bom: {}, route: {} } },
  machines: { newId: nextId('M-', 2), blank: { downtime: [], maintenanceLog: [], maintenanceEveryDays: 30, hoursPerDay: 8 } },
  suppliers: { newId: nextId('S', 1), blank: { materials: [], leadDays: 3 } },
  jobWorkers: { newId: nextId('J', 1), blank: { leadDays: 3 } },
  plants: { newId: nextId('P', 1), blank: {} },
};


// Work order details sales can change, with the name used in the history and notifications.
const EDIT_LABELS = {
  customer: 'customer details',
  customerPoNo: 'customer PO no.',
  poDate: 'PO date',
  piNo: 'PI no.',
  piDate: 'PI date',
  expectedDeliveryDate: 'delivery date',
  priority: 'priority',
  plantId: 'factory',
  requirements: 'requirements',
  items: 'products / quantities',
  extra: 'extra fields',
};

// Actions that move an order forward are blocked until its current stage is approved.
const GATED = ['ADVANCE_STAGE', 'QC_SUBMIT', 'CLIENT_DECISION', 'DISPATCH', 'DELIVER'];

/** Adds a chat message to the order and alerts the other side (sales <-> factory). */
function postMessage(state, p, order, { kind = 'text', code = null, text = '' }) {
  const messages = order.messages ?? [];
  const msg = { id: `M${messages.length + 1}`, kind, code, text, at: p.at, by: p.user.name, byId: p.user.id, role: p.user.role };
  const next = updateOrder(state, order.id, (o) => ({ ...o, messages: [...(o.messages ?? []), msg] }));
  const words = [code && tr('en', code), text].filter(Boolean).join(' – ');
  const preview = kind === 'problem' ? `PROBLEM – ${words}` : kind === 'solved' ? 'Problem solved' : words;
  return notify(next, p, {
    roles: p.user.role === 'factory' ? [] : ['factory'],
    userId: p.user.id === order.createdBy ? null : order.createdBy,
    orderId: order.id,
    message: `${p.user.name} on ${order.id}: ${preview}`,
  });
}

function logStock(state, p, rmId, change, reason) {
  const n = state.counters.log + 1;
  return {
    ...state,
    counters: { ...state.counters, log: n },
    inventoryLog: [{ id: n, at: p.at, rmId, change, reason, by: p.user.name }, ...state.inventoryLog].slice(0, 200),
  };
}

function reducer(state, { type, payload: p }) {
  const order = p?.id ? state.orders.find((o) => o.id === p.id) : null;
  if (GATED.includes(type) && order && openApproval(order)) return state;

  switch (type) {
    case 'CREATE_ORDER': {
      const o = {
        ...p.order,
        createdBy: p.user.id,
        createdByName: p.user.name,
        createdAt: p.at,
        status: 'PENDING_REVIEW',
        holdReason: null,
        qc: null,
        clientApproval: null,
        dispatch: null,
        approval: null,
        materialsDeducted: false,
        history: [event('PENDING_REVIEW', p, 'Work order entered and sent to factory')],
      };
      const next = { ...state, counters: { ...state.counters, order: state.counters.order + 1 }, orders: [o, ...state.orders] };
      // Factory review switched off: accept straight away when the raw material is in stock. An order that is
      // short still waits on the Factory Review page, since someone has to decide what to do.
      if (!featureOn('review') && orderAvailability(o, next).ok) {
        return reducer(next, { type: 'REVIEW_ORDER', payload: { ...p, id: o.id, decision: 'accept', note: 'Accepted automatically – raw material in stock' } });
      }
      return notify(next, p, {
        roles: ['factory'],
        orderId: o.id,
        message: `New work order ${o.id} from ${o.customer.name} awaiting factory review${o.items.some((it) => it.barcode) ? ' · customer barcodes to print on packets' : ''}`,
      });
    }

    // Sales (or the admin) corrects a work order at any time until it is dispatched. Changing products,
    // quantities or the factory after raw material was issued puts that material back in stock and sends the
    // order back to factory review, since what was planned no longer matches.
    case 'UPDATE_ORDER': {
      if (!order || !canEditOrder(p.user, order)) return state;
      const c = p.changes;
      // Product lines: only products and quantities change the raw material; specs and packet barcodes do not.
      const pick = (items, keys) => (items ?? []).map((it) => Object.fromEntries(keys.map((k) => [k, it[k]])));
      const itemChanges = c.items
        ? [
            ['products / quantities', ['productId', 'qty']],
            ['packet barcodes', ['barcode', 'packQty']],
            ['product specs', ['specs']],
          ].filter(([, keys]) => !sameData(pick(c.items, keys), pick(order.items, keys))).map(([label]) => label)
        : [];
      const changed = [
        ...Object.entries(EDIT_LABELS)
          .filter(([k]) => k !== 'items' && k in c && !sameData(c[k], order[k]))
          .map(([, label]) => label),
        ...itemChanges,
      ];
      if (!changed.length) return state;
      const materialChange = itemChanges.includes('products / quantities') || (c.plantId && c.plantId !== order.plantId);
      const backToReview = materialChange && !['PENDING_REVIEW'].includes(order.status);
      let next = state;
      if (materialChange && order.materialsDeducted) {
        next = returnLots(next, order.materialLots);
        (order.materialLots ?? []).forEach((u) => (next = logStock(next, p, u.rmId, u.qty, `Returned from ${p.id} – order changed (batch ${u.batchNo})`)));
      }
      const status = backToReview ? 'PENDING_REVIEW' : order.status;
      const note = `Details changed: ${changed.join(', ')}${backToReview ? ' – back to factory review' : ''}${p.note ? ` · ${p.note}` : ''}`;
      next = updateOrder(next, p.id, (o) => ({
        ...o,
        ...c,
        ...(backToReview ? { status, approval: null, holdReason: null, holdCode: null, holdNote: '', materialsDeducted: false, materialLots: [] } : {}),
        history: [...o.history, event(status, p, note, { edit: true })],
      }));
      next = notify(next, p, {
        roles: ['factory', ...(order.status === QC_STEP ? ['qc'] : [])],
        orderId: p.id,
        message: `${p.id} changed by ${p.user.name}: ${changed.join(', ')}${backToReview ? ' – please review again' : ''}`,
      });
      // Factory review switched off: accept again straight away if the material is there.
      if (backToReview && !featureOn('review') && orderAvailability(next.orders.find((o) => o.id === p.id), next).ok) {
        return reducer(next, { type: 'REVIEW_ORDER', payload: { ...p, decision: 'accept', note: 'Accepted automatically after the change – raw material in stock' } });
      }
      return next;
    }

    case 'REVIEW_ORDER': {
      if (!order || !['PENDING_REVIEW', 'ON_HOLD'].includes(order.status)) return state;
      if (p.decision === 'hold') {
        const next = updateOrder(state, p.id, (o) => ({
          ...o,
          status: 'ON_HOLD',
          holdReason: p.note,
          holdCode: p.code ?? null,
          holdNote: p.extra ?? '',
          history: [...o.history, event('ON_HOLD', p, p.note)],
        }));
        return notify(next, p, { userId: order.createdBy, orderId: p.id, message: `${p.id} put ON HOLD by factory: ${p.note}` });
      }
      // Accept: re-verify stock in the order's factory, then issue raw material oldest batch first.
      const { rows, ok } = orderAvailability(order, state);
      if (!ok) return state;
      let next = state;
      const materialLots = [];
      rows.forEach((r) => {
        const res = issueFifo(next, r.rmId, order.plantId, r.required);
        next = res.state;
        res.used.forEach((u) => materialLots.push({ rmId: r.rmId, ...u }));
        next = logStock(next, p, r.rmId, -r.required, `Issued for ${p.id} · batch ${res.used.map((u) => u.batchNo).join(', ')}`);
      });
      next = updateOrder(next, p.id, (o) => ({
        // Marked as the acceptance (raw material issued here) – it is the first production stage when the admin left out "Accepted".
        ...enterStage(next, o, acceptStatus(), p, p.note || 'Raw material available – order accepted', { accepted: true }),
        holdReason: null,
        holdCode: null,
        holdNote: '',
        materialsDeducted: true,
        materialLots,
      }));
      next = notify(next, p, { userId: order.createdBy, orderId: p.id, message: `${p.id} ACCEPTED by factory` });
      return askApproval(next, p, p.id);
    }

    case 'ADVANCE_STAGE': {
      if (!order || kindOf(order.status) !== 'work' || NEXT_STAGE[order.status] !== p.to) return state;
      let next = updateOrder(state, p.id, (o) => enterStage(state, o, p.to, p, p.note));
      next = askApproval(next, p, p.id);
      // Whoever takes over after production is told once the order is really ready: now, or when the
      // supervisor approves the stage. Which team that is depends on the steps the admin switched on.
      const handOver = {
        [QC_STEP]: { roles: ['qc'], message: `${p.id} is ready for QC inspection` },
        [CUSTOMER_STEP]: { roles: [], message: `${p.id} – share it with ${order.customer.name} for approval` },
        CLIENT_APPROVED: { roles: ['factory'], message: `${p.id} is made – ready for dispatch` },
      }[p.to];
      if (handOver && !openApproval(next.orders.find((o) => o.id === p.id))) {
        next = notify(next, p, { ...handOver, userId: order.createdBy, orderId: p.id });
      }
      return next;
    }

    case 'QC_SUBMIT': {
      if (!order || order.status !== 'READY_TO_DISPATCH') return state;
      const passed = p.result === 'PASS';
      const status = passed ? NEXT_STAGE[QC_STEP] : reworkStage();
      let next = updateOrder(state, p.id, (o) => ({
        ...enterStage(state, o, status, p, `QC ${passed ? 'passed' : 'failed – sent back to production'}: ${p.remarks}`),
        qc: {
          result: p.result,
          checks: p.checks,
          inspectedQty: p.inspectedQty,
          remarks: p.remarks,
          code: p.code ?? null,
          note: p.note ?? '',
          photos: p.photos ?? [],
          rejectedQty: p.rejectedQty ?? 0,
          by: p.user.name,
          at: p.at,
        },
        // Pieces QC rejects are recorded as scrap / rework with the QC reason.
        scrap:
          p.rejectedQty > 0
            ? [...(o.scrap ?? []), { qty: p.rejectedQty, code: p.code ?? 'other', note: p.note ?? p.remarks, stage: 'qc', at: p.at, by: p.user.name }]
            : o.scrap,
      }));
      next = askApproval(next, p, p.id);
      return passed
        ? notify(next, p, {
            roles: status === CUSTOMER_STEP ? [] : ['factory'],
            userId: order.createdBy,
            orderId: p.id,
            message: `QC passed for ${p.id} – ${nextText(status, order)}`,
          })
        : notify(next, p, {
            roles: ['factory'],
            userId: order.createdBy,
            orderId: p.id,
            message: `QC FAILED for ${p.id}: ${p.remarks}`,
          });
    }

    case 'CLIENT_DECISION': {
      if (!order || order.status !== 'QC_APPROVED') return state;
      const status = p.approved ? NEXT_STAGE[CUSTOMER_STEP] : reworkStage();
      let next = updateOrder(state, p.id, (o) => ({
        ...enterStage(state, o, status, p, p.approved ? p.note : `Client raised concern – rework: ${p.note}`),
        clientApproval: p.approved ? { note: p.note, by: p.user.name, at: p.at } : o.clientApproval,
      }));
      next = askApproval(next, p, p.id);
      return notify(next, p, {
        roles: p.approved ? ['factory'] : ['factory', 'qc'],
        orderId: p.id,
        message: p.approved ? `${p.id} approved by client – ${nextText(status, order)}` : `Client concern on ${p.id}: ${p.note}`,
      });
    }

    case 'DISPATCH': {
      if (!order || order.status !== 'CLIENT_APPROVED') return state;
      const d = { ...p.dispatch, by: p.user.name, at: p.at };
      const next = updateOrder(state, p.id, (o) => ({
        ...enterStage(state, o, 'DISPATCHED', p, `${d.carrier} · Tracking ${d.trackingId}`),
        dispatch: d,
      }));
      return notify(next, p, {
        userId: order.createdBy,
        orderId: p.id,
        message: `${p.id} dispatched via ${d.carrier}. Tracking ID: ${d.trackingId}`,
      });
    }

    case 'DELIVER': {
      if (!order || order.status !== 'DISPATCHED') return state;
      return updateOrder(state, p.id, (o) => enterStage(state, o, 'DELIVERED', p, p.note || 'Delivered to customer'));
    }

    case 'APPROVE_STAGE':
    case 'REJECT_STAGE': {
      const a = order && openApproval(order);
      if (!a || a.state !== 'pending' || !can(p.user.role, 'stage.approve')) return state;
      if (p.user.role !== 'admin' && a.requestedById === p.user.id) return state;
      const approved = type === 'APPROVE_STAGE';
      const note = p.note?.trim() || (approved ? 'Stage approved' : 'Stage rejected');
      const next = updateOrder(state, p.id, (o) => ({
        ...o,
        approval: { ...a, state: approved ? 'approved' : 'rejected', decidedBy: p.user.name, decidedById: p.user.id, decidedAt: p.at, note },
        history: [...o.history, event(o.status, p, `${approved ? '✔ Approved' : '✖ Rejected'} – ${note}`, { approval: approved ? 'approved' : 'rejected' })],
      }));
      return notify(next, p, {
        roles: approved && order.status === 'READY_TO_DISPATCH' ? ['qc'] : [],
        userId: a.requestedById,
        orderId: p.id,
        message: `${p.id}: stage "${stageName(order.status)}" ${approved ? 'approved' : `rejected – ${note}`} by ${p.user.name}`,
      });
    }

    case 'RESUBMIT_STAGE': {
      const a = order && openApproval(order);
      if (!a || a.state !== 'rejected') return state;
      const next = updateOrder(state, p.id, (o) => ({
        ...o,
        approval: { status: o.status, state: 'pending', requestedBy: p.user.name, requestedById: p.user.id, at: p.at },
        history: [...o.history, event(o.status, p, `Sent again for approval${p.note ? ` – ${p.note}` : ''}`, { approval: 'requested' })],
      }));
      return askApproval(next, p, p.id);
    }

    case 'SEND_MESSAGE': {
      if (!order || !(p.text?.trim() || p.code)) return state;
      return postMessage(state, p, order, { code: p.code, text: p.text?.trim() ?? '' });
    }

    case 'REPORT_PROBLEM': {
      if (!order || order.status === 'DELIVERED') return state;
      const next = updateOrder(state, p.id, (o) => ({
        ...o,
        problem: { code: p.code, note: p.note ?? '', by: p.user.name, at: p.at },
      }));
      return postMessage(next, p, order, { kind: 'problem', code: `reason.${p.code}`, text: p.note ?? '' });
    }

    case 'REPORT_DELAY': {
      // Pushes the delivery date back by p.days, keeping the first promised date for reference.
      const days = Math.round(Number(p.days));
      if (!order || !isOpen(order) || !(days > 0) || !p.code) return state;
      if (!can(p.user.role, 'orders.delay')) return state;
      const from = order.expectedDeliveryDate;
      const to = addDays(from, days);
      const reason = [tr('en', `reason.${p.code}`), p.note?.trim()].filter(Boolean).join(' – ');
      const delay = { days, code: p.code, note: p.note?.trim() ?? '', from, to, by: p.user.name, byId: p.user.id, at: p.at };
      const next = updateOrder(state, p.id, (o) => ({
        ...o,
        originalDeliveryDate: o.originalDeliveryDate ?? from,
        expectedDeliveryDate: to,
        delays: [...(o.delays ?? []), delay],
        history: [...o.history, event(o.status, p, `⏳ Delayed ${days} days (${from} → ${to}): ${reason}`, { delay: true })],
      }));
      return notify(next, p, {
        userId: order.createdBy,
        orderId: p.id,
        message: `${p.id} for ${order.customer.name} delayed by ${days} days – new date ${to}. Reason: ${reason}`,
      });
    }

    case 'SOLVE_PROBLEM': {
      if (!order?.problem) return state;
      const next = updateOrder(state, p.id, (o) => ({ ...o, problem: null }));
      return postMessage(next, p, order, { kind: 'solved' });
    }

    case 'RESTOCK': {
      if (!can(p.user.role, 'inventory.manage') || !(p.qty > 0)) return state;
      const batchNo = p.batchNo?.trim() || `MAN-${p.at.slice(2, 10).replace(/-/g, '')}`;
      const next = addLot(state, { rmId: p.rmId, plantId: p.plantId, qty: p.qty, batchNo, source: p.note || 'Stock received', receivedAt: p.at });
      return logStock(next, p, p.rmId, p.qty, `${p.note || 'Stock received'} · ${plantName(state, p.plantId)} · batch ${batchNo}`);
    }

    case 'ADD_MATERIAL': {
      if (!can(p.user.role, 'inventory.manage')) return state;
      const id = `RM-${String(state.materials.length + 1).padStart(2, '0')}`;
      let next = { ...state, materials: [...state.materials, { ...p.material, id, stock: 0 }] };
      if (p.material.stock > 0) {
        next = addLot(next, { rmId: id, plantId: p.plantId, qty: p.material.stock, batchNo: `OPEN-${id}`, source: 'Opening stock', receivedAt: p.at });
        next = logStock(next, p, id, p.material.stock, `Opening stock · ${plantName(state, p.plantId)}`);
      }
      return next;
    }

    case 'TRANSFER_STOCK': {
      // Moves material between factories, keeping its batch numbers.
      if (!can(p.user.role, 'inventory.manage') || p.from === p.to || !(p.qty > 0)) return state;
      const res = issueFifo(state, p.rmId, p.from, p.qty);
      if (!res.used.length) return state;
      let next = res.state;
      res.used.forEach((u) => {
        next = addLot(next, { rmId: p.rmId, plantId: p.to, qty: u.qty, batchNo: u.batchNo, source: `Transfer from ${plantName(state, p.from)}`, receivedAt: p.at });
      });
      next = logStock(next, p, p.rmId, -p.qty, `Transfer ${plantName(state, p.from)} → ${plantName(state, p.to)}`);
      return logStock(next, p, p.rmId, p.qty, `Received from ${plantName(state, p.from)} at ${plantName(state, p.to)}`);
    }

    case 'MARK_ALL_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          p.ids.includes(n.id) && !n.readBy.includes(p.user.id) ? { ...n, readBy: [...n.readBy, p.user.id] } : n,
        ),
      };

    // ---- Purchasing: supplier purchase orders for raw material ----
    case 'CREATE_PURCHASE': {
      if (!can(p.user.role, 'purchase.manage') || !p.purchase.items.length) return state;
      const n = state.counters.purchase + 1;
      const po = {
        ...p.purchase,
        id: `PUR-${new Date(p.at).getFullYear()}-${String(n).padStart(4, '0')}`,
        status: 'SENT',
        createdAt: p.at,
        createdBy: p.user.name,
      };
      const next = { ...state, counters: { ...state.counters, purchase: n }, purchases: [po, ...state.purchases] };
      const supplier = state.suppliers.find((s) => s.id === po.supplierId);
      return notify(next, p, { roles: ['factory'], message: `${po.id} raised to ${supplier?.name} – expected ${po.expectedDate}` });
    }

    case 'RECEIVE_PURCHASE': {
      const po = state.purchases.find((x) => x.id === p.purchaseId);
      if (!po || po.status !== 'SENT' || !can(p.user.role, 'purchase.manage')) return state;
      // One delivery: per material the quantity accepted at incoming inspection and the quantity rejected.
      const lines = p.lines.filter((l) => l.accepted > 0 || l.rejected > 0);
      if (!lines.length && !p.close) return state;
      const batchNo = p.batchNo?.trim() || `${po.id}-${(po.receipts?.length ?? 0) + 1}`;
      const receipt = { at: p.at, by: p.user.name, batchNo, lines, ...(po.shipment && { shipment: po.shipment }) };
      // The shipment has arrived: it is kept on the receipt and the PO waits for the next one (if any).
      const updated = { ...po, shipment: null, receipts: [...(po.receipts ?? []), receipt] };
      const complete = poRemaining(updated).every((i) => i.qty <= 0);
      const status = complete ? 'RECEIVED' : p.close ? 'CLOSED' : 'SENT';
      let next = { ...state, purchases: state.purchases.map((x) => (x.id === po.id ? { ...updated, status } : x)) };
      lines.forEach((l) => {
        if (l.accepted > 0) {
          next = addLot(next, { rmId: l.rmId, plantId: po.plantId, qty: l.accepted, batchNo, source: `${po.id}`, poId: po.id, receivedAt: p.at });
          next = logStock(next, p, l.rmId, l.accepted, `Received ${po.id} · ${plantName(state, po.plantId)} · batch ${batchNo}`);
        }
      });
      // Orders this delivery unblocked: short of material before, enough now.
      const ready = state.orders
        .filter((o) => ['PENDING_REVIEW', 'ON_HOLD'].includes(o.status) && !orderAvailability(o, state).ok && orderAvailability(o, next).ok)
        .map((o) => o.id);
      const rejected = lines.filter((l) => l.rejected > 0);
      const what = complete ? 'received in full' : p.close ? 'closed short' : 'part received';
      return notify(next, p, {
        roles: ['factory'],
        message: `${po.id} ${what}${rejected.length ? ` – ${rejected.map((l) => `${l.rejected} rejected (${l.reason || 'inspection'})`).join(', ')}` : ''}${ready.length ? ` – material now available for ${ready.join(', ')}` : ''}`,
      });
    }

    case 'PURCHASE_SHIPPED': {
      // The supplier has dispatched: transporter, LR / tracking number and expected arrival.
      const po = state.purchases.find((x) => x.id === p.purchaseId);
      if (!po || po.status !== 'SENT' || !can(p.user.role, 'purchase.manage') || !p.shipment.trackingId?.trim()) return state;
      const shipment = { ...p.shipment, trackingId: p.shipment.trackingId.trim(), at: p.at, by: p.user.name };
      const next = { ...state, purchases: state.purchases.map((x) => (x.id === po.id ? { ...x, shipment } : x)) };
      const supplier = state.suppliers.find((s) => s.id === po.supplierId);
      return notify(next, p, {
        roles: ['factory'],
        message: `${po.id} from ${supplier?.name} is in transit – ${shipment.carrier} ${shipment.trackingId}, arriving ${shipment.eta}`,
      });
    }

    case 'CANCEL_PURCHASE':
      if (!can(p.user.role, 'purchase.manage')) return state;
      return {
        ...state,
        purchases: state.purchases.map((x) =>
          x.id === p.purchaseId && x.status === 'SENT' ? { ...x, status: 'CANCELLED', cancelledAt: p.at, cancelledBy: p.user.name, cancelNote: p.note ?? '' } : x,
        ),
      };

    // ---- Machines: breakdowns and maintenance ----
    case 'MACHINE_DOWN':
    case 'MACHINE_UP':
    case 'MAINTENANCE_DONE': {
      const m = state.machines.find((x) => x.id === p.machineId);
      if (!m || !can(p.user.role, 'machines.manage')) return state;
      const down = m.downtime.some((d) => !d.to);
      let changed;
      if (type === 'MACHINE_DOWN' && !down) changed = { ...m, downtime: [...m.downtime, { from: p.at, to: null, reason: p.reason, by: p.user.name }] };
      else if (type === 'MACHINE_UP' && down) changed = { ...m, downtime: m.downtime.map((d) => (d.to ? d : { ...d, to: p.at, fixedBy: p.user.name })) };
      else if (type === 'MAINTENANCE_DONE')
        changed = { ...m, lastMaintenance: p.at.slice(0, 10), maintenanceLog: [{ at: p.at, by: p.user.name, note: p.note ?? '' }, ...m.maintenanceLog] };
      if (!changed) return state;
      const next = { ...state, machines: state.machines.map((x) => (x.id === m.id ? changed : x)) };
      if (type !== 'MACHINE_DOWN') return next;
      return notify(next, p, { roles: ['factory', 'supervisor'], message: `${m.name} is DOWN: ${p.reason}` });
    }

    // ---- The customer answering from the tracking page (no app login) ----
    case 'CUSTOMER_DECISION': {
      if (!order || order.status !== 'QC_APPROVED') return state;
      const customer = { id: 'customer', name: `${order.customer.contact || order.customer.name} (customer)`, role: 'customer' };
      return reducer(state, { type: 'CLIENT_DECISION', payload: { ...p, user: customer } });
    }

    // ---- Job work: a process done by an outside workshop ----
    case 'SEND_JOB_WORK': {
      if (!order || !isOpen(order) || !can(p.user.role, 'production.update')) return state;
      const n = (state.counters.jobWork ?? 0) + 1;
      const worker = state.jobWorkers.find((w) => w.id === p.workerId);
      const job = {
        id: `JW-${String(n).padStart(4, '0')}`,
        process: p.process,
        workerId: p.workerId,
        qty: p.qty,
        challanNo: p.challanNo?.trim() || `JW-${String(n).padStart(4, '0')}`,
        expectedBack: p.expectedBack,
        status: 'OUT',
        sentAt: p.at,
        sentBy: p.user.name,
      };
      const next = { ...updateOrder(state, p.id, (o) => ({ ...o, jobWork: [...(o.jobWork ?? []), job] })), counters: { ...state.counters, jobWork: n } };
      return notify(next, p, { userId: order.createdBy, roles: ['supervisor'], orderId: p.id, message: `${p.id}: ${p.qty} pcs sent to ${worker?.name} for job work (back by ${p.expectedBack})` });
    }

    case 'RETURN_JOB_WORK': {
      if (!order || !can(p.user.role, 'production.update')) return state;
      return updateOrder(state, p.id, (o) => ({
        ...o,
        jobWork: (o.jobWork ?? []).map((j) =>
          j.id === p.jobId && j.status === 'OUT'
            ? { ...j, status: 'DONE', returnedAt: p.at, returnedBy: p.user.name, okQty: p.okQty, rejectedQty: p.rejectedQty, note: p.note ?? '' }
            : j,
        ),
        scrap: p.rejectedQty > 0 ? [...(o.scrap ?? []), { qty: p.rejectedQty, code: 'damaged', note: `Rejected after job work ${p.jobId}${p.note ? ` – ${p.note}` : ''}`, stage: 'jobwork', at: p.at, by: p.user.name }] : o.scrap,
      }));
    }

    // ---- Scrap / rejections reported on the shop floor ----
    case 'REPORT_SCRAP':
      if (!order || !(p.qty > 0)) return state;
      return updateOrder(state, p.id, (o) => ({
        ...o,
        scrap: [...(o.scrap ?? []), { qty: p.qty, code: p.code, note: p.note ?? '', stage: o.status, at: p.at, by: p.user.name }],
      }));

    // ---- Labour time: operators start / stop work on a process ----
    case 'START_WORK':
      if (!order || (order.timeLogs ?? []).some((t) => !t.end && t.byId === p.user.id)) return state;
      return updateOrder(state, p.id, (o) => ({
        ...o,
        timeLogs: [...(o.timeLogs ?? []), { id: `T${(o.timeLogs?.length ?? 0) + 1}`, process: p.process, by: p.user.name, byId: p.user.id, start: p.at, end: null }],
      }));

    case 'STOP_WORK':
      if (!order) return state;
      return updateOrder(state, p.id, (o) => ({
        ...o,
        timeLogs: (o.timeLogs ?? []).map((t) => (t.id === p.logId && !t.end ? { ...t, end: p.at, qty: p.qty ?? null } : t)),
      }));

    // ---- Setup (master data) ----
    case 'SAVE_MASTER': {
      if (!can(p.user.role, 'setup.manage') || !MASTER_KINDS[p.kind]) return state;
      const list = state[p.kind];
      const exists = p.item.id && list.some((x) => x.id === p.item.id);
      const n = state.counters.master + 1;
      const item = exists ? p.item : { ...MASTER_KINDS[p.kind].blank, ...p.item, id: MASTER_KINDS[p.kind].newId(list, n) };
      return {
        ...state,
        counters: exists ? state.counters : { ...state.counters, master: n },
        [p.kind]: exists ? list.map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [...list, item],
      };
    }

    case 'DELETE_MASTER':
      if (!can(p.user.role, 'setup.manage') || !MASTER_KINDS[p.kind]) return state;
      return { ...state, [p.kind]: state[p.kind].filter((x) => x.id !== p.itemId) };

    // Machine processes: { key: { label, removed? } }. A process still used by a machine, job worker or product route stays.
    case 'SAVE_PROCESSES':
      if (!can(p.user.role, 'setup.manage')) return state;
      return { ...state, processes: p.processes };

    case 'SET_CALENDAR':
      if (!can(p.user.role, 'setup.manage')) return state;
      return { ...state, settings: { ...state.settings, calendar: p.calendar } };

    // ---- Factories ----
    case 'SET_ORDER_PLANT':
      if (!order || !can(p.user.role, 'plants.manage') || !state.plants.some((x) => x.id === p.plantId)) return state;
      return updateOrder(state, p.id, (o) => ({ ...o, plantId: p.plantId }));

    // ---- Administrator settings ----
    case 'SET_LABELS':
      if (p.user.role !== 'admin') return state;
      return { ...state, settings: { ...state.settings, labels: p.labels } };

    case 'SET_ACCESS': {
      if (p.user.role !== 'admin' || p.role === 'admin') return state;
      const roles = rolesFor(p.perm).filter((r) => r !== p.role);
      return { ...state, settings: { ...state.settings, access: { ...state.settings.access, [p.perm]: p.on ? [...roles, p.role] : roles } } };
    }

    case 'SET_APPROVAL_STAGES':
      if (p.user.role !== 'admin') return state;
      return { ...state, settings: { ...state.settings, approvalStages: APPROVAL_STAGES.filter((s) => p.stages.includes(s)) } };

    // The whole order journey from the stage editor, saved at once:
    // - journey: the steps between "order received" and "ready to dispatch", in order:
    //   [{ key?, kind: 'work' | 'qc' | 'customer', name, approve }]. New work steps get a key here; a step left
    //   out is kept as "removed" so old history still shows its name.
    // - names: the admin's names for "order received", "ready to dispatch", "sent" and "delivered".
    // - steps: the factory review and delivery confirmation switches ({ review, delivery }).
    // - fixedApprovals: sign-off on "ready to dispatch".
    // Refused if a work order is still at a step being removed.
    case 'SET_STAGES': {
      if (p.user.role !== 'admin') return state;
      const names = p.journey.map((s) => s.name.trim());
      const kinds = p.journey.map((s) => s.kind);
      if (!kinds.includes('work') || kinds.filter((k) => k === 'qc').length > 1 || kinds.filter((k) => k === 'customer').length > 1) return state;
      if (names.some((x) => !x) || new Set(names.map((x) => x.toLowerCase())).size !== names.length) return state;
      let n = state.counters.stage ?? 0;
      const journey = p.journey.map((s, i) => ({
        key: s.kind === 'qc' ? QC_STEP : s.kind === 'customer' ? CUSTOMER_STEP : s.key || `STAGE_${++n}`,
        kind: s.kind,
        name: names[i],
      }));
      const old = journeyOf(state.settings.workflow);
      const gone = old.filter((s) => !journey.some((x) => x.key === s.key));
      if (state.orders.some((o) => gone.some((s) => s.key === o.status))) return state;
      const removed = [...(state.settings.workflow?.removed ?? []).filter((r) => !journey.some((x) => x.key === r.key)), ...gone];
      // Each step carries its own "needs sign-off" choice.
      const approvalStages = [...(p.fixedApprovals ?? []), ...journey.filter((s, i) => p.journey[i].approve).map((s) => s.key)];
      return {
        ...state,
        counters: { ...state.counters, stage: n },
        settings: {
          ...state.settings,
          workflow: { journey, removed, names: p.names ?? state.settings.workflow?.names ?? {} },
          // QC and customer approval are on while the journey has those steps (their permissions follow).
          features: { ...state.settings.features, ...(p.steps ?? {}), qc: kinds.includes('qc'), clientApproval: kinds.includes('customer') },
          approvalStages: [...new Set(approvalStages)],
        },
      };
    }

    // Module switches.
    case 'SET_FEATURE':
      if (p.user.role !== 'admin') return state;
      return { ...state, settings: { ...state.settings, features: { ...state.settings.features, [p.key]: p.on } } };

    // Extra fields on the work order form: [{ id, label, type: 'text' | 'number' | 'date' | 'select', options, required }].
    case 'SET_ORDER_FIELDS':
      if (p.user.role !== 'admin') return state;
      return { ...state, settings: { ...state.settings, orderFields: p.fields } };

    // Pick-lists: reasons per list, the admin's own reasons, QC checklist, vehicles / couriers / transporters.
    case 'SET_LISTS':
      if (p.user.role !== 'admin') return state;
      return { ...state, settings: { ...state.settings, lists: { ...state.settings.lists, ...p.lists } } };

    // ---- People who can sign in ----
    case 'SAVE_USER': {
      if (p.user.role !== 'admin' || !ROLES[p.person.role]) return state;
      const person = { ...p.person, name: p.person.name.trim(), email: p.person.email.trim().toLowerCase() };
      if (!person.name || state.users.some((u) => u.id !== person.id && u.email === person.email)) return state;
      const others = state.users.filter((u) => u.id !== person.id);
      // There must always be an administrator left.
      if (person.role !== 'admin' && !others.some((u) => u.role === 'admin')) return state;
      if (!person.id) {
        const n = (state.counters.user ?? 0) + 1;
        return { ...state, counters: { ...state.counters, user: n }, users: [...state.users, { ...person, id: `u-${n}` }] };
      }
      return { ...state, users: state.users.map((u) => (u.id === person.id ? person : u)) };
    }

    case 'DELETE_USER': {
      if (p.user.role !== 'admin' || p.id === p.user.id) return state;
      const users = state.users.filter((u) => u.id !== p.id);
      if (!users.some((u) => u.role === 'admin')) return state;
      return { ...state, users };
    }

    case 'RESET':
      return createSeedState();

    default:
      return state;
  }
}

// Confirmation message shown after each action, in the user's language.
const TOASTS = {
  CREATE_ORDER: (p, t) => t('toast.create', { id: p.order.id }),
  REVIEW_ORDER: (p, t) => t(p.decision === 'accept' ? 'toast.accept' : 'toast.hold', { id: p.id }),
  ADVANCE_STAGE: (p, t) => t('toast.advance', { id: p.id, stage: t(`flow.${p.to}`) }),
  QC_SUBMIT: (p, t) => t(p.result === 'PASS' ? 'toast.qcPass' : 'toast.qcFail', { id: p.id }),
  CLIENT_DECISION: (p, t) => t(p.approved ? 'toast.clientOk' : 'toast.clientNo', { id: p.id }),
  DISPATCH: (p, t) => t('toast.dispatch', { id: p.id, tid: p.dispatch.trackingId }),
  DELIVER: (p, t) => t('toast.deliver', { id: p.id }),
  APPROVE_STAGE: (p, t) => t('toast.approved', { id: p.id }),
  REJECT_STAGE: (p, t) => t('toast.rejected', { id: p.id }),
  RESUBMIT_STAGE: (p, t) => t('toast.resubmit', { id: p.id }),
  SEND_MESSAGE: (p, t) => t('toast.message'),
  REPORT_PROBLEM: (p, t) => t('toast.problem'),
  REPORT_DELAY: (p, t) => t('toast.delay', { id: p.id, n: p.days }),
  SOLVE_PROBLEM: (p, t) => t('toast.solved'),
  RESTOCK: (p, t) => t('toast.restock'),
  CREATE_PURCHASE: () => 'Purchase order raised',
  RECEIVE_PURCHASE: (p) => `${p.purchaseId} received – stock updated`,
  CANCEL_PURCHASE: (p) => `${p.purchaseId} cancelled`,
  PURCHASE_SHIPPED: (p) => `${p.purchaseId} marked in transit`,
  MACHINE_DOWN: () => 'Machine marked as down',
  MACHINE_UP: () => 'Machine is running again',
  MAINTENANCE_DONE: () => 'Maintenance recorded',
  SET_ORDER_PLANT: (p) => `${p.id} moved to another factory`,
  UPDATE_ORDER: (p) => `${p.id} updated`,
  TRANSFER_STOCK: () => 'Stock transferred',
  SEND_JOB_WORK: (p) => `${p.id} sent for job work`,
  RETURN_JOB_WORK: () => 'Job work received back',
  REPORT_SCRAP: (p) => `${p.qty} pcs recorded as scrap`,
  START_WORK: () => 'Work started – timer running',
  STOP_WORK: () => 'Work stopped – time saved',
  SAVE_MASTER: () => 'Saved',
  DELETE_MASTER: () => 'Deleted',
  SET_CALENDAR: () => 'Working calendar saved',
  SAVE_PROCESSES: () => 'Processes saved',
  CUSTOMER_DECISION: (p) => (p.approved ? 'Thank you – approved, we will dispatch' : 'Thank you – your concern was sent to the factory'),
  ADD_MATERIAL: (p, t) => t('toast.addMaterial', { name: p.material.name }),
  SET_LABELS: (p, t) => t('toast.saved'),
  SET_APPROVAL_STAGES: (p, t) => t('toast.saved'),
  SET_STAGES: () => 'Production stages saved',
  SET_FEATURE: (p) => (p.on ? 'Module switched on' : 'Module switched off'),
  SET_ORDER_FIELDS: () => 'Work order fields saved',
  SET_LISTS: () => 'Lists saved',
  SAVE_USER: (p) => (p.person.id ? `${p.person.name} updated` : `${p.person.name} added`),
  DELETE_USER: () => 'User removed',
  RESET: (p, t) => t('toast.reset'),
};
const ERROR_TOASTS = (type, p) =>
  (type === 'QC_SUBMIT' && p.result !== 'PASS') || ['REPORT_PROBLEM', 'REJECT_STAGE', 'MACHINE_DOWN', 'REPORT_SCRAP'].includes(type);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, setOverrides } = useLang();

  // The administrator's access changes apply before any child checks a permission in this render.
  setAccessOverrides(state.settings.access);
  // Modules switched off and the production stages the administrator set up, likewise.
  setFeatures(state.settings.features);
  setWorkflow(state.settings.workflow);
  setReasonLists(state.settings.lists);
  setProcesses(state.processes);
  // People list: shared with the sign-in code after each change.
  useEffect(() => setUsers(state.users), [state.users]);

  // Section names chosen by the administrator replace the default labels for every role.
  useEffect(() => setOverrides(state.settings.labels), [state.settings.labels, setOverrides]);

  const warnedFull = useRef(false);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      warnedFull.current = false;
    } catch {
      // Usually full storage (QC photos are the big items). Changes stay on screen but are not saved.
      if (!warnedFull.current) toast('Could not save – browser storage is full. Remove some QC photos or reset demo data.', 'error');
      warnedFull.current = true;
    }
  }, [state, toast]);

  // Which factory the person is looking at ('all' or a plant id) – a per-browser view choice.
  const [plant, setPlantState] = useState(() => {
    try {
      return localStorage.getItem(PLANT_KEY) || 'all';
    } catch {
      return 'all';
    }
  });
  const setPlant = useCallback((id) => {
    try {
      localStorage.setItem(PLANT_KEY, id);
    } catch {
      /* ignore */
    }
    setPlantState(id);
  }, []);

  // Every action is stamped with the acting user and time.
  const act = useCallback(
    (type, payload = {}) => {
      dispatch({ type, payload: { ...payload, user, at: new Date().toISOString() } });
      const message = TOASTS[type]?.(payload, t);
      if (message) toast(message, ERROR_TOASTS(type, payload) ? 'error' : 'success');
    },
    [user, toast, t],
  );

  const value = useMemo(() => ({ state, act, plant, setPlant }), [state, act, plant, setPlant]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}

/** Orders the current user may see: sales persons only see their own work orders; all of them limited to the chosen factory. */
export function useVisibleOrders() {
  const { state, plant } = useStore();
  const { user } = useAuth();
  return useMemo(
    () =>
      state.orders.filter(
        (o) => (can(user?.role, 'orders.viewAll') || o.createdBy === user?.id) && (plant === 'all' || o.plantId === plant),
      ),
    [state.orders, state.settings, user, plant],
  );
}

/** Forecast for every open order (when it will be ready, and the late risk), recomputed when data changes. */
export function usePlan() {
  const { state } = useStore();
  return useMemo(() => {
    const plan = buildPlan(state);
    const risk = Object.fromEntries(state.orders.map((o) => [o.id, riskOf(o, plan, state)]));
    return { plan, risk };
  }, [state]);
}

/** Machines in the chosen factory. */
export function useVisibleMachines() {
  const { state, plant } = useStore();
  return useMemo(() => state.machines.filter((m) => plant === 'all' || m.plantId === plant), [state.machines, plant]);
}

export function useNotifications() {
  const { state } = useStore();
  const { user } = useAuth();
  return useMemo(
    () =>
      state.notifications.filter(
        (n) => user && (user.role === 'admin' || n.roles.includes(user.role) || n.userId === user.id),
      ),
    [state.notifications, user],
  );
}
