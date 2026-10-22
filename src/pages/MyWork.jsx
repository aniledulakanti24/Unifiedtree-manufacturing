import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore, useVisibleOrders } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { NEXT_STAGE, openApproval, pendingActionFor } from '../data/statuses';
import { STAGE_ICONS } from '../data/reasons';
import { ApprovalBadge, DueChip, PeopleLine, PriorityBadge, StatusBadge, WorkDetails, dueText, dueTone } from '../components/ui';
import StageApproval from '../components/StageApproval';
import { ConfirmDialog, ReasonDialog, reasonRecord } from '../components/ReasonPicker';
import ProblemBox from '../components/ProblemBox';
import { LangToggle } from '../components/Layout';
import { useLang } from '../i18n';
import { checkAvailability, daysUntil, itemsSummary } from '../utils';

const VIEW_KEY = 'unifiedtree-scm-work-view';

// Big button text for moving an order to its next production stage.
const ADVANCE_LABEL = { ACCEPTED: 'act.start', IN_PRODUCTION: 'act.toPacking', PACKAGING: 'act.toQc' };
const PRIORITY_RANK = { Urgent: 0, High: 1, Normal: 2 };

/** Shop-floor home: one big card per job, pictures, colours and one main button. */
export default function MyWork() {
  const { user } = useAuth();
  const { t } = useLang();
  const orders = useVisibleOrders();
  const [dialog, setDialog] = useState(null);
  const [view, setViewState] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const setView = (v) => {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
    setViewState(v);
  };

  const jobs = orders
    .filter((o) => pendingActionFor(user.role, o) || o.problem)
    .sort(
      (a, b) =>
        Boolean(b.problem) - Boolean(a.problem) ||
        daysUntil(a.expectedDeliveryDate) - daysUntil(b.expectedDeliveryDate) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    );

  return (
    <div className={`work ${view === 'grid' ? 'work-wide' : ''}`}>
      <div className="work-head">
        <div>
          <h1>{t('work.hello', { name: user.name.split(' ')[0] })}</h1>
          <p className="work-count">{jobs.length ? t('work.count', { n: jobs.length }) : t('work.none')}</p>
        </div>
        <div className="row-gap">
          <div className="segmented view-toggle" role="group" aria-label={t('work.view')}>
            {['grid', 'cards'].map((v) => (
              <button key={v} className={view === v ? 'active' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                {t(`work.view.${v}`)}
              </button>
            ))}
          </div>
          <LangToggle className="btn lg lang-big" />
        </div>
      </div>

      {view === 'grid' ? (
        <div className="mini-grid">
          {jobs.map((o) => (
            <MiniWorkCard key={o.id} order={o} />
          ))}
        </div>
      ) : (
        <div className="work-list">
          {jobs.map((o) => (
            <JobCard key={o.id} order={o} openDialog={setDialog} />
          ))}
        </div>
      )}

      <Link to="/dashboard" className="work-foot small">
        {t('work.fullDashboard')} →
      </Link>

      {dialog?.type === 'confirm' && <ConfirmDialog {...dialog.props} onClose={() => setDialog(null)} />}
      {dialog?.type === 'reason' && <ReasonDialog {...dialog.props} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** Small card for the grid view: what, for whom, when it is due and what to do next. */
function MiniWorkCard({ order: o }) {
  const { user } = useAuth();
  const { state } = useStore();
  const { t } = useLang();
  const action = pendingActionFor(user.role, o);
  return (
    <Link to={`/orders/${o.id}`} className={`mini-card job-${dueTone(o.expectedDeliveryDate)}`}>
      <span className="mini-head">
        <strong className="nowrap">{o.id}</strong>
        <DueChip date={o.expectedDeliveryDate} />
      </span>
      <span className="mini-customer">{o.customer.name}</span>
      <span className="mini-work">🛠️ {itemsSummary(o, state.products)}</span>
      <span className="mini-badges">
        <StatusBadge status={o.status} />
        <ApprovalBadge order={o} />
      </span>
      {o.problem && <span className="problem-line small">{t('work.problem')}</span>}
      <span className="mini-action">{action ?? t('work.open')} →</span>
      <span className="muted small">👤 {o.createdByName}</span>
    </Link>
  );
}

function JobCard({ order: o, openDialog }) {
  const { user } = useAuth();
  const { state, act } = useStore();
  const { t } = useLang();
  const role = user.role;
  const tone = dueTone(o.expectedDeliveryDate);
  const messages = o.messages?.length ?? 0;

  const confirm = (message, onYes) =>
    openDialog({ type: 'confirm', props: { message, detail: `${o.id} · ${o.customer.name}`, onYes } });

  // The one main thing this person should do next on this order.
  let main = null;
  if (openApproval(o)) {
    main = <StageApproval order={o} big />;
  } else if (['PENDING_REVIEW', 'ON_HOLD'].includes(o.status) && can(role, 'orders.review')) {
    const { rows, ok } = checkAvailability(o.items, state.products, state.materials);
    const short = rows.filter((r) => r.shortfall).map((r) => `${r.name} (${r.shortfall} ${r.unit})`);
    main = (
      <>
        <p className={`material-line ${ok ? 'ok' : 'bad'}`}>{ok ? t('work.materialOk') : `${t('work.materialShort')} ${short.join(', ')}`}</p>
        <div className="work-actions">
          {ok && (
            <button className="btn success xl" onClick={() => confirm(t('act.accept'), () => act('REVIEW_ORDER', { id: o.id, decision: 'accept', note: '' }))}>
              {t('act.accept')}
            </button>
          )}
          <button
            className={`btn xl ${ok ? 'danger' : 'warn'}`}
            onClick={() =>
              openDialog({
                type: 'reason',
                props: {
                  group: 'hold',
                  title: t('reason.holdTitle'),
                  onSubmit: ({ code, note }) => {
                    act('REVIEW_ORDER', { id: o.id, decision: 'hold', note: reasonRecord(code, note), code, extra: note });
                    openDialog(null);
                  },
                },
              })
            }
          >
            {t('act.hold')}
          </button>
        </div>
      </>
    );
  } else if (NEXT_STAGE[o.status] && can(role, 'production.update')) {
    const to = NEXT_STAGE[o.status];
    const label = t(ADVANCE_LABEL[o.status]);
    main = (
      <button className="btn primary xl" onClick={() => confirm(label, () => act('ADVANCE_STAGE', { id: o.id, to }))}>
        {label}
      </button>
    );
  } else if (o.status === 'READY_TO_DISPATCH' && can(role, 'qc.inspect')) {
    main = (
      <Link className="btn primary xl" to={`/orders/${o.id}`}>
        {t('act.qc')}
      </Link>
    );
  } else if (o.status === 'QC_APPROVED' && can(role, 'client.approve')) {
    main = (
      <Link className="btn primary xl" to={`/orders/${o.id}`}>
        {t('act.askCustomer')}
      </Link>
    );
  } else if (o.status === 'CLIENT_APPROVED' && can(role, 'dispatch.manage')) {
    main = (
      <Link className="btn primary xl" to={`/orders/${o.id}`}>
        {t('act.dispatch')}
      </Link>
    );
  } else if (o.status === 'DISPATCHED' && can(role, 'delivery.confirm')) {
    main = (
      <button className="btn success xl" onClick={() => confirm(t('act.deliver'), () => act('DELIVER', { id: o.id, note: '' }))}>
        {t('act.deliver')}
      </button>
    );
  }

  return (
    <article className={`job job-${tone}`} aria-label={`${o.id} · ${o.customer.name}`}>
      <header className="job-head">
        <span className="job-stage">
          <span className="job-stage-icon" aria-hidden="true">
            {STAGE_ICONS[o.status]}
          </span>
          {t(`status.${o.status}`)}
        </span>
        <span className={`job-due due-${tone}`}>⏰ {dueText(t, o.expectedDeliveryDate)}</span>
      </header>

      <div className="job-who">
        <strong>{o.customer.name}</strong> <span className="muted small">{o.id}</span>{' '}
        {o.priority !== 'Normal' && <PriorityBadge priority={o.priority} />}
      </div>
      <div className="muted small">
        PO {o.customerPoNo} · PI {o.piNo || '—'}
      </div>

      <WorkDetails order={o} products={state.products} />
      <PeopleLine order={o} />

      {o.problem && <ProblemBox order={o} />}
      {main}

      <div className="job-tools">
        {!o.problem && <ProblemBox order={o} compact />}
        <Link className="btn lg" to={`/orders/${o.id}#chat`}>
          {t('work.message')} {messages > 0 && <span className="count-pill">{messages}</span>}
        </Link>
        <Link className="btn ghost lg" to={`/orders/${o.id}`}>
          {t('work.open')}
        </Link>
      </div>
    </article>
  );
}
