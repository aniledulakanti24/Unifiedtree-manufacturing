import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useVisibleOrders } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { ORDER_FILTERS, pendingActionFor } from '../data/statuses';
import { Card, PageHeader } from '../components/ui';
import OrderTable from '../components/OrderTable';
import Icon from '../components/Icon';
import { useLang } from '../i18n';

export default function Orders() {
  const { user } = useAuth();
  const { t } = useLang();
  const orders = useVisibleOrders();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const groupKey = params.get('group') ?? '';
  const mine = { key: 'mine', label: t('due.mine'), test: (o) => Boolean(pendingActionFor(user.role, o) || o.problem) };
  const filters = [mine, ...ORDER_FILTERS];
  const group = filters.find((g) => g.key === groupKey);

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };

  const term = q.trim().toLowerCase();
  const matchesSearch = (o) =>
    !term || [o.id, o.customerPoNo, o.piNo ?? '', o.customer.name, o.createdByName].some((v) => v.toLowerCase().includes(term));
  const searched = orders.filter(matchesSearch);
  const filtered = group ? searched.filter(group.test) : searched;

  return (
    <>
      <PageHeader
        title={t('nav.orders')}
        subtitle={can(user.role, 'orders.viewAll') ? 'All work orders' : 'Work orders you have entered'}
      >
        {can(user.role, 'orders.create') && (
          <Link className="btn primary" to="/orders/new">
            <Icon name="plus" size={16} /> {t('nav.newOrder')}
          </Link>
        )}
      </PageHeader>
      <Card>
        <div className="filters">
          <label className="search-field">
            <span className="sr-only">Search work orders</span>
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Search WO no., PO / PI no., customer or entered by…"
              value={q}
              onChange={(e) => update('q', e.target.value)}
            />
          </label>
        </div>
        <div className="chips" role="group" aria-label="Filter by stage">
          <button className={`chip ${!group ? 'active' : ''}`} aria-pressed={!group} onClick={() => update('group', '')}>
            All <span>{searched.length}</span>
          </button>
          {filters.map((g) => (
            <button
              key={g.key}
              className={`chip ${group?.key === g.key ? 'active' : ''}`}
              aria-pressed={group?.key === g.key}
              onClick={() => update('group', g.key)}
            >
              {g.key === 'mine' && '👤 '}
              {g.label} <span>{searched.filter(g.test).length}</span>
            </button>
          ))}
        </div>
        <p className="muted small results-count" aria-live="polite">
          Showing {filtered.length} of {orders.length} work orders
        </p>
        <OrderTable
          orders={filtered}
          empty="No matching work orders"
          emptyHint={term || group ? 'Try a different search or filter.' : undefined}
        />
      </Card>
    </>
  );
}
