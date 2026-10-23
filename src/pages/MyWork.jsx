import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlan, useStore, useVisibleOrders } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { isComplete, isOpen, openApproval, pendingActionFor } from '../data/statuses';
import { STAGE_ICONS } from '../data/reasons';
import { usePeriod } from '../context/PeriodContext';
import { Card, Delta, EmptyState, PriorityBadge, StatTiles, dueText, dueTone } from '../components/ui';
import PeriodPicker from '../components/PeriodPicker';
import { ReasonText } from '../components/ReasonPicker';
import { DelayButton } from '../components/Delay';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import ActivityFeed from '../components/ActivityFeed';
import { DeliverySchedule, FactoryToday, QcToday } from '../components/FactoryToday';
import { daysUntil, delayDays, fmtDate, isStageEvent } from '../utils';

const PRIORITY_RANK = { Urgent: 0, High: 1, Normal: 2 };

// Tabs on top of the grid; each one filters the cards. `risk` is the forecast per order id.
const TABS = [
  { key: 'all', label: 'due.all', test: () => true },
  { key: 'risk', label: 'risk.tab', test: (o, risk) => risk[o.id]?.level === 'high' },
  { key: 'late', label: 'due.overdue', test: (o) => dueTone(o.expectedDeliveryDate) === 'late' },
  { key: 'soon', label: 'due.soon', test: (o) => dueTone(o.expectedDeliveryDate) === 'soon' },
  { key: 'delayed', label: 'delay.tab', test: (o) => (o.delays?.length ?? 0) > 0 },
  { key: 'approval', label: 'approval.title', test: (o) => Boolean(openApproval(o)) },
  { key: 'problem', label: 'work.problemTab', test: (o) => Boolean(o.problem) },
];

/** Everything waiting on the current user, as a grid of small cards (4 per row on a wide screen). */
export default function MyWork() {
  const { user } = useAuth();
  const { t } = useLang();
  const period = usePeriod();
  const orders = useVisibleOrders();
  const { risk } = usePlan();
  const [tab, setTab] = useState('all');

  // Jobs come from work orders received in the chosen period ("All time" shows everything waiting).
  const jobs = orders
    .filter((o) => period.inRange(o.createdAt) && (pendingActionFor(user.role, o) || o.problem))
    .sort(
      (a, b) =>
        Boolean(b.problem) - Boolean(a.problem) ||
        daysUntil(a.expectedDeliveryDate) - daysUntil(b.expectedDeliveryDate) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    );
  const active = TABS.find((x) => x.key === tab) ?? TABS[0];
  const shown = jobs.filter((o) => active.test(o, risk));

  // What this person did, newest first, across the orders they can see – within the period.
  const allMine = orders.flatMap((o) =>
    o.history.filter((h) => h.by === user.name).map((h) => ({ ...h, orderId: o.id, customer: o.customer.name })),
  );
  const mine = allMine.filter((h) => period.inRange(h.at)).sort((a, b) => b.at.localeCompare(a.at));
  // Steps this person completed in the period, against the previous one.
  const done = mine.length;
  const donePrev = allMine.filter((h) => period.inPrev(h.at)).length;
  const count = (key) => jobs.filter((o) => TABS.find((x) => x.key === key).test(o, risk)).length;
  // Sales people follow their own customers' orders: what others did on them lately, and their order counts.
  const sales = can(user.role, 'orders.create') && !can(user.role, 'orders.viewAll');
  // People who run the floor (factory, supervisor, admin) see the factory at a glance and this week's deliveries.
  const floor = can(user.role, 'production.update') || can(user.role, 'stage.approve');
  const updates = orders
    .flatMap((o) => o.history.filter((h) => h.by !== user.name).map((h) => ({ ...h, orderId: o.id, customer: o.customer.name })))
    .filter((h) => period.inRange(h.at))
    .sort((a, b) => b.at.localeCompare(a.at));

  const stats = [
    { key: 'all', label: t('work.stat.waiting'), value: jobs.length, icon: 'inbox', tone: 'blue' },
    { key: 'late', label: t('work.stat.late'), value: count('late'), icon: 'alert', tone: 'red' },
    { key: 'soon', label: t('work.stat.soon'), value: count('soon'), icon: 'clock', tone: 'amber' },
    {
      key: null,
      label: period.key === 'today' ? t('work.stat.doneToday') : t('work.stat.donePeriod'),
      value: done,
      prev: donePrev,
      icon: 'checkCircle',
      tone: 'green',
    },
  ];

  return (
    <div className="work-page">
      <div className="work-head">
        <div>
          <h1>{t('work.hello', { name: user.name.split(' ')[0] })}</h1>
          <p className="work-count">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {jobs.length ? t('work.count', { n: jobs.length }) : t('work.none')}
          </p>
        </div>
      </div>

      <PeriodPicker hint="jobs from work orders received in this period" />

      <div className="work-stats">
        {stats.map((s) => {
          const body = (
            <>
              <span className="ws-icon">
                <Icon name={s.icon} size={18} />
              </span>
              <span className="ws-value">{s.value}</span>
              <span className="ws-label">
                {s.label} {s.prev != null && <Delta now={s.value} prev={s.prev} compact />}
              </span>
            </>
          );
          return s.key ? (
            <button
              key={s.label}
              className={`ws tone-${s.tone} ${tab === s.key ? 'active' : ''}`}
              aria-label={`${s.label}: ${s.value}`}
              aria-pressed={tab === s.key}
              onClick={() => setTab(s.key)}
            >
              {body}
            </button>
          ) : (
            <div key={s.label} className={`ws tone-${s.tone}`}>
              {body}
            </div>
          );
        })}
      </div>

      {jobs.length > 0 && (
        <div className="work-tabs" role="tablist" aria-label={t('work.filter')}>
          {TABS.map((x) => {
            const n = jobs.filter((o) => x.test(o, risk)).length;
            if (x.key !== 'all' && n === 0) return null;
            return (
              <button
                key={x.key}
                role="tab"
                aria-selected={tab === x.key}
                className={`work-tab ${tab === x.key ? 'active' : ''} tab-${x.key}`}
                onClick={() => setTab(x.key)}
              >
                {t(x.label)} <span className="work-tab-n">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="card">
          <EmptyState icon="checkCircle" title={t('work.none')} />
        </div>
      ) : (
        <div className="work-grid">
          {shown.map((o) => (
            <WorkCard key={o.id} order={o} />
          ))}
        </div>
      )}

      {floor && (
        <>
          <FactoryToday />
          <DeliverySchedule />
        </>
      )}
      {!floor && can(user.role, 'qc.inspect') && <QcToday />}
      {sales && <MyOrders orders={orders} />}

      <div className={`work-panels ${sales ? '' : 'single'}`}>
        {sales && (
          <Card title="Latest on your orders" icon="bell" className="feed-card">
            <ActivityFeed items={updates.slice(0, 10)} empty="No news on your orders in this period" />
          </Card>
        )}
        <Card title={t('work.recent')} icon="checkCircle" className="feed-card">
          <ActivityFeed items={mine.slice(0, 10)} empty={t('work.recentNone')} />
        </Card>
      </div>
    </div>
  );
}

/** One job: who it is for, where it stands, what to make, and the one thing to do next. */
function WorkCard({ order: o }) {
  const { user } = useAuth();
  const { state } = useStore();
  const { t } = useLang();
  const action = pendingActionFor(user.role, o);
  const tone = dueTone(o.expectedDeliveryDate);
  const a = openApproval(o);
  const product = (id) => state.products.find((p) => p.id === id)?.name ?? id;

  const lastDelay = o.delays?.[o.delays.length - 1];
  const r = usePlan().risk[o.id];

  return (
    <article className={`wc ${o.problem ? 'has-problem' : ''}`} aria-label={`${o.id} · ${o.customer.name}`}>
      <header className="wc-head">
        <div className="wc-title">
          <Link to={`/orders/${o.id}`} className="wc-customer stretched" title={o.customer.name}>
            {o.customer.name}
          </Link>
          <span className="wc-id">
            {o.id} · PO {o.customerPoNo}
          </span>
        </div>
        {o.priority !== 'Normal' && <PriorityBadge priority={o.priority} />}
      </header>

      <div className="wc-status">
        <span className="wc-stage">
          <span className="wc-stage-icon" aria-hidden="true">
            {STAGE_ICONS[o.status] ?? '⚙️'}
          </span>
          {t(`status.${o.status}`)}
        </span>
        <span className={`wc-due due-${tone}`}>
          <Icon name="clock" size={13} /> {dueText(t, o.expectedDeliveryDate)}
        </span>
      </div>

      <ul className="wc-items">
        {o.items.map((it, i) => (
          <li key={i}>
            <b>{it.qty}</b>
            <span>{product(it.productId)}</span>
          </li>
        ))}
      </ul>

      {(a || o.problem || lastDelay || r?.level === 'high') && (
        <div className="wc-flags">
          {r?.level === 'high' && (
            <span className="wc-flag problem" title={r.reasons.join('\n')}>
              ⚠ {t('risk.likely')}
              {r.forecast && ` · ${t('risk.forecast')} ${fmtDate(r.forecast)}`}
              {r.reasons[0] && <span className="wc-flag-sub">{r.reasons[0]}</span>}
            </span>
          )}
          {lastDelay && (
            <span className="wc-flag delay">
              ⏳ {t('delay.badge', { n: delayDays(o) })} – <ReasonText code={lastDelay.code} note="" />
              <span className="wc-flag-sub">
                {t('delay.promised')} {fmtDate(o.originalDeliveryDate)} → {fmtDate(o.expectedDeliveryDate)}
              </span>
            </span>
          )}
          {a?.state === 'pending' && <span className="wc-flag pending">⏳ {t('approval.pending')}</span>}
          {a?.state === 'rejected' && <span className="wc-flag rejected">✖ {t('approval.rejectedShort')}</span>}
          {o.problem && (
            <span className="wc-flag problem">
              ⚠️ <ReasonText code={o.problem.code} note="" />
            </span>
          )}
        </div>
      )}

      <footer className="wc-foot">
        <span className={`wc-action ${action ? '' : 'none'}`}>
          <span>{action ?? t('work.open')}</span>
          <Icon name="arrowRight" size={16} />
        </span>
        <span className="wc-foot-row">
          <span className="wc-by">{t('work.enteredBy', { name: o.createdByName })}</span>
          <DelayButton order={o} className="link-btn small wc-tool" />
        </span>
      </footer>
    </article>
  );
}

/** A sales person's own work orders at a glance: entered in the period, and where the open ones are now. */
function MyOrders({ orders }) {
  const period = usePeriod();
  const entered = orders.filter((o) => period.inRange(o.createdAt));
  const before = period.prev ? orders.filter((o) => period.inPrev(o.createdAt)).length : null;
  const at = (statuses) => orders.filter((o) => statuses.includes(o.status)).length;
  const deliveredIn = orders.filter((o) => o.history.some((h) => (h.status === 'DELIVERED' || h.status === 'DISPATCHED') && isStageEvent(h) && period.inRange(h.at))).length;
  return (
    <Card title="My work orders" icon="file" actions={<Link to="/orders" className="small">All my work orders</Link>}>
      <StatTiles
        label="My work orders"
        items={[
          {
            key: 'entered',
            label: 'Entered',
            value: entered.length,
            icon: 'plus',
            tone: 'indigo',
            sub: `${period.label}${before != null ? ` · ${before} before` : ''}`,
            to: '/orders',
          },
          { key: 'review', label: 'Waiting for factory', value: at(['PENDING_REVIEW', 'ON_HOLD']), icon: 'factory', tone: 'amber', to: '/orders?group=review' },
          { key: 'production', label: 'In production', value: orders.filter((o) => isOpen(o) && !['PENDING_REVIEW', 'ON_HOLD', 'CLIENT_APPROVED'].includes(o.status)).length, icon: 'layers', tone: 'blue', to: '/orders?group=production' },
          { key: 'ready', label: 'Ready to ship', value: at(['CLIENT_APPROVED']), icon: 'box', tone: 'teal', to: '/dispatch' },
          { key: 'transit', label: 'On the way', value: orders.filter((o) => o.dispatch && !isComplete(o.status)).length, icon: 'truck', tone: 'violet', to: '/dispatch' },
          { key: 'done', label: 'Sent / delivered', sub: period.label, value: deliveredIn, icon: 'checkCircle', tone: 'green', to: '/dispatch' },
        ]}
      />
    </Card>
  );
}
