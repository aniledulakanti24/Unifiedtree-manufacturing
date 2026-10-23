// Production planning: machine capacity, when each open order will be ready, which orders are likely
// to be late (and why), machine uptime/maintenance, and what raw material to buy.
// It is a simple forward schedule: per factory and process, orders queue by delivery date and use the
// running machines' hours per day, counting only working days (no Sundays / holidays by default).
// Processes sent out for job work don't use our machines; the order waits for the job worker instead.
// Good enough to warn early; not a detailed shop schedule.

import { PROCESSES } from './processes';
import { JOURNEY_STATUSES, PRODUCTION_STATUSES, afterLastWork, isOpen, kindOf, openApproval } from './statuses';
import { orderAvailability, poArrival, poRemaining, stockAt } from './stock';
import { addDays, daysUntil, fmtDate, todayISO } from '../utils';

/** Working days for QC, customer approval and dispatch after production finishes. */
const AFTER_PRODUCTION_DAYS = 2;
// Still to be made: waiting for review, or anywhere in the journey before the last work step.
const needsProduction = (status) => ['PENDING_REVIEW', 'ON_HOLD'].includes(status) || (JOURNEY_STATUSES.includes(status) && !afterLastWork(status));
const DEFAULT_CALENDAR = { workDays: [1, 2, 3, 4, 5, 6], holidays: [] };

const isDown = (m) => m.downtime.some((d) => !d.to);

/** Is this date a working day (weekday the factory works, and not a holiday)? */
function isWorkDay(date, calendar = DEFAULT_CALENDAR) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return calendar.workDays.includes(day) && !calendar.holidays.some((h) => h.date === date);
}

/** The date `n` working days after `from` (n = 0 → `from` itself, or the next working day if it is off). */
function addWorkDays(from, n, calendar = DEFAULT_CALENDAR) {
  let d = from;
  let guard = 0;
  while (!isWorkDay(d, calendar) && guard++ < 60) d = addDays(d, 1);
  for (let left = n; left > 0 && guard < 2000; guard++) {
    d = addDays(d, 1);
    if (isWorkDay(d, calendar)) left -= 1;
  }
  return d;
}

/** Processes of this order that are with a job worker (out, or already done there). */
const outsourced = (order) => new Set((order.jobWork ?? []).map((j) => j.process));

/** Machine hours still needed per process for an order, given how far it has got. */
export function remainingHours(order, products) {
  if (!needsProduction(order.status)) return {};
  const hours = {};
  const away = outsourced(order);
  // How far along the admin's work steps the order is (`done`, in steps): half-way through the step it is in,
  // or all steps before it when it waits at a check (QC / customer) placed between them. The last step is
  // packing and the ones before it share the making.
  const stages = PRODUCTION_STATUSES.filter((k) => k !== 'ACCEPTED');
  const n = stages.length;
  const keys = JOURNEY_STATUSES;
  const done = stages.includes(order.status)
    ? stages.indexOf(order.status) + 0.5
    : stages.filter((k) => keys.indexOf(k) < keys.indexOf(order.status)).length;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  order.items.forEach((it) => {
    const route = products.find((p) => p.id === it.productId)?.route ?? {};
    Object.entries(route).forEach(([proc, perUnit]) => {
      if (away.has(proc)) return;
      const share = n <= 1 ? clamp(1 - done) : proc === 'packing' ? clamp(n - done) : clamp(1 - done / (n - 1));
      if (share) hours[proc] = (hours[proc] ?? 0) + perUnit * it.qty * share;
    });
  });
  return hours;
}

/** Hours per day available for a process in a factory (machines that are down don't count). */
export function dailyHours(machines, plantId, proc) {
  return machines.filter((m) => m.plantId === plantId && m.process === proc && !isDown(m)).reduce((s, m) => s + m.hoursPerDay, 0);
}

/**
 * When an order can start: raw material in its factory (the open purchase order's date, else the supplier's
 * lead time) and any job worker it is waiting for. Returns { start: date, waits: [reason] }.
 */
function startConstraints(order, state) {
  const today = todayISO();
  let start = today;
  const waits = [];
  const later = (d) => {
    if (d > start) start = d;
  };

  if (['PENDING_REVIEW', 'ON_HOLD'].includes(order.status)) {
    const { rows, ok } = orderAvailability(order, state);
    if (!ok)
      rows
        .filter((r) => r.shortfall > 0)
        .forEach((r) => {
          const po = state.purchases.find(
            (p) => p.status === 'SENT' && p.plantId === order.plantId && poRemaining(p).some((i) => i.rmId === r.rmId && i.qty > 0),
          );
          const supplier = state.suppliers.find((s) => s.materials.includes(r.rmId));
          later(po ? (poArrival(po) > today ? poArrival(po) : today) : addDays(today, (supplier?.leadDays ?? 7) + 1));
          waits.push(po ? `Raw material: ${r.name} ${po.shipment ? `in transit (${po.shipment.carrier} ${po.shipment.trackingId}), arriving` : "ordered, expected"} ${fmtDate(poArrival(po))} (${po.id})` : `Raw material: ${r.name} short by ${r.shortfall} ${r.unit} – no purchase order yet`);
        });
  }

  (order.jobWork ?? [])
    .filter((j) => j.status === 'OUT')
    .forEach((j) => {
      const worker = state.jobWorkers.find((w) => w.id === j.workerId);
      later(j.expectedBack > today ? j.expectedBack : addDays(today, 1));
      waits.push(`Job work: ${PROCESSES[j.process].label} at ${worker?.name ?? 'job worker'} – back by ${fmtDate(j.expectedBack)}`);
    });
  return { start, waits };
}

/**
 * Forward schedule for every open order (plus an optional new order placed at the back of the queue).
 * Returns { [orderId]: { readyDate, finishDate, blocked: [process], bottleneck, waits } }.
 */
export function buildPlan(state, extraOrder = null) {
  const today = todayISO();
  const cal = state.settings?.calendar ?? DEFAULT_CALENDAR;
  const orders = state.orders.filter(isOpen);
  const queue = [...orders.filter((o) => needsProduction(o.status))].sort(
    (a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate) || a.createdAt.localeCompare(b.createdAt),
  );
  if (extraOrder) queue.push(extraOrder);

  const used = {}; // `${plant}:${process}` -> hours already booked
  const plan = {};
  queue.forEach((o) => {
    const wait = startConstraints(o, state);
    let days = 0;
    let ownDays = 0;
    const blocked = [];
    let bottleneck = null;
    Object.entries(remainingHours(o, state.products)).forEach(([proc, h]) => {
      const key = `${o.plantId}:${proc}`;
      used[key] = (used[key] ?? 0) + h;
      const perDay = dailyHours(state.machines, o.plantId, proc);
      if (!perDay) return blocked.push(proc);
      ownDays = Math.max(ownDays, Math.ceil(h / perDay));
      const d = Math.ceil(used[key] / perDay);
      if (d > days) {
        days = d;
        bottleneck = { process: proc, days: d };
      }
    });
    // Capacity days are working days. Ready = the later of: its turn in the machine queue, and
    // (when it is waiting for material / a job worker) that start date plus its own production time.
    const queueDone = addWorkDays(today, days, cal);
    const startDone = wait.start > today ? addWorkDays(wait.start, ownDays, cal) : today;
    const readyDate = startDone > queueDone ? startDone : queueDone;
    plan[o.id] = { readyDate, finishDate: addWorkDays(readyDate, AFTER_PRODUCTION_DAYS, cal), blocked, bottleneck, waits: wait.waits };
  });

  // Orders past production only need the remaining checks and dispatch.
  orders
    .filter((o) => !needsProduction(o.status))
    .forEach((o) => {
      const left = o.status === 'CLIENT_APPROVED' ? 1 : { qc: 2, customer: 1 }[kindOf(o.status)] ?? 0;
      plan[o.id] = { readyDate: today, finishDate: addWorkDays(today, left, cal), blocked: [], bottleneck: null, waits: [] };
    });
  return plan;
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

/**
 * Will this order be late? level: 'late' (already past the date), 'high' (forecast after the date),
 * 'watch' (one day or less to spare), 'ok'. `reasons` explain it in plain words.
 */
export function riskOf(order, plan, state) {
  if (!isOpen(order)) return null;
  const p = plan[order.id];
  if (!p) return null;
  const reasons = [];
  let extra = 0;
  if (order.problem) {
    extra += 1;
    reasons.push('Problem reported on the shop floor');
  }
  const a = openApproval(order);
  if (a) {
    extra += 1;
    reasons.push(a.state === 'rejected' ? 'Stage approval rejected – rework needed' : 'Waiting for stage approval');
  }
  p.waits.forEach((w) => reasons.push(w));
  p.blocked.forEach((proc) => {
    const down = state.machines.filter((m) => m.plantId === order.plantId && m.process === proc);
    reasons.push(down.length ? `${PROCESSES[proc].label}: all machines are down` : `${PROCESSES[proc].label}: no machine in this factory`);
  });
  if (p.bottleneck && p.bottleneck.days > 2) reasons.push(`${PROCESSES[p.bottleneck.process].label} is busy – ${p.bottleneck.days} days of work queued`);

  const forecast = addDays(p.finishDate, extra);
  const slack = daysBetween(forecast, order.expectedDeliveryDate);
  let level = 'ok';
  if (daysUntil(order.expectedDeliveryDate) < 0) level = 'late';
  else if (p.blocked.length || slack < 0) level = 'high';
  else if (slack <= 1) level = 'watch';
  return { level, forecast: p.blocked.length ? null : forecast, slack, reasons };
}

export const RISK_LABEL = { late: 'Already late', high: 'Likely late', watch: 'Tight', ok: 'On track' };

/** Share of the last `days` days a machine was running (not down). */
export function uptime(machine, days = 30) {
  const end = Date.now();
  const start = end - days * 86400000;
  const down = machine.downtime.reduce((s, d) => {
    const from = Math.max(start, Date.parse(d.from));
    const to = Math.min(end, d.to ? Date.parse(d.to) : end);
    return s + Math.max(0, to - from);
  }, 0);
  return Math.round((1 - down / (end - start)) * 1000) / 10;
}

/** Next maintenance date and whether it is overdue / due within a week. */
export function maintenanceStatus(machine) {
  const due = addDays(machine.lastMaintenance, machine.maintenanceEveryDays);
  const d = daysUntil(due);
  return { due, days: d, state: d < 0 ? 'overdue' : d <= 7 ? 'soon' : 'ok' };
}

/** Booked hours vs available hours per machine over the next `span` calendar days (working days only). */
export function machineLoad(state, span = 7) {
  const cal = state.settings?.calendar ?? DEFAULT_CALENDAR;
  let days = 0;
  for (let i = 0; i < span; i++) if (isWorkDay(addDays(todayISO(), i), cal)) days += 1;
  days = Math.max(days, 1);
  const booked = {};
  state.orders.filter(isOpen).forEach((o) =>
    Object.entries(remainingHours(o, state.products)).forEach(([proc, h]) => {
      const key = `${o.plantId}:${proc}`;
      booked[key] = (booked[key] ?? 0) + h;
    }),
  );
  return Object.fromEntries(
    state.machines.map((m) => {
      const key = `${m.plantId}:${m.process}`;
      const perDay = dailyHours(state.machines, m.plantId, m.process);
      // Booked work is shared across the running machines of the same process.
      const share = perDay && !isDown(m) ? (booked[key] ?? 0) * (m.hoursPerDay / perDay) : 0;
      return [m.id, { booked: Math.round(share * 10) / 10, available: m.hoursPerDay * days, pct: isDown(m) ? 0 : Math.round((share / (m.hoursPerDay * days)) * 100) }];
    }),
  );
}

export const machineIsDown = isDown;


/**
 * What to buy, per factory: material that orders waiting for review / on hold need beyond that factory's
 * stock and open purchase orders, plus top-ups for anything that would fall below its reorder level
 * (company-wide) once those orders use it. Grouped by supplier and factory.
 */
export function suggestedPurchases(state) {
  const waiting = state.orders.filter((o) => ['PENDING_REVIEW', 'ON_HOLD'].includes(o.status));
  const lines = [];
  state.materials.forEach((m) => {
    const perPlant = state.plants.map((pl) => {
      const orders = waiting.filter((o) => o.plantId === pl.id);
      let need = 0;
      const shortFor = [];
      orders.forEach((o) => {
        const r = orderAvailability(o, state).rows.find((x) => x.rmId === m.id);
        if (!r) return;
        need += r.required;
        if (r.shortfall) shortFor.push(o.id);
      });
      const onOrder = state.purchases
        .filter((p) => p.status === 'SENT' && p.plantId === pl.id)
        .reduce((s, p) => s + (poRemaining(p).find((i) => i.rmId === m.id)?.qty ?? 0), 0);
      return { plantId: pl.id, need, shortFor, onOrder, coming: stockAt(state.lots, m.id, pl.id) + onOrder };
    });

    // Shortages for waiting orders, factory by factory.
    perPlant.forEach((pp) => {
      const qty = Math.ceil(Math.max(0, pp.need - pp.coming) / 10) * 10;
      if (qty > 0) lines.push({ rmId: m.id, name: m.name, unit: m.unit, plantId: pp.plantId, qty, why: `Short for ${pp.shortFor.join(', ') || 'waiting orders'}`, forOrders: pp.shortFor });
    });

    // Company-wide reorder level, topped up where the material is used most.
    const left = perPlant.reduce((s, pp) => s + Math.max(pp.coming, pp.need) - pp.need, 0);
    if (left < m.reorderLevel) {
      const target = [...perPlant].sort((a, b) => b.need - a.need || b.coming - a.coming)[0];
      const qty = Math.ceil((m.reorderLevel * 2 - left) / 10) * 10;
      const existing = lines.find((l) => l.rmId === m.id && l.plantId === target.plantId);
      const why = m.stock <= m.reorderLevel ? 'Below reorder level' : 'Will fall below reorder level once waiting orders use it';
      if (existing) existing.qty = Math.max(existing.qty, qty);
      else lines.push({ rmId: m.id, name: m.name, unit: m.unit, plantId: target.plantId, qty, why, forOrders: [] });
    }
  });

  return state.suppliers.flatMap((s) =>
    state.plants
      .map((pl) => ({ supplier: s, plantId: pl.id, lines: lines.filter((l) => s.materials.includes(l.rmId) && l.plantId === pl.id) }))
      .filter((g) => g.lines.length),
  );
}
