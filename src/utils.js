export const round = (n) => Math.round(n * 100) / 100;

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** "2026-10-22" + 15 days → "2026-11-06". */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Raw material issued to orders, as rows sorted by quantity. Material is issued when the factory
 * accepts an order, so pass the orders whose acceptance falls in the period.
 */
export function materialsUsed(orders, products, materials) {
  const total = {};
  orders.forEach((o) =>
    Object.entries(requiredMaterials(o.items, products)).forEach(([rmId, q]) => (total[rmId] = (total[rmId] ?? 0) + q)),
  );
  return Object.entries(total)
    .map(([rmId, qty]) => {
      const m = materials.find((x) => x.id === rmId);
      return { rmId, name: m?.name ?? rmId, unit: m?.unit ?? '', qty: round(qty) };
    })
    .sort((a, b) => b.qty - a.qty);
}

/** When the factory accepted the order (raw material issued), or null. */
/** A history entry that records an order reaching a step (not a sign-off, a delay or an edit of its details). */
export const isStageEvent = (h) => !h.approval && !h.delay && !h.edit;
export const acceptedAt = (o) => o.history.find((h) => (h.accepted || h.status === 'ACCEPTED') && isStageEvent(h))?.at ?? null;

/** Total pieces on an order, across all its product lines. */
export const orderUnits = (o) => o.items.reduce((s, it) => s + it.qty, 0);

/** Total days an order has been pushed back by reported delays. */
export const delayDays = (order) => (order.delays ?? []).reduce((s, d) => s + d.days, 0);

export function daysUntil(dateStr) {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

/** Total raw material needed for a list of order items, using each product's bill of materials. */
export function requiredMaterials(items, products) {
  const req = {};
  items.forEach((it) => {
    const product = products.find((p) => p.id === it.productId);
    if (!product) return;
    Object.entries(product.bom).forEach(([rmId, perUnit]) => {
      req[rmId] = (req[rmId] || 0) + perUnit * Number(it.qty || 0);
    });
  });
  return req;
}

/** Compares required raw material against stock – total stock, or `stockOf(rmId)` when given (e.g. one factory). */
export function checkAvailability(items, products, materials, stockOf = null) {
  const req = requiredMaterials(items, products);
  const rows = Object.entries(req).map(([rmId, required]) => {
    const m = materials.find((x) => x.id === rmId);
    const available = stockOf ? stockOf(rmId) : m ? m.stock : 0;
    return {
      rmId,
      name: m?.name ?? rmId,
      unit: m?.unit ?? '',
      required: round(required),
      available,
      shortfall: Math.max(0, round(required - available)),
    };
  });
  return { rows, ok: rows.length > 0 && rows.every((r) => r.shortfall === 0) };
}

export function itemsSummary(order, products) {
  return order.items
    .map((it) => `${products.find((p) => p.id === it.productId)?.name ?? it.productId} × ${it.qty}`)
    .join(', ');
}

/** Compares two pieces of order data the way a person would: key order, blanks vs missing and spaces don't matter. */
export function sameData(a, b) {
  const norm = (v) => {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
    if (Array.isArray(v)) return v.map(norm);
    if (typeof v === 'object')
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, norm(v[k])])
          .filter(([, x]) => x !== ''),
      );
    return typeof v === 'string' ? v.trim() : v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
