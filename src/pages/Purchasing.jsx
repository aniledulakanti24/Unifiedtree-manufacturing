import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { suggestedPurchases } from '../data/planning';
import { orderAvailability, poArrival, poReceived, poRemaining, stockAt, supplierScore } from '../data/stock';
import { Card, DueChip, EmptyState, Modal, PageHeader, StatTiles } from '../components/ui';
import Icon from '../components/Icon';
import { addDays, fmtDate, fmtDateTime, todayISO } from '../utils';

const STATUS = {
  RECEIVED: { label: 'Received', tone: 'green' },
  CLOSED: { label: 'Closed short', tone: 'amber' },
  CANCELLED: { label: 'Cancelled', tone: 'gray' },
};

/**
 * Raw material buying: what to order per factory (from shortages and reorder levels), open purchase orders,
 * receiving in one or more deliveries with incoming inspection, and how each supplier performs.
 */
export default function Purchasing() {
  const { user } = useAuth();
  const { state, act, plant } = useStore();
  const [params, setParams] = useSearchParams();
  const manage = can(user.role, 'purchase.manage');
  const inView = (plantId) => plant === 'all' || plantId === plant;
  const suggestions = suggestedPurchases(state).filter((g) => inView(g.plantId));
  const [draft, setDraft] = useState(() => draftForOrder(params.get('for'), state));
  const [receiving, setReceiving] = useState(null);
  const [shipping, setShipping] = useState(null);

  const open = state.purchases.filter((p) => p.status === 'SENT' && inView(p.plantId)).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  const past = state.purchases
    .filter((p) => p.status !== 'SENT' && inView(p.plantId))
    .sort((a, b) => (b.receipts?.at(-1)?.at ?? b.cancelledAt ?? '').localeCompare(a.receipts?.at(-1)?.at ?? a.cancelledAt ?? ''));
  const supplier = (id) => state.suppliers.find((s) => s.id === id);
  const material = (id) => state.materials.find((m) => m.id === id);
  const plantName = (id) => state.plants.find((p) => p.id === id)?.name ?? id;
  // Deliveries past the date the supplier promised (the transporter's ETA once shipped).
  const overdue = open.filter((p) => poArrival(p) < todayISO()).length;
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const closeDraft = () => {
    setDraft(null);
    if (params.get('for')) setParams({}, { replace: true });
  };

  return (
    <>
      <PageHeader title="Purchasing" subtitle="Order raw material from suppliers, receive it with incoming inspection, and track supplier performance">
        {manage && (
          <button className="btn primary" onClick={() => setDraft(emptyDraft(state, plant))}>
            <Icon name="plus" size={16} /> New purchase order
          </button>
        )}
      </PageHeader>

      <StatTiles
        label="Purchasing summary"
        items={[
          { key: 'buy', label: 'To buy now', value: suggestions.reduce((s, g) => s + g.lines.length, 0), icon: 'alert', tone: suggestions.length ? 'red' : 'green', onClick: () => jump('po-suggest') },
          { key: 'open', label: 'Open purchase orders', value: open.length, icon: 'cart', tone: 'blue', onClick: () => jump('po-open') },
          { key: 'transit', label: 'In transit', value: open.filter((p) => p.shipment).length, icon: 'truck', tone: 'violet', onClick: () => jump('po-open') },
          { key: 'late', label: 'Overdue deliveries', value: overdue, icon: 'clock', tone: overdue ? 'amber' : 'gray', onClick: () => jump('po-open') },
        ]}
      />

      <div id="po-suggest" />
      <Card
        title={`Suggested purchases (${suggestions.reduce((s, g) => s + g.lines.length, 0)})`}
        icon="alert"
        className={suggestions.length ? 'border-red' : ''}
      >
        <p className="muted small">
          Per factory: material short for work orders waiting on the factory there, or top-ups to stay above the reorder level. Quantities already on
          order are taken into account.
        </p>
        {suggestions.length === 0 ? (
          <EmptyState icon="checkCircle" title="Nothing to buy right now" />
        ) : (
          <div className="supplier-groups">
            {suggestions.map(({ supplier: s, plantId, lines }) => (
              <div key={`${s.id}:${plantId}`} className="supplier-group">
                <div className="row-between">
                  <div>
                    <strong>{s.name}</strong>
                    <div className="muted small">
                      Deliver to {plantName(plantId)} · about {s.leadDays} days
                    </div>
                  </div>
                  {manage && (
                    <button
                      className="btn small primary"
                      onClick={() =>
                        setDraft({
                          supplierId: s.id,
                          plantId,
                          expectedDate: addDays(todayISO(), s.leadDays),
                          note: lines.map((l) => l.why).join('; '),
                          forOrders: [...new Set(lines.flatMap((l) => l.forOrders))],
                          items: lines.map((l) => ({ rmId: l.rmId, qty: l.qty })),
                        })
                      }
                    >
                      Raise PO
                    </button>
                  )}
                </div>
                <ul className="suggest-lines">
                  {lines.map((l) => (
                    <li key={l.rmId}>
                      <span>
                        {l.name}
                        <span className="muted small"> · {l.why}</span>
                      </span>
                      <strong>
                        {l.qty.toLocaleString('en-IN')} {l.unit}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div id="po-open" />
      <Card title={`Open purchase orders (${open.length})`} icon="truck">
        {open.length === 0 ? (
          <EmptyState title="No purchase orders waiting for delivery" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">PO</th>
                  <th scope="col">Supplier · deliver to</th>
                  <th scope="col">Material – received / ordered</th>
                  <th scope="col">For work orders</th>
                  <th scope="col">Shipment · arrival</th>
                  {manage && <th scope="col" />}
                </tr>
              </thead>
              <tbody>
                {open.map((po) => {
                  const got = poReceived(po);
                  return (
                    <tr key={po.id}>
                      <td>
                        <strong className="nowrap">{po.id}</strong>
                        <div className="muted small">
                          {po.createdBy} · {fmtDate(po.createdAt)}
                        </div>
                      </td>
                      <td className="small">
                        {supplier(po.supplierId)?.name}
                        <div className="muted">{plantName(po.plantId)}</div>
                      </td>
                      <td className="small">
                        {po.items.map((i) => (
                          <div key={i.rmId}>
                            {material(i.rmId)?.name} – <strong>{(got[i.rmId] ?? 0).toLocaleString('en-IN')}</strong> / {i.qty.toLocaleString('en-IN')}{' '}
                            {material(i.rmId)?.unit}
                          </div>
                        ))}
                        {po.receipts?.length > 0 && <span className="badge tone-amber">Part received</span>}
                      </td>
                      <td className="small">
                        {po.forOrders?.length
                          ? po.forOrders.map((id) => (
                              <Link key={id} to={`/orders/${id}`} className="block-link">
                                {id}
                              </Link>
                            ))
                          : '—'}
                      </td>
                      <td className="small">
                        {po.shipment ? (
                          <div className="shipment">
                            <span className="badge tone-blue">🚚 In transit</span>
                            <div>
                              {po.shipment.carrier} · <code className="tracking">{po.shipment.trackingId}</code>
                            </div>
                            {po.shipment.vehicleNo && <div className="muted">Vehicle {po.shipment.vehicleNo}</div>}
                            <div className="muted">Dispatched {fmtDate(po.shipment.dispatchedOn)}</div>
                          </div>
                        ) : (
                          <span className="badge tone-gray">Ordered – not shipped yet</span>
                        )}
                        <div className="nowrap">Arrives {fmtDate(poArrival(po))}</div>
                        <DueChip date={poArrival(po)} />
                      </td>
                      {manage && (
                        <td>
                          <div className="btn-row tight">
                            <button className="btn small" onClick={() => setShipping(po)}>
                              <Icon name="truck" size={14} /> {po.shipment ? 'Edit shipment' : 'Mark shipped'}
                            </button>
                            <button className="btn small success" onClick={() => setReceiving(po)}>
                              Receive
                            </button>
                            <button
                              className="btn small ghost"
                              onClick={() => window.confirm(`Cancel ${po.id}?`) && act('CANCEL_PURCHASE', { purchaseId: po.id })}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid-2-1">
        <Card title="Received, closed & cancelled" icon="checkCircle">
          {past.length === 0 ? (
            <EmptyState title="No completed purchase orders yet" />
          ) : (
            <ul className="feed">
              {past.map((po) => (
                <li key={po.id}>
                  <span className="feed-main">
                    <strong>{po.id}</strong> · {supplier(po.supplierId)?.name} <span className={`badge tone-${STATUS[po.status].tone}`}>{STATUS[po.status].label}</span>
                  </span>
                  {(po.receipts ?? []).map((r, i) => (
                    <span key={i} className="feed-sub">
                      {fmtDateTime(r.at)} · batch <code className="tracking">{r.batchNo}</code>
                      {r.shipment && ` · came by ${r.shipment.carrier} ${r.shipment.trackingId}`} ·{' '}
                      {r.lines
                        .map((l) => `${l.accepted} ${material(l.rmId)?.unit} ${material(l.rmId)?.name}${l.rejected ? ` (+${l.rejected} rejected: ${l.reason || 'inspection'})` : ''}`)
                        .join(', ')}{' '}
                      · {r.by}
                    </span>
                  ))}
                  {po.status === 'CANCELLED' && <span className="feed-sub">Cancelled by {po.cancelledBy}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Supplier scorecard" icon="chart">
          <p className="muted small">On time = first delivery on or before the expected date. Rejected = share of delivered quantity rejected at incoming inspection.</p>
          <ul className="feed">
            {state.suppliers.map((s) => {
              const sc = supplierScore(state.purchases, s.id);
              return (
                <li key={s.id}>
                  <span className="feed-main row-between">
                    <strong>{s.name}</strong>
                    {sc ? (
                      <span className="small nowrap">
                        <span className={sc.onTimePct < 80 ? 'bad-text' : 'ok-text'}>{sc.onTimePct}% on time</span> ·{' '}
                        <span className={sc.rejectPct > 2 ? 'bad-text' : 'ok-text'}>{sc.rejectPct}% rejected</span>
                      </span>
                    ) : (
                      <span className="muted small">No deliveries yet</span>
                    )}
                  </span>
                  <span className="feed-sub">
                    {s.materials.map((id) => material(id)?.name).join(', ')} · lead time {s.leadDays} days{sc ? ` · ${sc.deliveries} deliveries` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {draft && <PurchaseDialog draft={draft} onClose={closeDraft} />}
      {receiving && <ReceiveDialog po={receiving} onClose={() => setReceiving(null)} />}
      {shipping && <ShipmentDialog po={shipping} onClose={() => setShipping(null)} />}
    </>
  );
}

const emptyDraft = (state, plant) => ({
  supplierId: state.suppliers[0].id,
  plantId: plant !== 'all' ? plant : state.plants[0].id,
  expectedDate: addDays(todayISO(), state.suppliers[0].leadDays),
  note: '',
  forOrders: [],
  items: [{ rmId: state.suppliers[0].materials[0], qty: '' }],
});

/** Draft PO for one work order's shortage in its factory (opened from the order page with ?for=WO-…). */
function draftForOrder(orderId, state) {
  const o = orderId && state.orders.find((x) => x.id === orderId);
  if (!o) return null;
  const short = orderAvailability(o, state).rows.filter((r) => r.shortfall > 0);
  if (!short.length) return null;
  const s = state.suppliers.find((x) => x.materials.includes(short[0].rmId)) ?? state.suppliers[0];
  return {
    supplierId: s.id,
    plantId: o.plantId,
    expectedDate: addDays(todayISO(), s.leadDays),
    note: `Shortage for ${o.id} (${o.customer.name})`,
    forOrders: [o.id],
    items: short.filter((r) => s.materials.includes(r.rmId)).map((r) => ({ rmId: r.rmId, qty: Math.ceil(r.shortfall / 10) * 10 })),
  };
}

function PurchaseDialog({ draft, onClose }) {
  const { state, act } = useStore();
  const [d, setD] = useState(draft);
  const [error, setError] = useState('');
  const s = state.suppliers.find((x) => x.id === d.supplierId);
  const setItem = (i, k, v) => setD((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));

  const submit = () => {
    const items = d.items.filter((it) => it.rmId && Number(it.qty) > 0).map((it) => ({ rmId: it.rmId, qty: Number(it.qty) }));
    if (!items.length) return setError('Add at least one material with a quantity.');
    if (!d.expectedDate) return setError('Pick the expected delivery date.');
    act('CREATE_PURCHASE', { purchase: { ...d, items } });
    onClose();
  };

  return (
    <Modal title="Purchase order to supplier" onClose={onClose}>
      <div className="form-grid">
        <label>
          Supplier
          <select
            value={d.supplierId}
            onChange={(e) => {
              const ns = state.suppliers.find((x) => x.id === e.target.value);
              setD((x) => ({ ...x, supplierId: ns.id, expectedDate: addDays(todayISO(), ns.leadDays), items: [{ rmId: ns.materials[0], qty: '' }] }));
            }}
          >
            {state.suppliers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deliver to
          <select value={d.plantId} onChange={(e) => setD((x) => ({ ...x, plantId: e.target.value }))}>
            {state.plants.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {s.materials.length === 0 && <p className="field-error">This supplier has no materials set up – add them in Setup.</p>}
      {d.items.map((it, i) => {
        const m = state.materials.find((x) => x.id === it.rmId);
        return (
          <div key={i} className="form-grid po-line">
            <label>
              Material
              <select value={it.rmId} onChange={(e) => setItem(i, 'rmId', e.target.value)}>
                {s.materials.map((id) => (
                  <option key={id} value={id}>
                    {state.materials.find((x) => x.id === id)?.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity ({m?.unit})
              <input type="number" min="1" inputMode="decimal" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
              <small className="hint">
                In stock there: {stockAt(state.lots, it.rmId, d.plantId).toLocaleString('en-IN')} {m?.unit}
              </small>
            </label>
          </div>
        );
      })}
      {s.materials.length > d.items.length && (
        <button
          type="button"
          className="link-btn small"
          onClick={() => setD((x) => ({ ...x, items: [...x.items, { rmId: s.materials.find((id) => !x.items.some((it) => it.rmId === id)), qty: '' }] }))}
        >
          + Add another material from {s.name}
        </button>
      )}
      <label>
        Expected delivery
        <input type="date" min={todayISO()} value={d.expectedDate} onChange={(e) => setD((x) => ({ ...x, expectedDate: e.target.value }))} />
        <small className="hint">Usual lead time {s.leadDays} days. Held work orders use this date to forecast delivery.</small>
      </label>
      <label>
        Note
        <input value={d.note} onChange={(e) => setD((x) => ({ ...x, note: e.target.value }))} />
      </label>
      {d.forOrders.length > 0 && <p className="small muted">For work orders: {d.forOrders.join(', ')}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button className="btn ghost lg" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary lg" onClick={submit}>
          Raise purchase order
        </button>
      </div>
    </Modal>
  );
}

/** The supplier has dispatched: transporter, LR / tracking number, vehicle and expected arrival. */
function ShipmentDialog({ po, onClose }) {
  const { act } = useStore();
  const [s, setS] = useState(
    () => po.shipment ?? { carrier: '', trackingId: '', vehicleNo: '', dispatchedOn: todayISO(), eta: po.expectedDate < todayISO() ? todayISO() : po.expectedDate },
  );
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const valid = s.carrier.trim() && s.trackingId.trim() && s.eta && s.dispatchedOn && s.eta >= s.dispatchedOn;
  return (
    <Modal title={`${po.id} – supplier dispatch`} onClose={onClose}>
      <p className="muted small">Enter the details from the supplier's dispatch message or e-way bill. The material then shows as in transit.</p>
      <div className="form-grid">
        <label>
          Transporter / courier
          <input value={s.carrier} onChange={(e) => set('carrier', e.target.value)} placeholder="e.g. VRL Logistics" autoFocus />
        </label>
        <label>
          LR / tracking number
          <input value={s.trackingId} onChange={(e) => set('trackingId', e.target.value)} placeholder="e.g. VRL-LR-8841207" />
        </label>
        <label>
          Vehicle number
          <input value={s.vehicleNo} onChange={(e) => set('vehicleNo', e.target.value)} placeholder="Optional" />
        </label>
        <label>
          Dispatched on
          <input type="date" max={todayISO()} value={s.dispatchedOn} onChange={(e) => set('dispatchedOn', e.target.value)} />
        </label>
        <label>
          Expected arrival
          <input type="date" min={s.dispatchedOn} value={s.eta} onChange={(e) => set('eta', e.target.value)} />
          <small className="hint">Delivery forecasts for waiting work orders use this date.</small>
        </label>
      </div>
      <div className="btn-row">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            act('PURCHASE_SHIPPED', { purchaseId: po.id, shipment: { ...s, carrier: s.carrier.trim(), vehicleNo: s.vehicleNo.trim() } });
            onClose();
          }}
        >
          <Icon name="truck" size={16} /> Save – in transit
        </button>
      </div>
    </Modal>
  );
}

/** One delivery: accepted and rejected quantity per material (incoming inspection), batch number, and whether to close the PO. */
function ReceiveDialog({ po, onClose }) {
  const { state, act } = useStore();
  const remaining = poRemaining(po);
  const [lines, setLines] = useState(() => remaining.map((r) => ({ rmId: r.rmId, accepted: String(r.qty), rejected: '0', reason: '' })));
  const [batchNo, setBatchNo] = useState('');
  const [close, setClose] = useState(false);
  const [error, setError] = useState('');
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const parsed = lines.map((l) => ({ rmId: l.rmId, accepted: Number(l.accepted) || 0, rejected: Number(l.rejected) || 0, reason: l.reason.trim() }));
  const short = parsed.some((l, i) => l.accepted < remaining[i].qty);

  const submit = () => {
    if (!parsed.some((l) => l.accepted > 0 || l.rejected > 0) && !close) return setError('Enter what arrived, or tick "close" to close the order.');
    if (parsed.some((l) => l.rejected > 0 && !l.reason)) return setError('Say why material was rejected.');
    act('RECEIVE_PURCHASE', { purchaseId: po.id, lines: parsed, batchNo, close });
    onClose();
  };

  return (
    <Modal title={`Receive ${po.id}`} onClose={onClose}>
      {lines.map((l, i) => {
        const m = state.materials.find((x) => x.id === l.rmId);
        const ordered = po.items.find((x) => x.rmId === l.rmId).qty;
        return (
          <fieldset key={l.rmId} className="receive-line">
            <legend>
              {m?.name} – still to come {remaining[i].qty} of {ordered} {m?.unit}
            </legend>
            <div className="form-grid">
              <label>
                Accepted ({m?.unit})
                <input type="number" min="0" inputMode="decimal" value={l.accepted} onChange={(e) => setLine(i, 'accepted', e.target.value)} />
              </label>
              <label>
                Rejected at inspection
                <input type="number" min="0" inputMode="decimal" value={l.rejected} onChange={(e) => setLine(i, 'rejected', e.target.value)} />
              </label>
            </div>
            {Number(l.rejected) > 0 && (
              <label>
                Why rejected?
                <input value={l.reason} onChange={(e) => setLine(i, 'reason', e.target.value)} placeholder="e.g. Rust on 3 sheets, wrong thickness" />
              </label>
            )}
          </fieldset>
        );
      })}
      <label>
        Batch / lot number
        <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="From the supplier's invoice or label" />
        <small className="hint">Saved on the stock so you can trace which work orders used this batch.</small>
      </label>
      {short && (
        <label className="check">
          <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} />
          Close this purchase order – the rest will not come
        </label>
      )}
      {short && !close && <p className="muted small">The rest stays open on this PO and keeps counting as "on order".</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="btn-row">
        <button className="btn ghost lg" onClick={onClose}>
          Cancel
        </button>
        <button className="btn success lg" onClick={submit}>
          Receive into stock
        </button>
      </div>
    </Modal>
  );
}
