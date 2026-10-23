// The question box: understands everyday questions about orders, customers, stock, machines and purchases,
// and answers from the app's own data. Keyword based (English and common Hindi words) – no AI service needed.

import { PROCESSES } from './processes';
import { RISK_LABEL, machineIsDown, maintenanceStatus } from './planning';
import { STATUS, isDelayed, isOpen, nextStep, openApproval } from './statuses';
import { customerList, customerPath } from './customers';
import { addDays, fmtDate, orderUnits, todayISO } from '../utils';
import { orderAvailability } from './stock';

export const EXAMPLES = [
  'Which orders will be late this month?',
  'Status of WO-2026-0004',
  'Orders for Apex Industries',
  'Which raw materials are low?',
  'Which machines are down?',
  'Orders waiting for approval',
  'Top customers this month',
  'Open purchase orders',
  'Raw material in transit',
];

const has = (q, words) => words.some((w) => q.includes(w));
const iso = (d) => d.toISOString().slice(0, 10);

/** "today", "this week", "last month"… → [from, to], or null when no time is mentioned. */
function timeRange(q) {
  const t = todayISO();
  const now = new Date();
  if (has(q, ['today', 'आज'])) return [t, t, 'today'];
  if (has(q, ['yesterday', 'कल'])) return [addDays(t, -1), addDays(t, -1), 'yesterday'];
  const monday = addDays(t, -((now.getDay() + 6) % 7));
  if (has(q, ['last week'])) return [addDays(monday, -7), addDays(monday, -1), 'last week'];
  if (has(q, ['this week', 'week'])) return [monday, addDays(monday, 6), 'this week'];
  const first = `${t.slice(0, 8)}01`;
  if (has(q, ['last month', 'previous month', 'पिछले महीने'])) {
    const lastPrev = addDays(first, -1);
    return [`${lastPrev.slice(0, 8)}01`, lastPrev, 'last month'];
  }
  if (has(q, ['this month', 'month', 'महीने'])) return [first, iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)), 'this month'];
  if (has(q, ['this year', 'financial year', 'fy'])) {
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return [`${y}-04-01`, `${y + 1}-03-31`, 'this financial year'];
  }
  return null;
}

const orderItem = (o, sub) => ({ to: `/orders/${o.id}`, label: `${o.id} · ${o.customer.name}`, sub });

/**
 * Answers a question. ctx = { orders (visible to the user), state, risk (per order id) }.
 * Returns { title, text, items: [{ to, label, sub }] }.
 */
export function answer(question, { orders, state, risk }) {
  const q = ` ${question.toLowerCase().trim()} `;
  if (!q.trim()) return null;
  const range = timeRange(q);
  const inDue = (o) => !range || (o.expectedDeliveryDate >= range[0] && o.expectedDeliveryDate <= range[1]);
  const inCreated = (o) => !range || (o.createdAt.slice(0, 10) >= range[0] && o.createdAt.slice(0, 10) <= range[1]);
  const when = range ? ` ${range[2]}` : '';
  const customers = customerList(orders);
  const customer = customers.find((c) => q.includes(c.name.toLowerCase()) || q.includes(` ${c.name.toLowerCase().split(' ')[0]} `));
  const forCustomer = (o) => !customer || o.customer.name === customer.name;
  const who = customer ? ` for ${customer.name}` : '';

  // A specific work order.
  const idMatch = q.match(/wo[-\s]?(\d{4})[-\s]?(\d{1,4})/);
  if (idMatch) {
    const id = `WO-${idMatch[1]}-${idMatch[2].padStart(4, '0')}`;
    const o = orders.find((x) => x.id === id);
    if (!o) return { title: `${id} not found`, text: 'It may not exist, or it belongs to another sales person or factory.', items: [] };
    const r = risk[o.id];
    const step = nextStep(o);
    return {
      title: `${o.id} · ${o.customer.name}`,
      text: [
        `Stage: ${STATUS[o.status].label}.`,
        `Promised: ${fmtDate(o.expectedDeliveryDate)}${o.delays?.length ? ` (moved; first promised ${fmtDate(o.originalDeliveryDate)})` : ''}.`,
        r ? `Forecast: ${RISK_LABEL[r.level]}${r.forecast ? `, ready by ${fmtDate(r.forecast)}` : ''}.` : '',
        step ? `Next: ${step.text}.` : '',
        o.problem ? 'There is an open problem on the shop floor.' : '',
      ]
        .filter(Boolean)
        .join(' '),
      items: [orderItem(o, `${orderUnits(o)} units · last update by ${o.history.at(-1).by}`), ...(r?.reasons ?? []).map((x) => ({ label: x }))],
    };
  }

  // Late / at risk.
  if (has(q, ['late', 'delay', 'behind', 'risk', 'slip', 'देर', 'देरी'])) {
    const list = orders
      .filter((o) => isOpen(o) && forCustomer(o) && inDue(o) && (isDelayed(o) || ['high', 'late'].includes(risk[o.id]?.level)))
      .sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));
    return {
      title: `${list.length} work order${list.length === 1 ? '' : 's'} late or likely late${who}${when}`,
      text: list.length ? 'Already past the date, delayed, or forecast after the promised date. Reasons are listed under each.' : 'Nothing is late or forecast to be late. 🎉',
      items: list.map((o) => {
        const r = risk[o.id];
        return orderItem(o, `${RISK_LABEL[r?.level] ?? 'Delayed'} · due ${fmtDate(o.expectedDeliveryDate)}${r?.reasons[0] ? ` · ${r.reasons[0]}` : ''}`);
      }),
    };
  }

  // Raw material on the way from suppliers.
  if (has(q, ['transit', 'tracking', 'shipment', 'on the way', ' lr', 'रास्ते'])) {
    const moving = state.purchases.filter((p) => p.status === 'SENT' && p.shipment);
    return {
      title: `${moving.length} purchase order${moving.length === 1 ? '' : 's'} in transit`,
      text: moving.length ? 'Shipped by the supplier and on the way to the factory.' : 'Nothing is on the road right now.',
      items: moving.map((p) => ({
        to: '/purchasing',
        label: `${p.id} · ${state.suppliers.find((s) => s.id === p.supplierId)?.name} · ${p.shipment.carrier} ${p.shipment.trackingId}`,
        sub: `${p.items.map((i) => `${i.qty} ${state.materials.find((m) => m.id === i.rmId)?.unit} ${state.materials.find((m) => m.id === i.rmId)?.name}`).join(', ')} · arriving ${fmtDate(p.shipment.eta)}${p.shipment.vehicleNo ? ` · vehicle ${p.shipment.vehicleNo}` : ''}`,
      })),
    };
  }

  // Stock.
  if (has(q, ['stock', 'material', 'raw', 'reorder', 'short', 'inventory', 'माल', 'स्टॉक'])) {
    const low = state.materials.filter((m) => m.stock <= m.reorderLevel);
    const shortFor = orders.filter((o) => ['PENDING_REVIEW', 'ON_HOLD'].includes(o.status) && !orderAvailability(o, state).ok);
    return {
      title: `${low.length} material${low.length === 1 ? '' : 's'} below reorder level · ${shortFor.length} order${shortFor.length === 1 ? '' : 's'} short of material`,
      text: 'See Purchasing for what to buy.',
      items: [
        ...low.map((m) => ({ to: '/inventory', label: m.name, sub: `${m.stock} ${m.unit} left · reorder at ${m.reorderLevel}` })),
        ...shortFor.map((o) => orderItem(o, 'Waiting for raw material')),
        { to: '/purchasing', label: 'Open Purchasing →' },
      ],
    };
  }

  // Machines.
  if (has(q, ['machine', 'breakdown', 'down', 'maintenance', 'service', 'मशीन'])) {
    const down = state.machines.filter(machineIsDown);
    const due = state.machines.filter((m) => maintenanceStatus(m).state !== 'ok');
    return {
      title: `${down.length} machine${down.length === 1 ? '' : 's'} down · ${due.length} due for maintenance`,
      text: '',
      items: [
        ...down.map((m) => ({ to: '/machines', label: `${m.name} – DOWN`, sub: `${PROCESSES[m.process].label} · ${m.downtime.find((d) => !d.to).reason}` })),
        ...due.map((m) => {
          const s = maintenanceStatus(m);
          return { to: '/machines', label: `${m.name} – maintenance ${s.state === 'overdue' ? 'overdue' : 'due soon'}`, sub: `Due ${fmtDate(s.due)}` };
        }),
      ],
    };
  }

  // Approvals.
  if (has(q, ['approv', 'sign', 'मंज़ूर', 'मंजूर'])) {
    const list = orders.filter((o) => openApproval(o) && forCustomer(o));
    return {
      title: `${list.length} stage${list.length === 1 ? '' : 's'} waiting for approval${who}`,
      text: '',
      items: list.map((o) => {
        const a = openApproval(o);
        return orderItem(o, a.state === 'rejected' ? `Rejected by ${a.decidedBy} – rework` : `${STATUS[o.status].label.split(' · ')[0]} done by ${a.requestedBy}`);
      }),
    };
  }

  // Purchases.
  if (has(q, ['purchase', 'supplier', 'vendor', ' po ', 'buy', 'खरीद'])) {
    const open = state.purchases.filter((p) => p.status === 'SENT');
    return {
      title: `${open.length} purchase order${open.length === 1 ? '' : 's'} waiting for delivery`,
      text: '',
      items: open.map((p) => ({
        to: '/purchasing',
        label: `${p.id} · ${state.suppliers.find((s) => s.id === p.supplierId)?.name}`,
        sub: `${p.items.map((i) => `${i.qty} ${state.materials.find((m) => m.id === i.rmId)?.unit} ${state.materials.find((m) => m.id === i.rmId)?.name}`).join(', ')} · ${p.shipment ? `in transit, ${p.shipment.carrier} ${p.shipment.trackingId}, arriving ${fmtDate(p.shipment.eta)}` : `not shipped yet, expected ${fmtDate(p.expectedDate)}`}`,
      })),
    };
  }

  // Top customers.
  if (has(q, ['top customer', 'best customer', 'biggest customer', 'top client', 'top customers'])) {
    const list = customerList(orders.filter(inCreated)).sort((a, b) => b.orders - a.orders || b.units - a.units).slice(0, 5);
    return {
      title: `Top customers${when || ' (all time)'}`,
      text: 'By number of work orders received.',
      items: list.map((c) => ({ to: customerPath(c.name), label: c.name, sub: `${c.orders} work orders · ${c.units} units` })),
    };
  }

  // Problems.
  if (has(q, ['problem', 'issue', 'समस्या'])) {
    const list = orders.filter((o) => o.problem && forCustomer(o));
    return { title: `${list.length} open problem${list.length === 1 ? '' : 's'}${who}`, text: '', items: list.map((o) => orderItem(o, o.problem.note || o.problem.code)) };
  }

  // Dispatch.
  if (has(q, ['dispatch', 'ship', 'sent', 'deliver', 'भेज'])) {
    const ready = orders.filter((o) => o.status === 'CLIENT_APPROVED' && forCustomer(o));
    const sent = orders.filter((o) => o.dispatch && forCustomer(o) && (!range || (o.dispatch.dispatchDate >= range[0] && o.dispatch.dispatchDate <= range[1])));
    return {
      title: `${ready.length} ready to dispatch · ${sent.length} dispatched${who}${when}`,
      text: '',
      items: [...ready.map((o) => orderItem(o, 'Cleared – waiting for vehicle')), ...sent.map((o) => orderItem(o, `${o.status === 'DELIVERED' ? 'Delivered' : 'On the way'} · ${o.dispatch.carrier} ${o.dispatch.trackingId}`))],
    };
  }

  // Orders for a customer / in a period.
  if (customer || range || has(q, ['order', 'how many', 'count', 'ऑर्डर'])) {
    const list = orders.filter((o) => forCustomer(o) && inCreated(o)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const open = list.filter(isOpen).length;
    return {
      title: `${list.length} work order${list.length === 1 ? '' : 's'}${who}${when ? ` received${when}` : ''}`,
      text: `${open} still open, ${list.length - open} dispatched or delivered.${customer ? ' Open the customer page for more.' : ''}`,
      items: [...(customer ? [{ to: customerPath(customer.name), label: `${customer.name} – customer page →` }] : []), ...list.map((o) => orderItem(o, `${STATUS[o.status].label} · due ${fmtDate(o.expectedDeliveryDate)}`))],
    };
  }

  return {
    title: "I didn't understand that yet",
    text: 'Try asking about late orders, a work order number, a customer, stock, machines, approvals, purchases or dispatch.',
    items: [],
  };
}
