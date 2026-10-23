import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore, useVisibleOrders } from '../context/StoreContext';
import { usePeriod } from '../context/PeriodContext';
import { canApprove, openApproval } from '../data/statuses';
import { Card, DueChip, EmptyState, PageHeader, PriorityBadge, StatTiles } from '../components/ui';
import StageApproval from '../components/StageApproval';
import ActivityFeed, { timeAgo } from '../components/ActivityFeed';
import Icon from '../components/Icon';
import { useLang } from '../i18n';

const PRIORITY_RANK = { Urgent: 0, High: 1, Normal: 2 };

/**
 * Stage sign-offs in one place: every step waiting for approval (what was done, by whom, for how long) to approve or
 * send back right here, steps sent back for fixing, and the latest decisions.
 */
export default function Approvals() {
  const { user } = useAuth();
  const { t } = useLang();
  const { act } = useStore();
  const period = usePeriod();
  const orders = useVisibleOrders();
  const [show, setShow] = useState('mine'); // mine | own | rejected

  const waiting = orders
    .filter((o) => openApproval(o)?.state === 'pending')
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        openApproval(a).at.localeCompare(openApproval(b).at) ||
        a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate),
    );
  const mine = waiting.filter((o) => canApprove(user, o));
  const own = waiting.filter((o) => !canApprove(user, o)); // your own work – someone else signs it off
  const rejected = orders.filter((o) => openApproval(o)?.state === 'rejected');
  const lists = { mine, own, rejected };
  const decisions = orders
    .flatMap((o) => o.history.filter((h) => (h.approval === 'approved' || h.approval === 'rejected') && period.inRange(h.at)).map((h) => ({ ...h, orderId: o.id, customer: o.customer.name })))
    .sort((a, b) => b.at.localeCompare(a.at));
  const oldest = mine.length ? mine.reduce((m, o) => (openApproval(o).at < m ? openApproval(o).at : m), openApproval(mine[0]).at) : null;

  const approveAll = () => {
    if (!window.confirm(`Approve ${mine.length} step${mine.length === 1 ? '' : 's'}? Each order moves on to its next step.`)) return;
    mine.forEach((o) => act('APPROVE_STAGE', { id: o.id, note: 'Approved' }));
  };

  return (
    <>
      <PageHeader title={t('nav.approvals')} subtitle="Steps waiting for your sign-off. Approve to let the order move on, or send it back with a reason.">
        {mine.length > 1 && (
          <button className="btn success" onClick={approveAll}>
            <Icon name="check" size={16} /> Approve all ({mine.length})
          </button>
        )}
      </PageHeader>

      <StatTiles
        label="Sign-off summary"
        items={[
          { key: 'mine', label: 'Waiting for you', value: mine.length, icon: 'lock', tone: mine.length ? 'amber' : 'green', sub: oldest ? `oldest ${timeAgo(oldest)}` : undefined, active: show === 'mine', onClick: () => setShow('mine') },
          ...(own.length ? [{ key: 'own', label: 'Your work – others sign', value: own.length, icon: 'user', tone: 'blue', active: show === 'own', onClick: () => setShow('own') }] : []),
          { key: 'rejected', label: 'Sent back – being fixed', value: rejected.length, icon: 'xCircle', tone: rejected.length ? 'red' : 'gray', active: show === 'rejected', onClick: () => setShow('rejected') },
          { key: 'done', label: `Decided · ${period.label}`, value: decisions.length, icon: 'checkCircle', tone: 'teal' },
        ]}
      />

      {lists[show].length === 0 ? (
        <Card>
          <EmptyState icon="checkCircle" title={show === 'mine' ? 'Nothing waiting for your sign-off' : show === 'rejected' ? 'Nothing sent back' : 'None'} />
        </Card>
      ) : (
        <div className="review-list">
          {lists[show].map((o) => (
            <SignOffCard key={o.id} order={o} />
          ))}
        </div>
      )}

      <Card title="Latest decisions" icon="clock" className="feed-card">
        <ActivityFeed items={decisions.slice(0, 12)} empty={`No sign-offs in ${period.text}`} />
      </Card>
    </>
  );
}

function SignOffCard({ order: o }) {
  const { state } = useStore();
  const { t } = useLang();
  const a = openApproval(o);
  const product = (id) => state.products.find((p) => p.id === id)?.name ?? id;
  // What the person wrote when they completed the step.
  const stepNote = o.history.findLast((h) => h.status === o.status && !h.approval && !h.delay && !h.edit)?.note;
  return (
    <article className={`review-card ${a.state === 'rejected' ? 'short' : 'held'}`}>
      <header className="rc-head">
        <div className="rc-title">
          <Link to={`/orders/${o.id}`} className="rc-id">
            {o.id}
          </Link>
          <strong>{o.customer.name}</strong>
          {o.priority !== 'Normal' && <PriorityBadge priority={o.priority} />}
        </div>
        <DueChip date={o.expectedDeliveryDate} />
      </header>
      <p className="signoff-step">
        <span className="badge tone-indigo">{t(`flow.${o.status}`)}</span>
        <span className="small">
          done by <strong>{a.requestedBy}</strong> · {timeAgo(a.at)}
        </span>
      </p>
      <ul className="rc-items">
        {o.items.map((it, i) => (
          <li key={i}>
            <b>{it.qty}</b> × {product(it.productId)}
            {it.specs && <span className="muted small"> · {it.specs}</span>}
          </li>
        ))}
      </ul>
      {stepNote && <p className="qc-needs small">💬 {stepNote}</p>}
      <StageApproval order={o} />
    </article>
  );
}
