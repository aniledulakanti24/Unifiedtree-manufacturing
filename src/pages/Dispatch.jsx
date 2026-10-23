import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore, useVisibleOrders } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { featureOn } from '../auth/features';
import { isComplete, openApproval } from '../data/statuses';
import { Card, DueChip, EmptyState, Modal, PageHeader, PriorityBadge, StatTiles } from '../components/ui';
import DispatchForm from '../components/DispatchForm';
import WhatsAppButton from '../components/WhatsApp';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { daysUntil, fmtDate, itemsSummary } from '../utils';

const TABS = [
  { key: 'ready', label: 'Ready to ship', icon: 'box', tone: 'amber' },
  { key: 'transit', label: 'On the way', icon: 'truck', tone: 'blue' },
  { key: 'delivered', label: 'Delivered', icon: 'checkCircle', tone: 'green' },
];

/**
 * Dispatch: orders cleared to go, shipments on the way and delivered ones. Sales see their own customers'
 * shipments (tracking, ETA, driver) and can update the customer; the dispatch team also assigns vehicles.
 */
export default function Dispatch() {
  const { user } = useAuth();
  const { t } = useLang();
  const orders = useVisibleOrders();
  const manage = can(user.role, 'dispatch.manage');
  const [tab, setTab] = useState(manage ? 'ready' : 'transit');
  const [q, setQ] = useState('');

  const deliveredAt = (o) => o.history.findLast((h) => h.status === 'DELIVERED')?.at ?? o.dispatch?.at;
  const lists = {
    ready: orders.filter((o) => o.status === 'CLIENT_APPROVED').sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate)),
    transit: orders.filter((o) => o.dispatch && !isComplete(o.status)).sort((a, b) => (a.dispatch.eta ?? '').localeCompare(b.dispatch.eta ?? '')),
    delivered: orders.filter((o) => o.dispatch && isComplete(o.status)).sort((a, b) => deliveredAt(b).localeCompare(deliveredAt(a))),
  };
  const term = q.trim().toLowerCase();
  const shown = lists[tab].filter(
    (o) => !term || [o.id, o.customer.name, o.customerPoNo, o.dispatch?.trackingId ?? '', o.dispatch?.carrier ?? ''].some((v) => v.toLowerCase().includes(term)),
  );
  const arrivingSoon = lists.transit.filter((o) => o.dispatch.eta && daysUntil(o.dispatch.eta) <= 1).length;

  return (
    <>
      <PageHeader
        title={t('nav.dispatch')}
        subtitle={
          manage
            ? 'Orders cleared to go, shipments on the way and delivered. Assign a vehicle or courier and the tracking ID.'
            : 'Where your customers’ orders are once they leave the factory – carrier, tracking ID and arrival date.'
        }
      />

      <StatTiles
        label="Dispatch summary"
        items={TABS.map((x) => ({
          key: x.key,
          label: x.label,
          value: lists[x.key].length,
          icon: x.icon,
          tone: x.tone,
          sub: x.key === 'transit' && arrivingSoon ? `${arrivingSoon} arriving by tomorrow` : undefined,
          active: tab === x.key,
          onClick: () => setTab(x.key),
        }))}
      />

      <Card>
        <div className="toolbar">
          <label className="search-field">
            <span className="sr-only">Search shipments</span>
            <Icon name="search" size={16} />
            <input type="search" placeholder="Search WO, customer, PO, tracking ID or carrier…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <span className="muted small" aria-live="polite">
            {shown.length} {TABS.find((x) => x.key === tab).label.toLowerCase()}
          </span>
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={TABS.find((x) => x.key === tab).icon} title={term ? 'Nothing matches your search' : `Nothing ${TABS.find((x) => x.key === tab).label.toLowerCase()}`} />
        ) : (
          <ul className="ship-list">
            {shown.map((o) => (
              <Shipment key={o.id} order={o} tab={tab} manage={manage} deliveredAt={deliveredAt(o)} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Shipment({ order: o, tab, manage, deliveredAt }) {
  const { state } = useStore();
  const [assigning, setAssigning] = useState(false);
  const d = o.dispatch;
  return (
    <li className={`ship ship-${tab}`}>
      <div className="ship-main">
        <div className="ship-title">
          <Link to={`/orders/${o.id}`}>
            <strong>{o.id}</strong>
          </Link>
          <span className="ship-customer">{o.customer.name}</span>
          {o.priority !== 'Normal' && <PriorityBadge priority={o.priority} />}
        </div>
        <div className="muted small">
          PO {o.customerPoNo} · {itemsSummary(o, state.products)}
        </div>
      </div>

      {tab === 'ready' ? (
        <div className="ship-info">
          <DueChip date={o.expectedDeliveryDate} />
          <span className={`small ${openApproval(o) ? 'warn-text' : 'muted'}`}>{openApproval(o) ? '⏳ Waiting for sign-off before dispatch' : 'Cleared – waiting for a vehicle'}</span>
        </div>
      ) : (
        <div className="ship-info">
          <span className="ship-carrier">
            <Icon name="truck" size={14} /> {d.carrier}
          </span>
          <code className="tracking">{d.trackingId}</code>
          {d.driverName && (
            <span className="muted small">
              {d.driverName}
              {d.driverPhone && (
                <>
                  {' · '}
                  <a href={`tel:${d.driverPhone}`}>{d.driverPhone}</a>
                </>
              )}
            </span>
          )}
        </div>
      )}

      <div className="ship-dates">
        {tab === 'ready' && <span className="small">Due {fmtDate(o.expectedDeliveryDate)}</span>}
        {tab === 'transit' && (
          <>
            <span className="small">Sent {fmtDate(d.dispatchDate)}</span>
            {d.eta && (
              <span className={`small ${daysUntil(d.eta) < 0 ? 'bad-text' : daysUntil(d.eta) <= 1 ? 'warn-text' : ''}`}>
                <strong>Arrives {fmtDate(d.eta)}</strong>
              </span>
            )}
          </>
        )}
        {tab === 'delivered' && (
          <>
            <span className="small">Sent {fmtDate(d.dispatchDate)}</span>
            <span className="small ok-text">
              <strong>{o.status === 'DELIVERED' ? `Delivered ${fmtDate(deliveredAt)}` : 'Complete'}</strong>
            </span>
          </>
        )}
      </div>

      <div className="ship-actions">
        {tab === 'ready' && manage && !openApproval(o) && (
          <button className="btn small primary" onClick={() => setAssigning(true)}>
            <Icon name="truck" size={14} /> Assign vehicle
          </button>
        )}
        {assigning && (
          <Modal title={`Dispatch ${o.id} · ${o.customer.name}`} onClose={() => setAssigning(false)}>
            <DispatchForm order={o} onDone={() => setAssigning(false)} />
          </Modal>
        )}
        {tab !== 'ready' && featureOn('customerView') && (
          <a className="btn small" href={`/track/${o.id}`} target="_blank" rel="noopener noreferrer" title="The page the customer sees">
            <Icon name="globe" size={14} /> Track
          </a>
        )}
        <WhatsAppButton order={o} small />
      </div>
    </li>
  );
}
