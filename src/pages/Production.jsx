import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore, useVisibleOrders } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { JOURNEY_STATUSES, NEXT_STAGE, STATUS, canApprove, kindOf, openApproval, pendingActionFor, stageOwnerPerm } from '../data/statuses';
import { STAGE_ICONS } from '../data/reasons';
import { PageHeader, StageProgress, dueText, dueTone } from '../components/ui';
import { ReasonText } from '../components/ReasonPicker';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { daysUntil } from '../utils';

// Filters on top of the board, by days left until the expected delivery date.
const DUE_FILTERS = [
  { key: 'all', label: 'due.all', test: () => true },
  { key: 'late', label: 'due.overdue', tone: 'red', test: (d) => d < 0 },
  { key: 'soon', label: 'due.soon', tone: 'amber', test: (d) => d >= 0 && d <= 3 },
  { key: 'week', label: 'due.week', test: (d) => d >= 4 && d <= 7 },
  { key: 'later', label: 'due.later', test: (d) => d > 7 },
];

/** Where every order in production is: a board with one column per step, or a list. */
export default function Production() {
  const { user } = useAuth();
  const { state } = useStore();
  const { t } = useLang();
  const orders = useVisibleOrders();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const dueKey = params.get('due') ?? 'all';
  const mineOnly = params.get('mine') === '1';
  const stage = params.get('stage') ?? '';
  // Phones open on the list (a board of narrow columns is hard to read there); the choice is kept in the URL.
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
  const view = (params.get('view') ?? (narrow ? 'list' : 'board')) === 'list' ? 'list' : 'board';
  const q = params.get('q') ?? '';
  const filter = DUE_FILTERS.find((f) => f.key === dueKey) ?? DUE_FILTERS[0];
  const worker = can(user.role, 'production.update');

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };

  // One column per step of the admin's journey (work steps, and QC / customer approval wherever they sit).
  const COLUMNS = JOURNEY_STATUSES;
  const onBoard = orders.filter((o) => COLUMNS.includes(o.status));
  const isMine = (o) => Boolean(pendingActionFor(user.role, o) || o.problem);
  const term = q.trim().toLowerCase();
  const base = onBoard.filter(
    (o) => (!mineOnly || isMine(o)) && (!term || [o.id, o.customer.name, o.customerPoNo].some((v) => v.toLowerCase().includes(term))),
  );
  const shown = base
    .filter((o) => filter.test(daysUntil(o.expectedDeliveryDate)))
    .sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));
  const product = (id) => state.products.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      <PageHeader title={t('nav.production')} subtitle={t(worker ? 'prod.subtitle' : 'prod.subtitleView')}>
        <div className="view-toggle" role="group" aria-label="View">
          <button className={view === 'board' ? 'active' : ''} aria-pressed={view === 'board'} onClick={() => update('view', 'board')}>
            <Icon name="layers" size={15} /> Board
          </button>
          <button className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} onClick={() => update('view', 'list')}>
            <Icon name="file" size={15} /> List
          </button>
        </div>
      </PageHeader>

      {/* Where the orders are: one step per tile, click to show only that step. */}
      <ol className="stage-strip" aria-label="Orders at each step">
        {COLUMNS.map((col) => {
          const n = shown.filter((o) => o.status === col).length;
          return (
            <li key={col}>
              <button
                className={`ss tone-${STATUS[col].tone} ${stage === col ? 'active' : ''} ${n ? '' : 'zero'}`}
                aria-pressed={stage === col}
                onClick={() => update('stage', stage === col ? '' : col)}
              >
                <span className="ss-n">{n}</span>
                <span className="ss-label">{t(`flow.${col}`)}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="toolbar board-toolbar">
        <label className="search-field">
          <span className="sr-only">Search orders in production</span>
          <Icon name="search" size={16} />
          <input type="search" placeholder="Search WO, customer, PO…" value={q} onChange={(e) => update('q', e.target.value)} />
        </label>
        <div className="chips tight" role="group" aria-label={t('due.filter')}>
          {DUE_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter.key === f.key ? 'active' : ''} ${f.tone ? `chip-${f.tone}` : ''}`}
              aria-pressed={filter.key === f.key}
              onClick={() => update('due', f.key === 'all' ? '' : f.key)}
            >
              {t(f.label)} <span>{base.filter((o) => f.test(daysUntil(o.expectedDeliveryDate))).length}</span>
            </button>
          ))}
          {worker && (
            <button className={`chip ${mineOnly ? 'active' : ''}`} aria-pressed={mineOnly} onClick={() => update('mine', mineOnly ? '' : '1')}>
              👤 {t('due.mine')} <span>{onBoard.filter(isMine).length}</span>
            </button>
          )}
        </div>
      </div>

      {view === 'board' ? (
        <div className="board" style={{ '--cols': stage ? 1 : COLUMNS.length }}>
          {(stage ? [stage] : COLUMNS).map((col) => {
            const list = shown.filter((o) => o.status === col);
            // Only work steps are moved on from the board; QC and the customer act on the work order page.
            const to = kindOf(col) === 'work' ? NEXT_STAGE[col] : null;
            return (
              <section key={col} className="board-col" aria-label={t(`flow.${col}`)}>
                <h2 className={`board-head tone-${STATUS[col].tone}`}>
                  <span className="board-title">
                    <span aria-hidden="true">{STAGE_ICONS[col] ?? '⚙️'}</span> {t(`flow.${col}`)}
                  </span>
                  <span className="count-pill">{list.length}</span>
                </h2>
                <div className="board-cards">
                  {list.length === 0 && <p className="board-empty">{t('prod.empty')}</p>}
                  {list.map((o) => (
                    <BoardCard key={o.id} order={o} to={to} col={col} worker={worker} product={product} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table orders-table prod-table">
              <thead>
                <tr>
                  <th>Work order</th>
                  <th>Products</th>
                  <th>Step</th>
                  <th>Delivery</th>
                  <th>Next</th>
                </tr>
              </thead>
              <tbody>
                {shown
                  .filter((o) => !stage || o.status === stage)
                  .map((o) => (
                    <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)}>
                      <td data-label="Work order">
                        <Link to={`/orders/${o.id}`}>
                          <strong>{o.id}</strong>
                        </Link>
                        <div className="small">{o.customer.name}</div>
                      </td>
                      <td data-label="Products" className="small">
                        {o.items.map((it, i) => (
                          <div key={i}>
                            <b>{it.qty}</b> × {product(it.productId)}
                          </div>
                        ))}
                      </td>
                      <td data-label="Step">
                        <div className="small">
                          {STAGE_ICONS[o.status] ?? '⚙️'} {t(`flow.${o.status}`)}
                        </div>
                        <StageProgress status={o.status} />
                      </td>
                      <td data-label="Delivery">
                        <span className={`due-pill due-${dueTone(o.expectedDeliveryDate)}`}>{dueText(t, o.expectedDeliveryDate)}</span>
                      </td>
                      <td data-label="Next" className="small">
                        {pendingActionFor(user.role, o) ?? <span className="muted">{openApproval(o) ? t('approval.pending') : '—'}</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {shown.length === 0 && <p className="board-empty">{t('prod.empty')}</p>}
          </div>
        </div>
      )}
    </>
  );
}

/** A compact card: who, what, when, any warning, and the one move the factory can make. */
function BoardCard({ order: o, to, col, worker, product }) {
  const { act } = useStore();
  const { user } = useAuth();
  const { t } = useLang();
  const blocked = openApproval(o);
  const first = o.items[0];
  const tone = dueTone(o.expectedDeliveryDate);
  return (
    <article className={`bc ${o.problem ? 'has-problem' : ''} prio-${o.priority.toLowerCase()}`}>
      <div className="bc-top">
        <Link to={`/orders/${o.id}`} className="bc-id">
          {o.id}
        </Link>
        <span className={`due-pill due-${tone}`}>{dueText(t, o.expectedDeliveryDate)}</span>
      </div>
      <div className="bc-customer" title={o.customer.name}>
        {o.customer.name}
      </div>
      <div className="bc-items" title={o.items.map((it) => `${it.qty} × ${product(it.productId)}`).join('\n')}>
        <b>{first.qty}</b> × {product(first.productId)}
        {o.items.length > 1 && <span className="muted"> +{o.items.length - 1} more</span>}
      </div>
      {(o.problem || blocked || o.priority !== 'Normal' || o.items.some((it) => it.barcode)) && (
        <div className="bc-flags">
          {o.priority !== 'Normal' && <span className={`bc-flag prio`}>{t(`priority.${o.priority}`)}</span>}
          {o.items.some((it) => it.barcode) && (
            <span className="bc-flag" title="Print the customer's barcode labels for the packets">
              🏷 Packet labels
            </span>
          )}
          {o.problem && (
            <span className="bc-flag problem" title={o.problem.note}>
              ⚠ <ReasonText code={o.problem.code} note="" />
            </span>
          )}
          {blocked && <span className="bc-flag pending">{blocked.state === 'rejected' ? '✖ Sign-off rejected' : '⏳ Waiting for sign-off'}</span>}
        </div>
      )}
      {blocked ? (
        canApprove(user, o) ? (
          <Link className="btn small block bc-move" to={`/orders/${o.id}`}>
            <Icon name="lock" size={13} /> Sign off
          </Link>
        ) : (
          blocked.state === 'rejected' &&
          can(user.role, stageOwnerPerm(o.status)) && (
            <Link className="btn small block bc-move" to={`/orders/${o.id}`}>
              Fix &amp; resubmit
            </Link>
          )
        )
      ) : to && worker ? (
        <button
          className="btn small primary block bc-move"
          onClick={() => act('ADVANCE_STAGE', { id: o.id, to })}
          aria-label={`${o.id}: ${t('prod.move', { stage: t(`flow.${to}`) })}`}
        >
          {t(`flow.${to}`)} <Icon name="arrowRight" size={14} />
        </button>
      ) : (
        !to && (
          <div className="bc-wait">
            <Icon name="clock" size={12} /> {kindOf(col) === 'customer' ? 'Waiting for the customer' : t('prod.waitQc')}
          </div>
        )
      )}
    </article>
  );
}
