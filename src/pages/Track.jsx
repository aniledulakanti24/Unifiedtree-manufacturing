import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { JOURNEY_STATUSES, afterLastWork, isProductionStage, openApproval } from '../data/statuses';
import { featureOn } from '../auth/features';
import { PhotoGallery } from '../components/Photos';
import Icon from '../components/Icon';
import { delayDays, fmtDate, fmtDateTime, orderUnits } from '../utils';

// The customer's view of the journey, in their words.
const ALL_STEPS = [
  { label: 'Order received', statuses: ['PENDING_REVIEW', 'ON_HOLD'] },
  {
    label: 'In production',
    get statuses() {
      return JOURNEY_STATUSES.filter((s) => !afterLastWork(s)); // checks in between count as production
    },
  },
  {
    label: 'Quality check',
    check: true,
    get statuses() {
      return JOURNEY_STATUSES.filter(afterLastWork);
    },
  },
  { label: 'Ready to ship', statuses: ['CLIENT_APPROVED'] },
  { label: 'On the way', statuses: ['DISPATCHED'] },
  { label: 'Delivered', statuses: ['DELIVERED'], delivery: true },
];

/**
 * Public order tracking page for the customer (no login): progress, expected date, delays, the QC report
 * with photos, dispatch details – and approving the QC report or raising a concern in one tap.
 * Demo note: data lives in this browser, so the link works on this device until a server is added.
 */
export default function Track() {
  const { id } = useParams();
  const { state, act } = useStore();
  const [concern, setConcern] = useState(null);
  const order = state.orders.find((o) => o.id === id);

  if (!order || !featureOn('customerView'))
    return (
      <div className="track">
        <TrackHead />
        <div className="track-card">
          <h1>{order ? 'Order tracking is not available' : 'Order not found'}</h1>
          <p className="muted">Please check the link, or contact us.</p>
        </div>
      </div>
    );

  // The quality step is left out when the admin switched off both QC and customer approval.
  const STEPS = ALL_STEPS.filter((s) => (!s.check || s.statuses.length) && (!s.delivery || featureOn('delivery')));
  const step = STEPS.findIndex((s) => s.statuses.includes(order.status));
  const product = (pid) => state.products.find((p) => p.id === pid)?.name ?? pid;
  const awaitingCustomer = order.status === 'QC_APPROVED' && !openApproval(order);
  const decided = order.history.findLast?.((h) => !h.edit && (h.status === 'CLIENT_APPROVED' || (h.role === 'customer' && isProductionStage(h.status))));
  const customerAct = (approved, note) => act('CUSTOMER_DECISION', { id: order.id, approved, note });

  return (
    <div className="track">
      <TrackHead />
      <div className="track-card">
        <p className="muted small">
          Order {order.customerPoNo} · our ref {order.id}
        </p>
        <h1>{order.customer.name}</h1>
        <p className="track-status">
          {STEPS[step]?.label}
          {order.status !== 'DELIVERED' && (
            <span>
              {' '}
              · expected delivery <strong>{fmtDate(order.expectedDeliveryDate)}</strong>
            </span>
          )}
        </p>

        <ol className="track-steps">
          {STEPS.map((s, i) => (
            <li key={s.label} className={i < step || order.status === 'DELIVERED' ? 'done' : i === step ? 'current' : ''}>
              <span className="track-dot">{i < step || order.status === 'DELIVERED' ? <Icon name="check" size={14} /> : i + 1}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>

        {order.delays?.length > 0 && order.status !== 'DELIVERED' && (
          <div className="alert amber">
            <span aria-hidden="true">⏳</span>
            <div>
              Your order is delayed by {delayDays(order)} days. The new delivery date is <strong>{fmtDate(order.expectedDeliveryDate)}</strong> (first promised{' '}
              {fmtDate(order.originalDeliveryDate)}). We are sorry for the inconvenience.
            </div>
          </div>
        )}

        <section>
          <h2>Your order</h2>
          <ul className="track-items">
            {order.items.map((it, i) => (
              <li key={i}>
                <strong>{it.qty}</strong> × {product(it.productId)} {it.specs && <span className="muted">· {it.specs}</span>}
              </li>
            ))}
          </ul>
        </section>

        {order.qc?.result === 'PASS' && (
          <section>
            <h2>Quality inspection</h2>
            <p>
              ✅ Passed on {fmtDate(order.qc.at)} – {order.qc.inspectedQty} of {orderUnits(order)} pieces checked.
              <br />
              <span className="muted">{order.qc.remarks}</span>
            </p>
            <PhotoGallery photos={order.qc.photos} title="Inspection photo" />
            {awaitingCustomer && !concern && (
              <div className="track-actions">
                <p>
                  <strong>Please confirm so we can dispatch.</strong>
                </p>
                <button className="btn success lg" onClick={() => customerAct(true, 'Approved by customer on the tracking page')}>
                  <Icon name="check" size={16} /> Approve – please dispatch
                </button>
                <button className="btn ghost lg" onClick={() => setConcern('')}>
                  I have a concern
                </button>
              </div>
            )}
            {concern != null && (
              <form
                className="track-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!concern.trim()) return;
                  customerAct(false, concern.trim());
                  setConcern(null);
                }}
              >
                <label>
                  What is your concern?
                  <textarea rows={3} value={concern} onChange={(e) => setConcern(e.target.value)} autoFocus />
                </label>
                <button className="btn primary lg">Send to the factory</button>
              </form>
            )}
            {order.status === 'QC_APPROVED' && openApproval(order) && <p className="muted small">Our team is finalising the report – approval opens shortly.</p>}
            {decided && !awaitingCustomer && order.status !== 'QC_APPROVED' && <p className="ok-text small">Thank you – your response was recorded on {fmtDateTime(decided.at)}.</p>}
          </section>
        )}

        {order.dispatch && (
          <section>
            <h2>Shipment</h2>
            <dl className="dl">
              <dt>Sent on</dt>
              <dd>{fmtDate(order.dispatch.dispatchDate)}</dd>
              <dt>By</dt>
              <dd>{order.dispatch.carrier}</dd>
              <dt>Tracking / LR no.</dt>
              <dd>
                <code className="tracking">{order.dispatch.trackingId}</code>
              </dd>
              <dt>Expected arrival</dt>
              <dd>{fmtDate(order.dispatch.eta)}</dd>
            </dl>
          </section>
        )}

        <p className="muted small track-foot">Updated {fmtDateTime(order.history.at(-1).at)} · Questions? Call us or reply on WhatsApp.</p>
      </div>
    </div>
  );
}

function TrackHead() {
  return (
    <header className="track-head">
      <span className="brand-mark">UT</span>
      <strong>Unifiedtree · Order tracking</strong>
    </header>
  );
}
