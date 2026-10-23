// Raw material stock is kept as batches (lots) per factory: opening stock, each supplier delivery and each
// transfer is a lot. Orders take the oldest lots first (FIFO), and the lots they used are recorded on the
// order, so any batch can be traced to the work orders it went into. A material's `stock` is the total of
// its lots in all factories, kept in step by `withTotals`.

import { checkAvailability, round } from '../utils';

/** Quantity of a material left in one factory (or all factories when plantId is omitted). */
export function stockAt(lots, rmId, plantId) {
  return round(lots.filter((l) => l.rmId === rmId && (!plantId || l.plantId === plantId)).reduce((s, l) => s + l.qty, 0));
}

/** Material check for an order against the stock in its own factory. */
export function orderAvailability(order, state) {
  return checkAvailability(order.items, state.products, state.materials, (rmId) => stockAt(state.lots, rmId, order.plantId));
}

/** Recomputes each material's total stock from its lots. */
function withTotals(state) {
  return { ...state, materials: state.materials.map((m) => ({ ...m, stock: stockAt(state.lots, m.id) })) };
}

/** Adds a lot. `lot` = { rmId, plantId, qty, batchNo, source, poId?, receivedAt }. */
export function addLot(state, lot) {
  const n = (state.counters.lot ?? 0) + 1;
  const next = {
    ...state,
    counters: { ...state.counters, lot: n },
    lots: [...state.lots, { id: `LOT-${String(n).padStart(4, '0')}`, received: lot.qty, ...lot }],
  };
  return withTotals(next);
}

/**
 * Takes `qty` of a material from a factory, oldest lots first.
 * Returns { state, used: [{ lotId, batchNo, qty }] } – `used` is empty and state unchanged if there is not enough.
 */
export function issueFifo(state, rmId, plantId, qty) {
  if (stockAt(state.lots, rmId, plantId) + 1e-9 < qty) return { state, used: [] };
  let left = qty;
  const used = [];
  const ordered = [...state.lots].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const take = {};
  for (const l of ordered) {
    if (left <= 0) break;
    if (l.rmId !== rmId || l.plantId !== plantId || l.qty <= 0) continue;
    const q = round(Math.min(l.qty, left));
    take[l.id] = q;
    used.push({ lotId: l.id, batchNo: l.batchNo, qty: q });
    left = round(left - q);
  }
  const lots = state.lots.map((l) => (take[l.id] ? { ...l, qty: round(l.qty - take[l.id]) } : l));
  return { state: withTotals({ ...state, lots }), used };
}

/** Puts material an order was issued back into the batches it came from (`used` = the order's materialLots). */
export function returnLots(state, used) {
  const back = {};
  (used ?? []).forEach((u) => (back[u.lotId] = round((back[u.lotId] ?? 0) + u.qty)));
  const lots = state.lots.map((l) => (back[l.id] ? { ...l, qty: round(l.qty + back[l.id]) } : l));
  return withTotals({ ...state, lots });
}

/** Accepted quantity received so far per material on a purchase order (deliveries can come in parts). */
export function poReceived(po) {
  const got = {};
  (po.receipts ?? []).forEach((r) => r.lines.forEach((l) => (got[l.rmId] = round((got[l.rmId] ?? 0) + l.accepted))));
  return got;
}

/** What is still to come on a purchase order: ordered minus accepted so far. */
export function poRemaining(po) {
  const got = poReceived(po);
  return po.items.map((i) => ({ rmId: i.rmId, qty: Math.max(0, round(i.qty - (got[i.rmId] ?? 0))) }));
}

/** When a purchase order's material should arrive: the transporter's ETA once shipped, else the PO date. */
export const poArrival = (po) => po.shipment?.eta || po.expectedDate;

/**
 * Material still to come on open purchase orders, split into "in transit" (supplier has dispatched it)
 * and "ordered" (not shipped yet). Optionally for one factory.
 */
export function incoming(purchases, rmId, plantId) {
  let transit = 0;
  let ordered = 0;
  purchases
    .filter((p) => p.status === 'SENT' && (!plantId || p.plantId === plantId))
    .forEach((p) => {
      const q = poRemaining(p).find((i) => i.rmId === rmId)?.qty ?? 0;
      if (p.shipment) transit += q;
      else ordered += q;
    });
  return { transit: round(transit), ordered: round(ordered) };
}

/**
 * Supplier scorecard from purchase orders: on-time deliveries (first receipt on or before the expected
 * date) and share of delivered quantity rejected at incoming inspection.
 */
export function supplierScore(purchases, supplierId) {
  const pos = purchases.filter((p) => p.supplierId === supplierId && p.receipts?.length);
  if (!pos.length) return null;
  const onTime = pos.filter((p) => p.receipts[0].at.slice(0, 10) <= p.expectedDate).length;
  let delivered = 0;
  let rejected = 0;
  pos.forEach((p) =>
    p.receipts.forEach((r) =>
      r.lines.forEach((l) => {
        delivered += l.accepted + l.rejected;
        rejected += l.rejected;
      }),
    ),
  );
  return {
    deliveries: pos.length,
    onTimePct: Math.round((onTime / pos.length) * 100),
    rejectPct: delivered ? Math.round((rejected / delivered) * 1000) / 10 : 0,
  };
}

/** Every work order that used a batch number (any material), with the quantity. */
export function ordersUsingBatch(orders, batchNo) {
  const key = batchNo.trim().toLowerCase();
  return orders.flatMap((o) =>
    (o.materialLots ?? []).filter((u) => u.batchNo.toLowerCase().includes(key)).map((u) => ({ order: o, ...u })),
  );
}
