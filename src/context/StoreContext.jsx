import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { createSeedState } from '../data/seed';
import { APPROVAL_STAGES, NEXT_STAGE, STATUS, openApproval } from '../data/statuses';
import { useToast } from './ToastContext';
import { can, rolesFor, setAccessOverrides } from '../auth/permissions';
import { checkAvailability, round } from '../utils';
import { useAuth } from './AuthContext';
import { tr, useLang } from '../i18n';

// All app data lives here and is persisted to localStorage.
// Swap the reducer's actions for API calls when a backend is added.

const STORAGE_KEY = 'unifiedtree-scm-v2';
const StoreContext = createContext(null);

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const s = JSON.parse(saved);
      return { ...s, settings: { ...createSeedState().settings, ...s.settings } };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return createSeedState();
}

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
function enterStage(state, o, status, p, note = '') {
  const needs = state.settings.approvalStages.includes(status);
  return {
    ...o,
    status,
    approval: needs ? { status, state: 'pending', requestedBy: p.user.name, requestedById: p.user.id, at: p.at } : null,
    history: [...o.history, event(status, p, note)],
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
      return notify(next, p, {
        roles: ['factory'],
        orderId: o.id,
        message: `New work order ${o.id} from ${o.customer.name} awaiting factory review`,
      });
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
      // Accept: re-verify stock, then consume raw material for this order.
      const { rows, ok } = checkAvailability(order.items, state.products, state.materials);
      if (!ok) return state;
      let next = {
        ...state,
        materials: state.materials.map((m) => {
          const r = rows.find((x) => x.rmId === m.id);
          return r ? { ...m, stock: round(m.stock - r.required) } : m;
        }),
      };
      rows.forEach((r) => (next = logStock(next, p, r.rmId, -r.required, `Issued for ${p.id}`)));
      next = updateOrder(next, p.id, (o) => ({
        ...enterStage(next, o, 'ACCEPTED', p, p.note || 'Raw material available – order accepted'),
        holdReason: null,
        holdCode: null,
        holdNote: '',
        materialsDeducted: true,
      }));
      next = notify(next, p, { userId: order.createdBy, orderId: p.id, message: `${p.id} ACCEPTED by factory` });
      return askApproval(next, p, p.id);
    }

    case 'ADVANCE_STAGE': {
      if (!order || NEXT_STAGE[order.status] !== p.to) return state;
      let next = updateOrder(state, p.id, (o) => enterStage(state, o, p.to, p, p.note));
      next = askApproval(next, p, p.id);
      // QC is told once the order is really ready: now, or when the supervisor approves the stage.
      if (p.to === 'READY_TO_DISPATCH' && !openApproval(next.orders.find((o) => o.id === p.id))) {
        next = notify(next, p, {
          roles: ['qc'],
          userId: order.createdBy,
          orderId: p.id,
          message: `${p.id} is ready to dispatch – QC inspection required`,
        });
      }
      return next;
    }

    case 'QC_SUBMIT': {
      if (!order || order.status !== 'READY_TO_DISPATCH') return state;
      const passed = p.result === 'PASS';
      const status = passed ? 'QC_APPROVED' : 'IN_PRODUCTION';
      let next = updateOrder(state, p.id, (o) => ({
        ...enterStage(state, o, status, p, `QC ${passed ? 'passed' : 'failed – sent back to production'}: ${p.remarks}`),
        qc: {
          result: p.result,
          checks: p.checks,
          inspectedQty: p.inspectedQty,
          remarks: p.remarks,
          code: p.code ?? null,
          note: p.note ?? '',
          by: p.user.name,
          at: p.at,
        },
      }));
      next = askApproval(next, p, p.id);
      return passed
        ? notify(next, p, {
            userId: order.createdBy,
            orderId: p.id,
            message: `QC passed for ${p.id} – share report with ${order.customer.name}`,
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
      const status = p.approved ? 'CLIENT_APPROVED' : 'IN_PRODUCTION';
      let next = updateOrder(state, p.id, (o) => ({
        ...enterStage(state, o, status, p, p.approved ? p.note : `Client raised concern – rework: ${p.note}`),
        clientApproval: p.approved ? { note: p.note, by: p.user.name, at: p.at } : o.clientApproval,
      }));
      next = askApproval(next, p, p.id);
      return notify(next, p, {
        roles: p.approved ? ['factory'] : ['factory', 'qc'],
        orderId: p.id,
        message: p.approved ? `${p.id} approved by client – ready for dispatch` : `Client concern on ${p.id}: ${p.note}`,
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

    case 'SOLVE_PROBLEM': {
      if (!order?.problem) return state;
      const next = updateOrder(state, p.id, (o) => ({ ...o, problem: null }));
      return postMessage(next, p, order, { kind: 'solved' });
    }

    case 'RESTOCK': {
      const next = {
        ...state,
        materials: state.materials.map((m) => (m.id === p.rmId ? { ...m, stock: round(m.stock + p.qty) } : m)),
      };
      return logStock(next, p, p.rmId, p.qty, p.note || 'Stock received');
    }

    case 'ADD_MATERIAL': {
      const id = `RM-${String(state.materials.length + 1).padStart(2, '0')}`;
      const next = { ...state, materials: [...state.materials, { ...p.material, id }] };
      return logStock(next, p, id, p.material.stock, 'Opening stock');
    }

    case 'MARK_ALL_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          p.ids.includes(n.id) && !n.readBy.includes(p.user.id) ? { ...n, readBy: [...n.readBy, p.user.id] } : n,
        ),
      };

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
  SOLVE_PROBLEM: (p, t) => t('toast.solved'),
  RESTOCK: (p, t) => t('toast.restock'),
  ADD_MATERIAL: (p, t) => t('toast.addMaterial', { name: p.material.name }),
  SET_LABELS: (p, t) => t('toast.saved'),
  SET_APPROVAL_STAGES: (p, t) => t('toast.saved'),
  RESET: (p, t) => t('toast.reset'),
};
const ERROR_TOASTS = (type, p) =>
  (type === 'QC_SUBMIT' && p.result !== 'PASS') || type === 'REPORT_PROBLEM' || type === 'REJECT_STAGE';

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, setOverrides } = useLang();

  // The administrator's access changes apply before any child checks a permission in this render.
  setAccessOverrides(state.settings.access);

  // Section names chosen by the administrator replace the default labels for every role.
  useEffect(() => setOverrides(state.settings.labels), [state.settings.labels, setOverrides]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }, [state]);

  // Every action is stamped with the acting user and time.
  const act = useCallback(
    (type, payload = {}) => {
      dispatch({ type, payload: { ...payload, user, at: new Date().toISOString() } });
      const message = TOASTS[type]?.(payload, t);
      if (message) toast(message, ERROR_TOASTS(type, payload) ? 'error' : 'success');
    },
    [user, toast, t],
  );

  const value = useMemo(() => ({ state, act }), [state, act]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}

/** Orders the current user may see: sales persons only see their own work orders. */
export function useVisibleOrders() {
  const { state } = useStore();
  const { user } = useAuth();
  return useMemo(
    () => (can(user?.role, 'orders.viewAll') ? state.orders : state.orders.filter((o) => o.createdBy === user?.id)),
    [state.orders, state.settings, user],
  );
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
