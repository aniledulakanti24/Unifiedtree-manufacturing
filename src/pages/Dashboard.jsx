import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlan, useStore, useVisibleOrders } from '../context/StoreContext';
import { can, ROLES } from '../auth/permissions';
import { ORDER_FILTERS, isComplete, isDelayed, isOpen, openApproval } from '../data/statuses';
import ActivityFeed from '../components/ActivityFeed';
import { usePeriod, buildBuckets } from '../context/PeriodContext';
import { Card, Delta, EmptyState, PageHeader } from '../components/ui';
import { BarList, ColumnChart, DonutChart, LineChart } from '../components/Charts';
import PeriodPicker from '../components/PeriodPicker';
import OrderTable from '../components/OrderTable';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { customerList, customerPath } from '../data/customers';
import { acceptedAt, daysUntil, fmtDate, isStageEvent, materialsUsed } from '../utils';

const isPending = (o) => ['PENDING_REVIEW', 'ON_HOLD'].includes(o.status) || Boolean(openApproval(o));

// Delivery windows for open orders, by days left.
const DUE_BUCKETS = [
  { key: 'late', label: 'Late', test: (d) => d < 0, color: 'var(--status-critical)', note: '⚠' },
  { key: 'd3', label: '0–3 days', test: (d) => d >= 0 && d <= 3 },
  { key: 'd7', label: '4–7 days', test: (d) => d >= 4 && d <= 7 },
  { key: 'd14', label: '8–14 days', test: (d) => d >= 8 && d <= 14 },
  { key: 'later', label: '15+ days', test: (d) => d > 14 },
];
const TOP_N = 5;
const PRIORITIES = ['Urgent', 'High', 'Normal'];
const LATE_TABS = {
  delayed: { label: 'Delayed', hint: 'Past the expected delivery date, or pushed back by a reported delay, and not yet dispatched.', empty: 'No delayed work orders' },
  risk: { label: 'Likely late', hint: 'Still on time today, but machine capacity, material or open problems put the forecast after the promised date.', empty: 'Nothing forecast to be late' },
  pending: { label: 'Pending', hint: 'Waiting for factory review, on hold, or waiting for a stage approval.', empty: 'No pending work orders' },
};
// KPI tiles where a smaller number than last period is the good direction.
const LOWER_IS_BETTER = ['review', 'delayed', 'approval'];

export default function Dashboard() {
  const { user } = useAuth();
  const { state } = useStore();
  const { t } = useLang();
  const navigate = useNavigate();
  const period = usePeriod();
  const allOrders = useVisibleOrders();
  const [lateTab, setLateTab] = useState('delayed');
  const { risk } = usePlan();

  // Everything below counts work orders received in the chosen period, compared with the previous one.
  const orders = allOrders.filter((o) => period.inRange(o.createdAt));
  const prevOrders = period.prev ? allOrders.filter((o) => period.inPrev(o.createdAt)) : null;
  const delayed = orders.filter(isDelayed).sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));
  const pending = orders.filter(isPending).sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));
  // Not late yet, but the capacity / material forecast says they will be.
  const likelyLate = orders.filter((o) => risk[o.id]?.level === 'high').sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));
  const lists = { delayed, risk: likelyLate, pending };
  const lowStock = state.materials.filter((m) => m.stock <= m.reorderLevel);
  const open = orders.filter(isOpen);

  // Donut: open work orders by priority (the split by stage is already in the KPI tiles above).
  const priorityData = PRIORITIES.map((p, i) => ({
    key: p,
    label: t(`priority.${p}`),
    value: open.filter((o) => o.priority === p).length,
    color: i === 0 ? 'var(--status-critical)' : `var(--series-${i + 1})`,
  }));

  // Columns: open work orders by delivery window.
  const dueData = DUE_BUCKETS.map((b) => ({ ...b, value: open.filter((o) => b.test(daysUntil(o.expectedDeliveryDate))).length }));

  // Bars: units on order per product (open orders only).
  const units = {};
  open.forEach((o) => o.items.forEach((it) => (units[it.productId] = (units[it.productId] ?? 0) + it.qty)));
  const productData = Object.entries(units)
    .map(([id, value]) => ({ key: id, label: state.products.find((p) => p.id === id)?.name ?? id, value, sub: id }))
    .sort((a, b) => b.value - a.value);

  // Top customers: most work orders received in the period (units break ties), with last period's count.
  const topCustomers = customerList(orders)
    .sort((a, b) => b.orders - a.orders || b.units - a.units)
    .slice(0, TOP_N)
    .map((c) => {
      const before = (prevOrders ?? []).filter((o) => o.customer.name === c.name).length;
      return { key: c.name, label: c.name, value: c.orders, sub: `${c.units.toLocaleString('en-IN')} units · last period ${before}` };
    });

  // Top raw materials: issued when orders were accepted in the period. Units differ (kg, m, pcs…), so they are
  // ranked by how many work orders used them, not by quantity.
  const accepted = allOrders.filter((o) => acceptedAt(o) && period.inRange(acceptedAt(o)));
  const usesMaterial = (o, rmId) => o.items.some((it) => state.products.find((p) => p.id === it.productId)?.bom[rmId]);
  const topMaterials = materialsUsed(accepted, state.products, state.materials)
    .map((r) => ({ ...r, orders: accepted.filter((o) => usesMaterial(o, r.rmId)).length, stock: state.materials.find((m) => m.id === r.rmId) }))
    .sort((a, b) => b.orders - a.orders || b.qty - a.qty)
    .slice(0, TOP_N);

  // Line: new work orders and completed stages over the period, up to today.
  const { monthly, buckets, bucketOf } = buildBuckets(period.from, period.end);
  const slot = (at) => buckets.findIndex((b) => b.key === bucketOf(at));
  const created = buckets.map(() => 0);
  const stages = buckets.map(() => 0);
  allOrders.forEach((o) => {
    const ci = slot(o.createdAt);
    if (ci >= 0) created[ci] += 1;
    o.history.forEach((h) => {
      const hi = slot(h.at);
      if (hi >= 0 && isStageEvent(h) && h.status !== 'PENDING_REVIEW') stages[hi] += 1;
    });
  });

  const activity = allOrders
    .flatMap((o) => o.history.map((h) => ({ ...h, orderId: o.id, customer: o.customer.name })))
    .filter((h) => period.inRange(h.at))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);
  // Shipments to customers that are on the way now (sales follow their own).
  const onTheWay = allOrders.filter((o) => o.dispatch && !isComplete(o.status)).sort((a, b) => (a.dispatch.eta ?? '').localeCompare(b.dispatch.eta ?? ''));
  const prevCount = (test) => (prevOrders ? prevOrders.filter(test).length : null);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <div className="dash-hero">
        <PageHeader
          title={`${greeting}, ${user.name.split(' ')[0]}`}
          subtitle={`${ROLES[user.role].label} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        />
      </div>

      <PeriodPicker hint="work orders received in this period" />

      <div className="kpis">
        <Link to="/orders" className="kpi tone-blue">
          <span className="kpi-icon">
            <Icon name="file" size={16} />
          </span>
          <span className="kpi-value">{orders.length}</span>
          <span className="kpi-label">Total {t('nav.orders')}</span>
          <Delta now={orders.length} prev={prevOrders?.length} compact />
        </Link>
        {ORDER_FILTERS.map((g) => (
          <Link key={g.key} to={`/orders?group=${g.key}`} className={`kpi tone-${g.tone}`}>
            <span className="kpi-icon">
              <Icon name={g.icon} size={16} />
            </span>
            <span className="kpi-value">{orders.filter(g.test).length}</span>
            <span className="kpi-label">{g.label}</span>
            <Delta now={orders.filter(g.test).length} prev={prevCount(g.test)} goodWhen={LOWER_IS_BETTER.includes(g.key) ? 'down' : 'up'} compact />
          </Link>
        ))}
      </div>

      <div className="chart-grid">
        <Card title="Open work orders by priority" icon="alert" className="chart-card">
          <DonutChart data={priorityData} centerLabel="open orders" />
        </Card>
        <Card title="Open orders by delivery window" icon="clock" className="chart-card">
          <p className="chart-sub">Days left until the expected delivery date</p>
          <ColumnChart data={dueData} unit="Work orders" onSelect={(k) => k === 'late' && navigate('/orders?group=delayed')} />
        </Card>
        <Card title="Units on order by product" icon="box" className="chart-card">
          <p className="chart-sub">Open work orders only</p>
          {productData.length ? <BarList data={productData} unit="Units" /> : <EmptyState title="No open work orders" />}
        </Card>
      </div>

      <div className="grid-2">
        {can(user.role, 'customers.view') && (
          <Card
            title="Top customers"
            icon="user"
            className="chart-card"
            actions={
              <Link to="/customers" className="small">
                All customers
              </Link>
            }
          >
            <p className="chart-sub">Most work orders received in this period</p>
            {topCustomers.length ? (
              <BarList data={topCustomers} unit="Work orders" color="var(--series-3)" onSelect={(name) => navigate(customerPath(name))} />
            ) : (
              <EmptyState title="No work orders in this period" />
            )}
          </Card>
        )}
        {can(user.role, 'inventory.view') && (
          <Card
            title="Top raw materials used"
            icon="factory"
            className="chart-card"
            actions={
              <Link to="/inventory" className="small">
                Raw materials
              </Link>
            }
          >
            <p className="chart-sub">Issued to work orders accepted in this period, ranked by how many orders used them</p>
            {topMaterials.length ? (
              <ol className="top-list">
                {topMaterials.map((m, i) => {
                  const low = m.stock && m.stock.stock <= m.stock.reorderLevel;
                  return (
                    <li key={m.rmId}>
                      <span className="top-rank">{i + 1}</span>
                      <span className="top-main">
                        <strong>{m.name}</strong>
                        <span className="muted small">
                          used in {m.orders} work order{m.orders === 1 ? '' : 's'} · {m.stock?.stock.toLocaleString('en-IN')} {m.unit} left
                          {low && <span className="bad-text"> · below reorder level</span>}
                        </span>
                      </span>
                      <span className="top-value">
                        {m.qty.toLocaleString('en-IN')} <small>{m.unit}</small>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState title="No raw material issued in this period" />
            )}
          </Card>
        )}
      </div>

      <div className="grid-2-1">
        <Card
          title={`Activity – ${period.label}, by ${monthly ? 'month' : 'day'}`}
          icon="layers"
          className="chart-card"
        >
          {buckets.length > 1 ? (
            <LineChart
              labels={buckets.map((b) => b.label)}
              series={[
                { key: 'created', label: 'New work orders', color: 'var(--series-1)', values: created },
                { key: 'stages', label: 'Stages completed', color: 'var(--series-2)', values: stages },
              ]}
            />
          ) : (
            <p className="chart-sub">
              {period.text}: {created[0] ?? 0} new work orders, {stages[0] ?? 0} stages completed. Pick a longer period to see the trend.
            </p>
          )}
        </Card>

        <Card title="Recent activity" icon="clock" className="feed-card">
          <ActivityFeed items={activity} empty="No activity in this period" />
        </Card>
      </div>

      <div className="grid-2">
        {can(user.role, 'dispatch.view') && <OnTheWay orders={onTheWay} />}
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
                <ul className="stock-alerts">
                  {lowStock.map((m) => (
                    <li key={m.id}>
                      <div className="row-between">
                        <span>{m.name}</span>
                        <span className="bad-text small">
                          {m.stock} / {m.reorderLevel} {m.unit}
                        </span>
                      </div>
                      <span className="meter" role="presentation">
                        <span style={{ width: `${Math.min(100, (m.stock / m.reorderLevel) * 100)}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
      </div>

      <Card
        title="Delayed, at-risk & pending work orders"
        icon="alert"
        className={delayed.length || likelyLate.length ? 'border-red' : ''}
        actions={
          <div className="chips tight" role="group" aria-label="Show delayed, likely late or pending">
            {Object.entries(LATE_TABS).map(([key, tab]) => (
              <button key={key} className={`chip ${lateTab === key ? 'active' : ''}`} aria-pressed={lateTab === key} onClick={() => setLateTab(key)}>
                {tab.label} <span>{lists[key].length}</span>
              </button>
            ))}
          </div>
        }
      >
        <p className="muted small">{LATE_TABS[lateTab].hint}</p>
        <OrderTable orders={lists[lateTab]} empty={LATE_TABS[lateTab].empty} />
      </Card>
    </>
  );
}

/** Shipments on their way to customers, soonest arrival first. */
function OnTheWay({ orders }) {
  return (
    <Card
      title="On the way to customers"
      icon="truck"
      actions={
        <Link to="/dispatch" className="small">
          All dispatches
        </Link>
      }
    >
      {orders.length === 0 ? (
        <EmptyState icon="truck" title="Nothing on the way right now" />
      ) : (
        <ul className="mini-ships">
          {orders.slice(0, 5).map((o) => (
            <li key={o.id}>
              <div className="row-between">
                <Link to={`/orders/${o.id}`}>
                  <strong>{o.id}</strong> <span className="muted">· {o.customer.name}</span>
                </Link>
                {o.dispatch.eta && (
                  <span className={`small ${daysUntil(o.dispatch.eta) < 0 ? 'bad-text' : daysUntil(o.dispatch.eta) <= 1 ? 'warn-text' : 'muted'}`}>
                    arrives {fmtDate(o.dispatch.eta)}
                  </span>
                )}
              </div>
              <div className="muted small">
                <Icon name="truck" size={12} /> {o.dispatch.carrier} · <code className="tracking">{o.dispatch.trackingId}</code>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
