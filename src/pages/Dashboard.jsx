import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore, useVisibleOrders } from '../context/StoreContext';
import { can, ROLES } from '../auth/permissions';
import { FLOW, STATUS, STATUS_GROUPS, pendingActionFor } from '../data/statuses';
import { Card, EmptyState, PageHeader, StatusBadge } from '../components/ui';
import OrderTable from '../components/OrderTable';
import Icon from '../components/Icon';
import { fmtDateTime } from '../utils';

export default function Dashboard() {
  const { user } = useAuth();
  const { state } = useStore();
  const orders = useVisibleOrders();

  const count = (statuses) => orders.filter((o) => statuses.includes(o.status)).length;
  const myActions = orders.filter((o) => pendingActionFor(user.role, o));
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
          myActions.length ? `${myActions.length} order${myActions.length > 1 ? 's' : ''} need your attention` : 'nothing waiting on you'
        }`}
      >
        {can(user.role, 'orders.create') && (
          <Link className="btn primary" to="/orders/new">
            <Icon name="plus" size={16} /> New Customer PO
          </Link>
        )}
      </PageHeader>

      <div className="kpis">
        <Link to="/orders" className="kpi tone-blue">
          <span className="kpi-icon">
            <Icon name="file" />
          </span>
          <span className="kpi-value">{orders.length}</span>
          <span className="kpi-label">Total POs</span>
        </Link>
        {STATUS_GROUPS.map((g) => (
          <Link key={g.key} to={`/orders?group=${g.key}`} className={`kpi tone-${g.tone}`}>
            <span className="kpi-icon">
              <Icon name={g.icon} />
            </span>
            <span className="kpi-value">{count(g.statuses)}</span>
            <span className="kpi-label">{g.label}</span>
          </Link>
        ))}
      </div>

      <Card title="Waiting on you" icon="clock" className="highlight" actions={<span className="count-pill">{myActions.length}</span>}>
        <OrderTable orders={myActions} empty="You're all caught up" emptyHint="New tasks for your role will show up here." />
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
