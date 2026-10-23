import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useVisibleOrders } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { ORDER_FILTERS, isComplete, isOpen, pendingActionFor } from '../data/statuses';
import { Card, PageHeader } from '../components/ui';
import OrderTable from '../components/OrderTable';
import Icon from '../components/Icon';
import { useLang } from '../i18n';

const PRIORITY_RANK = { Urgent: 0, High: 1, Normal: 2 };
const SORTS = {
  // Open orders first (soonest due on top), finished ones after them.
  due: { label: 'Delivery date (soonest)', by: (a, b) => isOpen(b) - isOpen(a) || (isOpen(a) ? a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate) : b.expectedDeliveryDate.localeCompare(a.expectedDeliveryDate)) },
  newest: { label: 'Newest first', by: (a, b) => b.createdAt.localeCompare(a.createdAt) },
  priority: {
    label: 'Priority',
    by: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate),
  },
  customer: { label: 'Customer A–Z', by: (a, b) => a.customer.name.localeCompare(b.customer.name) },
};

export default function Orders() {
  const { user } = useAuth();
  const { t } = useLang();
  const orders = useVisibleOrders();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const groupKey = params.get('group') ?? '';
  const priority = params.get('priority') ?? '';
  const customer = params.get('customer') ?? '';
  const sort = SORTS[params.get('sort')] ? params.get('sort') : 'due';
  const mine = { key: 'mine', label: t('due.mine'), tone: 'blue', test: (o) => Boolean(pendingActionFor(user.role, o) || o.problem) };
  const filters = [mine, ...ORDER_FILTERS];
  const group = filters.find((g) => g.key === groupKey);
  const own = !can(user.role, 'orders.viewAll');

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };
  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  const term = q.trim().toLowerCase();
  const matches = (o) =>
    (!term || [o.id, o.customerPoNo, o.piNo ?? '', o.customer.name, o.createdByName].some((v) => v.toLowerCase().includes(term))) &&
    (!priority || o.priority === priority) &&
    (!customer || o.customer.name === customer);
  const searched = orders.filter(matches);
  const filtered = (group ? searched.filter(group.test) : searched).sort(SORTS[sort].by);
  const customers = [...new Set(orders.map((o) => o.customer.name))].sort();
  const anyFilter = Boolean(term || priority || customer || group || params.get('sort'));

  // A sales person's own tally: how many work orders they have entered, and where they are now.
  const tally = own && {
    total: orders.length,
    open: orders.filter(isOpen).length,
    transit: orders.filter((o) => o.dispatch && !isComplete(o.status)).length,
    done: orders.filter((o) => isComplete(o.status)).length,
  };

  return (
    <>
      <PageHeader
        title={t('nav.orders')}
        subtitle={
          tally ? (
            <>
              You have entered <strong>{tally.total}</strong> work orders: <strong>{tally.open}</strong> open, <strong>{tally.transit}</strong> on the way,{' '}
              <strong>{tally.done}</strong> delivered.
            </>
          ) : (
            'All work orders'
          )
        }
      >
        {can(user.role, 'orders.create') && (
          <Link className="btn primary" to="/orders/new">
            <Icon name="plus" size={16} /> {t('nav.newOrder')}
          </Link>
        )}
      </PageHeader>

      <Card className="orders-card">
        <div className="toolbar">
          <label className="search-field">
            <span className="sr-only">Search work orders</span>
            <Icon name="search" size={16} />
            <input type="search" placeholder="Search WO, PO / PI no., customer…" value={q} onChange={(e) => update('q', e.target.value)} />
          </label>
          <label className="toolbar-select">
            <span className="sr-only">Priority</span>
            <select value={priority} onChange={(e) => update('priority', e.target.value)}>
              <option value="">Any priority</option>
              {Object.keys(PRIORITY_RANK).map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="toolbar-select">
            <span className="sr-only">Customer</span>
            <select value={customer} onChange={(e) => update('customer', e.target.value)}>
              <option value="">All customers</option>
              {customers.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="toolbar-select">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => update('sort', e.target.value === 'due' ? '' : e.target.value)}>
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
          </label>
          {anyFilter && (
            <button type="button" className="btn ghost small" onClick={clearAll}>
              <Icon name="x" size={14} /> Clear
            </button>
          )}
        </div>

        <div className="seg-tabs" role="tablist" aria-label="Filter by stage">
          <button role="tab" aria-selected={!group} className={`seg-tab ${!group ? 'active' : ''}`} onClick={() => update('group', '')}>
            All <span className="seg-n">{searched.length}</span>
          </button>
          {filters.map((g) => {
            const n = searched.filter(g.test).length;
            return (
              <button
                key={g.key}
                role="tab"
                aria-selected={group?.key === g.key}
                className={`seg-tab tone-${g.tone ?? 'gray'} ${group?.key === g.key ? 'active' : ''} ${n === 0 ? 'zero' : ''}`}
                onClick={() => update('group', g.key)}
              >
                <span className="seg-dot" aria-hidden="true" />
                {g.label} <span className="seg-n">{n}</span>
              </button>
            );
          })}
        </div>

        <p className="muted small results-count" aria-live="polite">
          {filtered.length === orders.length ? `${orders.length} work orders` : `Showing ${filtered.length} of ${orders.length} work orders`} · sorted by{' '}
          {SORTS[sort].label.toLowerCase()}
        </p>
        <OrderTable
          orders={filtered}
          empty="No matching work orders"
          emptyHint={anyFilter ? 'Try a different search or filter.' : undefined}
        />
      </Card>
    </>
  );
}
