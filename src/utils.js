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

/** Compares required raw material against current stock. */
export function checkAvailability(items, products, materials) {
  const req = requiredMaterials(items, products);
  const rows = Object.entries(req).map(([rmId, required]) => {
    const m = materials.find((x) => x.id === rmId);
    const available = m ? m.stock : 0;
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
