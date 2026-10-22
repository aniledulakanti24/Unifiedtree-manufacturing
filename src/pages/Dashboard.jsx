import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore, useVisibleOrders } from '../context/StoreContext';
import { can, ROLES } from '../auth/permissions';
import { FLOW, ORDER_FILTERS, STATUS, isDelayed, openApproval, pendingActionFor } from '../data/statuses';
import { Card, EmptyState, PageHeader, StatusBadge } from '../components/ui';
import OrderTable from '../components/OrderTable';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { fmtDateTime } from '../utils';

const isPending = (o) => ['PENDING_REVIEW', 'ON_HOLD'].includes(o.status) || Boolean(openApproval(o));

export default function Dashboard() {
  const { user } = useAuth();
  const { state } = useStore();
  const { t } = useLang();
  const orders = useVisibleOrders();
  const [lateTab, setLateTab] = useState('delayed');

  const count = (statuses) => orders.filter((o) => statuses.includes(o.status)).length;
  const myActions = orders.filter((o) => pendingActionFor(user.role, o) || o.problem);
  const delayed = orders.filter(isDelayed).sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));
  const pending = orders.filter(isPending).sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));
  const lowStock = state.materials.filter((m) => m.stock <= m.reorderLevel);
  const pipeline = [...FLOW.slice(0, 1), { key: 'ON_HOLD' }, ...FLOW.slice(1)].map((f) => ({
    key: f.key,
    n: count([f.key]),
  }));
  const maxN = Math.max(1, ...pipeline.map((p) => p.n));

  const activity = orders
    .flatMap((o) => o.history.map((h) => ({ ...h, orderId: o.id, customer: o.customer.name })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(' ')[0]}`}
        subtitle={`${ROLES[user.role].label} · ${
          myActions.length ? `${myActions.length} work order${myActions.length > 1 ? 's' : ''} need your attention` : 'nothing waiting on you'
        }`}
      >
        {can(user.role, 'orders.create') && (
          <Link className="btn primary" to="/orders/new">
            <Icon name="plus" size={16} /> {t('nav.newOrder')}
          </Link>
        )}
      </PageHeader>

      <div className="kpis">
        <Link to="/orders" className="kpi tone-blue">
          <span className="kpi-icon">
            <Icon name="file" size={16} />
          </span>
          <span className="kpi-value">{orders.length}</span>
          <span className="kpi-label">Total {t('nav.orders')}</span>
        </Link>
        {ORDER_FILTERS.map((g) => (
          <Link key={g.key} to={`/orders?group=${g.key}`} className={`kpi tone-${g.tone}`}>
            <span className="kpi-icon">
              <Icon name={g.icon} size={16} />
            </span>
            <span className="kpi-value">{orders.filter(g.test).length}</span>
            <span className="kpi-label">{g.label}</span>
          </Link>
        ))}
      </div>

      <Card
        title="Delayed & pending work orders"
        icon="alert"
        className={delayed.length ? 'border-red' : ''}
        actions={
          <div className="chips tight" role="group" aria-label="Show delayed or pending">
            <button className={`chip ${lateTab === 'delayed' ? 'active' : ''}`} aria-pressed={lateTab === 'delayed'} onClick={() => setLateTab('delayed')}>
              Delayed <span>{delayed.length}</span>
            </button>
            <button className={`chip ${lateTab === 'pending' ? 'active' : ''}`} aria-pressed={lateTab === 'pending'} onClick={() => setLateTab('pending')}>
              Pending <span>{pending.length}</span>
            </button>
          </div>
        }
      >
        <p className="muted small">
          {lateTab === 'delayed'
            ? 'Past the expected delivery date and not yet dispatched.'
            : 'Waiting for factory review, on hold, or waiting for a stage approval.'}
        </p>
        <OrderTable
          orders={lateTab === 'delayed' ? delayed : pending}
          empty={lateTab === 'delayed' ? 'No delayed work orders' : 'No pending work orders'}
        />
      </Card>

      <div className="grid-2">
        <Card title="Order pipeline" icon="layers">
          <div className="pipeline">
            {pipeline.map((p) => (
              <div key={p.key} className="pipe-row">
                <span className="pipe-label">{STATUS[p.key].label.split(' · ')[0]}</span>
                <div className="pipe-bar" role="presentation">
                  <div className={`pipe-fill tone-${STATUS[p.key].tone}`} style={{ width: `${(p.n / maxN) * 100}%` }} />
                </div>
                <span className="pipe-n">{p.n}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="stack">
          {can(user.role, 'inventory.view') && (
            <Card
              title="Low stock alerts"
              icon="alert"
              actions={
                <Link to="/inventory" className="small">
                  View inventory
                </Link>
              }
            >
              {lowStock.length === 0 ? (
                <EmptyState icon="checkCircle" title="All raw materials are above reorder level" />
              ) : (
                <ul className="plain-list">
                  {lowStock.map((m) => (
                    <li key={m.id}>
                      <span>{m.name}</span>
                      <span className="bad-text">
                        {m.stock} {m.unit} <small className="muted">/ reorder at {m.reorderLevel}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card title="Recent activity" icon="clock">
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="activity">
                {activity.map((a, i) => (
                  <li key={i}>
                    <div className="row-between">
                      <Link to={`/orders/${a.orderId}`}>
                        <strong>{a.orderId}</strong>
                      </Link>
                      <StatusBadge status={a.status} />
                    </div>
                    <div className="muted small">
                      {a.by} · {fmtDateTime(a.at)} · {a.customer}
                      {a.approval && ` · ${a.note}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
