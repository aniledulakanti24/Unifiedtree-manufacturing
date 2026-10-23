import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { buildPlan } from '../data/planning';
import { PROCESSES } from '../data/processes';
import { incoming, poArrival, poRemaining, stockAt } from '../data/stock';
import { Card } from './ui';
import Icon from './Icon';
import { fmtDate, requiredMaterials, round } from '../utils';

/** Raw material already promised to orders the factory has not accepted yet (it is issued on acceptance). */
export function reservedStock(state, plantId) {
  const total = {};
  state.orders
    .filter((o) => ['PENDING_REVIEW', 'ON_HOLD'].includes(o.status) && (!plantId || o.plantId === plantId))
    .forEach((o) => Object.entries(requiredMaterials(o.items, state.products)).forEach(([rmId, q]) => (total[rmId] = round((total[rmId] ?? 0) + q))));
  return total;
}

/**
 * "Can we deliver?" – before promising a customer: is the raw material free in that factory, what is on its
 * way, and the earliest date the factory could finish if the order were entered now.
 */
export default function DeliveryCheck() {
  const { state, plant } = useStore();
  const [productId, setProductId] = useState(state.products[0]?.id ?? '');
  const [qty, setQty] = useState('50');
  const [plantId, setPlantId] = useState(plant !== 'all' ? plant : state.plants[0]?.id);
  const n = Number(qty);
  const ready = productId && n > 0;

  const reserved = reservedStock(state, plantId);
  const rows = ready
    ? Object.entries(requiredMaterials([{ productId, qty: n }], state.products)).map(([rmId, need]) => {
        const m = state.materials.find((x) => x.id === rmId);
        const free = round(Math.max(0, stockAt(state.lots, rmId, plantId) - (reserved[rmId] ?? 0)));
        const coming = incoming(state.purchases, rmId, plantId);
        const nextPo = state.purchases
          .filter((p) => p.status === 'SENT' && p.plantId === plantId && poRemaining(p).some((i) => i.rmId === rmId && i.qty > 0))
          .sort((a, b) => poArrival(a).localeCompare(poArrival(b)))[0];
        return { rmId, name: m?.name ?? rmId, unit: m?.unit ?? '', need: round(need), free, short: round(Math.max(0, need - free)), coming, nextPo };
      })
    : [];
  const short = rows.filter((r) => r.short > 0);
  const planAt = (pid) =>
    buildPlan(state, { id: 'CHECK', plantId: pid, status: 'PENDING_REVIEW', items: [{ productId, qty: n }], expectedDeliveryDate: '9999-12-31', createdAt: new Date().toISOString() }).CHECK;
  const plan = ready ? planAt(plantId) : null;
  // When this factory cannot make it (or only later), the other factory that can deliver soonest.
  const better = ready
    ? state.plants
        .filter((p) => p.id !== plantId)
        .map((p) => ({ plant: p, plan: planAt(p.id) }))
        .filter((x) => !x.plan.blocked.length && (plan.blocked.length || x.plan.finishDate < plan.finishDate))
        .sort((a, b) => a.plan.finishDate.localeCompare(b.plan.finishDate))[0]
    : null;

  return (
    <Card title="Can we deliver?" icon="clock" className="delivery-check">
      <p className="muted small">Check before you promise a customer: free raw material in the factory, what is on its way, and the earliest delivery date.</p>
      <div className="dc-form">
        <label>
          Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {state.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input type="number" min="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          Factory
          <select value={plantId} onChange={(e) => setPlantId(e.target.value)}>
            {state.plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ready && plan && (
        <>
          <div className={`dc-verdict ${plan.blocked.length ? 'bad' : short.length ? 'warn' : 'ok'}`} role="status">
            <Icon name={plan.blocked.length ? 'xCircle' : short.length ? 'alert' : 'checkCircle'} size={20} />
            <div>
              {plan.blocked.length ? (
                <strong>Not possible in this factory – no working machine for {plan.blocked.map((k) => PROCESSES[k]?.label ?? k).join(', ')}.</strong>
              ) : (
                <>
                  <strong>
                    Earliest delivery: {fmtDate(plan.finishDate)} <span className="muted">· {short.length ? 'after the short material arrives' : 'material is in stock'}</span>
                  </strong>
                  {plan.waits?.length > 0 && <span className="small">{plan.waits[0]}</span>}
                </>
              )}
            </div>
          </div>
          {better && (
            <div className="dc-alt">
              <Icon name="factory" size={16} />
              <span>
                <strong>{better.plant.name}</strong> can deliver by <strong>{fmtDate(better.plan.finishDate)}</strong>
                {plan.blocked.length ? '' : ' – sooner'}.
              </span>
              <button type="button" className="btn small" onClick={() => setPlantId(better.plant.id)}>
                Check {better.plant.name}
              </button>
            </div>
          )}

          <div className="table-wrap">
            <table className="table compact dc-table">
              <thead>
                <tr>
                  <th>Raw material</th>
                  <th className="num">Needed</th>
                  <th className="num">Free now</th>
                  <th>On its way</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rmId} className={r.short ? 'row-low' : ''}>
                    <td data-label="Raw material">
                      {r.name}
                      {r.short > 0 && <div className="bad-text small">Short by {r.short.toLocaleString('en-IN')} {r.unit}</div>}
                    </td>
                    <td data-label="Needed" className="num">
                      {r.need.toLocaleString('en-IN')} <span className="muted small">{r.unit}</span>
                    </td>
                    <td data-label="Free now" className="num">
                      {r.free.toLocaleString('en-IN')} <span className="muted small">{r.unit}</span>
                    </td>
                    <td data-label="On its way" className="small">
                      {r.nextPo ? (
                        <>
                          {(r.coming.transit + r.coming.ordered).toLocaleString('en-IN')} {r.unit} · {r.nextPo.shipment ? '🚚 arriving' : 'expected'} {fmtDate(poArrival(r.nextPo))}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            "Free now" is stock in that factory minus what orders still waiting for factory review will use. <Link to="/orders/new">Enter a work order</Link>
          </p>
        </>
      )}
    </Card>
  );
}
