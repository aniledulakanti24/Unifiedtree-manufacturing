import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useVisibleOrders } from '../context/StoreContext';
import { customerList, customerPath } from '../data/customers';
import { Card, EmptyState, PageHeader } from '../components/ui';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { fmtDate } from '../utils';

const SORTS = {
  name: { label: 'Name A–Z', fn: (a, b) => a.name.localeCompare(b.name) },
  orders: { label: 'Most work orders', fn: (a, b) => b.orders - a.orders || a.name.localeCompare(b.name) },
  latest: { label: 'Latest order', fn: (a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt) },
};

/** Every customer, all time. Open one to see its figures for any period. */
export default function Customers() {
  const { t } = useLang();
  const navigate = useNavigate();
  const orders = useVisibleOrders();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');

  const all = customerList(orders);
  const term = q.trim().toLowerCase();
  const rows = all
    .filter((c) => !term || [c.name, c.contact.contact, c.contact.phone, c.contact.email, c.contact.address].some((v) => v?.toLowerCase().includes(term)))
    .sort(SORTS[sort].fn);

  return (
    <>
      <PageHeader title={t('nav.customers')} subtitle={`${all.length} customers · open one to see its orders, progress and raw material for any period`} />

      <Card>
        <div className="filters">
          <label className="search-field">
            <span className="sr-only">Search customers</span>
            <Icon name="search" size={16} />
            <input type="search" placeholder="Search name, contact, phone, email or city…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="sort-field">
            <span className="sr-only">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No matching customers">Try a different search.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table customers-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Contact</th>
                  <th scope="col" className="num">
                    Work orders
                  </th>
                  <th scope="col" className="num">
                    Open
                  </th>
                  <th scope="col" className="num">
                    Delivered
                  </th>
                  <th scope="col" className="num">
                    Delayed
                  </th>
                  <th scope="col">Last order</th>
                  <th scope="col">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.name} onClick={() => navigate(customerPath(c.name))}>
                    <td>
                      <Link to={customerPath(c.name)} className="customer-name" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                      <div className="muted small">{c.contact.address?.split(',').slice(-2).join(',').trim()}</div>
                    </td>
                    <td className="small">
                      {c.contact.contact || '—'}
                      <div className="muted">{c.contact.phone || c.contact.email}</div>
                    </td>
                    <td className="num">
                      <strong>{c.orders}</strong>
                    </td>
                    <td className="num">{c.open}</td>
                    <td className="num">{c.arrived}</td>
                    <td className={`num ${c.delayed ? 'bad-text' : ''}`}>{c.delayed}</td>
                    <td className="small nowrap">{fmtDate(c.lastOrderAt)}</td>
                    <td className="num">
                      <Icon name="arrowRight" size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
