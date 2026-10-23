import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlan, useStore, useVisibleOrders } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { orderAvailability } from '../data/stock';
import { Card, DueChip, EmptyState, PageHeader, PriorityBadge, StatTiles } from '../components/ui';
import { ReasonDialog, ReasonText, reasonRecord } from '../components/ReasonPicker';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { daysUntil, fmtDate } from '../utils';

const PRIORITY_RANK = { Urgent: 0, High: 1, Normal: 2 };
const daysSince = (at) => Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 86400000));

/**
 * The factory's decision queue: every new or held work order with its raw material check (needed against stock in
 * its own factory) and the earliest finish date, to accept or hold right here – one by one or all ready ones at once.
 */
export default function FactoryReview() {
  const { t } = useLang();
  const { state, act } = useStore();
  const orders = useVisibleOrders();
  const [show, setShow] = useState('all'); // all | ready | short | held

  const queue = orders
    .filter((o) => ['PENDING_REVIEW', 'ON_HOLD'].includes(o.status))
    .map((o) => ({ order: o, check: orderAvailability(o, state) }))
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.order.priority] - PRIORITY_RANK[b.order.priority] || a.order.expectedDeliveryDate.localeCompare(b.order.expectedDeliveryDate),
    );
  const pending = queue.filter((x) => x.order.status === 'PENDING_REVIEW');
  const ready = pending.filter((x) => x.check.ok);
  const short = queue.filter((x) => !x.check.ok);
  const held = queue.filter((x) => x.order.status === 'ON_HOLD');
  const lists = { all: queue, ready, short, held };
  const toggle = (key) => setShow((s) => (s === key ? 'all' : key));

  // Accept every new order whose material is in stock, most urgent first (each one re-checks stock as it goes).
  const acceptAll = () => {
    if (!window.confirm(`Accept ${ready.length} work order${ready.length === 1 ? '' : 's'} with raw material in stock? Material is issued to each one, most urgent first.`)) return;
    ready.forEach((x) => act('REVIEW_ORDER', { id: x.order.id, decision: 'accept', note: 'Accepted – raw material in stock' }));
  };

  return (
    <>
      <PageHeader title={t('nav.review')} subtitle="New and held work orders. Check the raw material, then accept or hold – most urgent first.">
        {ready.length > 0 && (
          <button className="btn success" onClick={acceptAll}>
            <Icon name="check" size={16} /> Accept all ready ({ready.length})
          </button>
        )}
      </PageHeader>

      <StatTiles
        label="Review summary"
        items={[
          { key: 'all', label: 'Waiting for a decision', value: pending.length, icon: 'inbox', tone: 'blue', active: show === 'all', onClick: () => setShow('all') },
          { key: 'ready', label: 'Ready – material in stock', value: ready.length, icon: 'checkCircle', tone: 'green', active: show === 'ready', onClick: () => toggle('ready') },
          { key: 'short', label: 'Short of material', value: short.length, icon: 'alert', tone: short.length ? 'red' : 'gray', active: show === 'short', onClick: () => toggle('short') },
          {
            key: 'held',
            label: 'On hold',
            value: held.length,
            icon: 'pause',
            tone: 'amber',
            sub: held.length ? `longest ${Math.max(...held.map((x) => daysSince(x.order.history.findLast((h) => h.status === 'ON_HOLD')?.at ?? x.order.createdAt)))} days` : undefined,
            active: show === 'held',
            onClick: () => toggle('held'),
          },
        ]}
      />

      {lists[show].length === 0 ? (
        <Card>
          <EmptyState icon="checkCircle" title={show === 'all' ? 'Nothing waiting – every work order has been decided' : 'No work orders here'} />
        </Card>
      ) : (
        <div className="review-list">
          {lists[show].map((x) => (
            <ReviewCard key={x.order.id} order={x.order} check={x.check} />
          ))}
        </div>
      )}
    </>
  );
}

function ReviewCard({ order: o, check }) {
  const { state, act } = useStore();
  const { user } = useAuth();
  const { t } = useLang();
  const { plan } = usePlan();
  const [holding, setHolding] = useState(false);
  const [note, setNote] = useState('');
  const p = plan[o.id];
  const product = (id) => state.products.find((x) => x.id === id)?.name ?? id;
  const plantName = state.plants.find((x) => x.id === o.plantId)?.name;
  const heldAt = o.status === 'ON_HOLD' ? o.history.findLast((h) => h.status === 'ON_HOLD')?.at : null;
  const late = p?.finishDate && p.finishDate > o.expectedDeliveryDate;

  return (
    <article className={`review-card ${check.ok ? 'ok' : 'short'} ${o.status === 'ON_HOLD' ? 'held' : ''}`}>
      <header className="rc-head">
        <div className="rc-title">
          <Link to={`/orders/${o.id}`} className="rc-id">
            {o.id}
          </Link>
          <strong>{o.customer.name}</strong>
          {o.priority !== 'Normal' && <PriorityBadge priority={o.priority} />}
          {o.status === 'ON_HOLD' && <span className="badge tone-amber">On hold · {daysSince(heldAt ?? o.createdAt)} days</span>}
        </div>
        <DueChip date={o.expectedDeliveryDate} />
      </header>
      <p className="muted small rc-sub">
        PO {o.customerPoNo} · {plantName} · entered by {o.createdByName} {daysSince(o.createdAt) ? `${daysSince(o.createdAt)} days ago` : 'today'}
      </p>

      <div className="rc-body">
        <ul className="rc-items">
          {o.items.map((it, i) => (
            <li key={i}>
              <b>{it.qty}</b> × {product(it.productId)}
              {it.specs && <span className="muted small"> · {it.specs}</span>}
              {it.barcode && <span className="wd-barcode">🏷 {it.barcode}</span>}
            </li>
          ))}
          {o.requirements && <li className="muted small">📝 {o.requirements}</li>}
        </ul>

        <table className="table compact rc-materials">
          <thead>
            <tr>
              <th>Raw material</th>
              <th className="num">Needed</th>
              <th className="num">In stock</th>
            </tr>
          </thead>
          <tbody>
            {check.rows.map((r) => (
              <tr key={r.rmId} className={r.shortfall ? 'row-low' : ''}>
                <td>
                  {r.shortfall ? '✖' : '✔'} {r.name}
                  {r.shortfall > 0 && (
                    <div className="bad-text small">
                      Short {r.shortfall.toLocaleString('en-IN')} {r.unit}
                    </div>
                  )}
                </td>
                <td className="num">
                  {r.required.toLocaleString('en-IN')} <span className="muted small">{r.unit}</span>
                </td>
                <td className="num">{r.available.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {o.status === 'ON_HOLD' && (
        <p className="rc-hold small">
          ⏸ <ReasonText code={o.holdCode} note={o.holdNote} fallback={o.holdReason} />
        </p>
      )}
      {p && (
        <p className={`small rc-forecast ${late ? 'bad-text' : 'muted'}`}>
          {p.blocked?.length
            ? '⚠ A process has no running machine in this factory – it cannot be planned.'
            : `Can be finished by ${fmtDate(p.finishDate)}${late ? ` – ${daysUntil(o.expectedDeliveryDate) < 0 ? 'already late' : 'after the promised date'}` : ''}`}
          {p.waits?.[0] && !check.ok ? ` · ${p.waits[0]}` : ''}
        </p>
      )}

      <footer className="rc-actions">
        {check.ok && (
          <input className="rc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('review.remarks')} aria-label={t('review.remarks')} />
        )}
        <button className="btn success" disabled={!check.ok} onClick={() => act('REVIEW_ORDER', { id: o.id, decision: 'accept', note: note.trim() })}>
          <Icon name="check" size={16} /> {t('review.accept')}
        </button>
        <button className="btn danger" onClick={() => setHolding(true)}>
          <Icon name="pause" size={16} /> {o.status === 'ON_HOLD' ? t('review.updateHold') : t('review.hold')}
        </button>
        {!check.ok && can(user.role, 'purchase.manage') && (
          <Link to={`/purchasing?for=${o.id}`} className="btn">
            <Icon name="cart" size={16} /> Raise PO
          </Link>
        )}
        <Link to={`/orders/${o.id}`} className="btn ghost">
          Open
        </Link>
      </footer>

      {holding && (
        <ReasonDialog
          group="hold"
          title={t('reason.holdTitle')}
          onClose={() => setHolding(false)}
          onSubmit={({ code, note: extra }) => {
            act('REVIEW_ORDER', { id: o.id, decision: 'hold', note: reasonRecord(code, extra), code, extra });
            setHolding(false);
          }}
        />
      )}
    </article>
  );
}
