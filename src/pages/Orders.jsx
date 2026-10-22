import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useVisibleOrders } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { STATUS_GROUPS } from '../data/statuses';
import { Card, PageHeader } from '../components/ui';
import OrderTable from '../components/OrderTable';
import Icon from '../components/Icon';

export default function Orders() {
  const { user } = useAuth();
  const orders = useVisibleOrders();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const groupKey = params.get('group') ?? '';
  const group = STATUS_GROUPS.find((g) => g.key === groupKey);

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };

  const term = q.trim().toLowerCase();
  const matchesSearch = (o) =>
    !term || [o.id, o.customerPoNo, o.customer.name, o.createdByName].some((v) => v.toLowerCase().includes(term));
  const searched = orders.filter(matchesSearch);
  const filtered = group ? searched.filter((o) => group.statuses.includes(o.status)) : searched;

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle={can(user.role, 'orders.viewAll') ? 'All customer purchase orders' : 'Customer purchase orders you have entered'}
      >
        {can(user.role, 'orders.create') && (
          <Link className="btn primary" to="/orders/new">
            <Icon name="plus" size={16} /> New Customer PO
          </Link>
        )}
      </PageHeader>
      <Card>
        <div className="filters">
          <label className="search-field">
            <span className="sr-only">Search orders</span>
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Search PO no., customer or sales person…"
              value={q}
              onChange={(e) => update('q', e.target.value)}
            />
          </label>
        </div>
        <div className="chips" role="group" aria-label="Filter by stage">
          <button className={`chip ${!group ? 'active' : ''}`} aria-pressed={!group} onClick={() => update('group', '')}>
            All <span>{searched.length}</span>
          </button>
          {STATUS_GROUPS.map((g) => (
            <button
              key={g.key}
              className={`chip ${group?.key === g.key ? 'active' : ''}`}
              aria-pressed={group?.key === g.key}
              onClick={() => update('group', g.key)}
            >
              {g.label} <span>{searched.filter((o) => g.statuses.includes(o.status)).length}</span>
            </button>
          ))}
        </div>
        <p className="muted small results-count" aria-live="polite">
          Showing {filtered.length} of {orders.length} orders
        </p>
        <OrderTable
          orders={filtered}
          empty="No matching orders"
          emptyHint={term || group ? 'Try a different search or filter.' : undefined}
        />
      </Card>
    </>
  );
}
