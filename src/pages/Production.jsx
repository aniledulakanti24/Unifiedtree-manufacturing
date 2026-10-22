import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore, useVisibleOrders } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { NEXT_STAGE, STATUS, openApproval, pendingActionFor } from '../data/statuses';
import { STAGE_ICONS } from '../data/reasons';
import { ApprovalBadge, DueChip, PageHeader, PeopleLine, PriorityBadge, WorkDetails } from '../components/ui';
import { ReasonText } from '../components/ReasonPicker';
import StageApproval from '../components/StageApproval';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { daysUntil } from '../utils';

const COLUMNS = ['ACCEPTED', 'IN_PRODUCTION', 'PACKAGING', 'READY_TO_DISPATCH'];

// Filters on top of the board, by days left until the expected delivery date.
const DUE_FILTERS = [
  { key: 'all', label: 'due.all', test: () => true },
  { key: 'late', label: 'due.overdue', tone: 'red', test: (d) => d < 0 },
  { key: 'soon', label: 'due.soon', tone: 'amber', test: (d) => d >= 0 && d <= 3 },
  { key: 'week', label: 'due.week', test: (d) => d >= 4 && d <= 7 },
  { key: 'later', label: 'due.later', test: (d) => d > 7 },
];

export default function Production() {
  const { user } = useAuth();
  const { state, act } = useStore();
  const { t } = useLang();
  const orders = useVisibleOrders();
  const [params, setParams] = useSearchParams();
  const dueKey = params.get('due') ?? 'all';
  const mineOnly = params.get('mine') === '1';
  const filter = DUE_FILTERS.find((f) => f.key === dueKey) ?? DUE_FILTERS[0];

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };

  const onBoard = orders.filter((o) => COLUMNS.includes(o.status));
  const isMine = (o) => Boolean(pendingActionFor(user.role, o) || o.problem);
  const base = mineOnly ? onBoard.filter(isMine) : onBoard;
  const shown = base
    .filter((o) => filter.test(daysUntil(o.expectedDeliveryDate)))
    .sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));

  return (
    <>
      <PageHeader title={t('nav.production')} subtitle={t('prod.subtitle')} />

      <div className="board-filters" role="group" aria-label={t('due.filter')}>
        <div className="chips">
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
          <button className={`chip ${mineOnly ? 'active' : ''}`} aria-pressed={mineOnly} onClick={() => update('mine', mineOnly ? '' : '1')}>
            👤 {t('due.mine')} <span>{onBoard.filter(isMine).length}</span>
          </button>
        </div>
      </div>

      <div className="kanban">
        {COLUMNS.map((col) => {
          const list = shown.filter((o) => o.status === col);
          const to = NEXT_STAGE[col];
          return (
            <div key={col} className="kanban-col">
              <h2 className={`kanban-head tone-${STATUS[col].tone}`}>
                <span>
                  <span aria-hidden="true">{STAGE_ICONS[col]}</span> {t(`flow.${col}`)}
                </span>
                <span className="count-pill">{list.length}</span>
              </h2>
              {list.length === 0 && <p className="kanban-empty">{t('prod.empty')}</p>}
              {list.map((o) => {
                const blocked = Boolean(openApproval(o));
                return (
                  <div key={o.id} className={`kanban-card ${o.problem ? 'has-problem' : ''}`}>
                    <div className="row-between">
                      <Link to={`/orders/${o.id}`}>
                        <strong>{o.id}</strong>
                      </Link>
                      <PriorityBadge priority={o.priority} />
                    </div>
                    <DueChip date={o.expectedDeliveryDate} />
                    <div>
                      <strong>{o.customer.name}</strong>
                      <div className="muted small">
                        PO {o.customerPoNo} · PI {o.piNo || '—'}
                      </div>
                    </div>
                    <WorkDetails order={o} products={state.products} compact />
                    {o.problem && (
                      <div className="problem-line small">
                        {t('problem.banner')} <ReasonText code={o.problem.code} note={o.problem.note} />
                      </div>
                    )}
                    <PeopleLine order={o} />
                    <div className="small row-between">
                      <ApprovalBadge order={o} />
                      {(o.messages?.length ?? 0) > 0 && (
                        <Link to={`/orders/${o.id}#chat`} className="inline-icon" aria-label={`${o.messages.length} messages`}>
                          <Icon name="message" size={14} /> {o.messages.length}
                        </Link>
                      )}
                    </div>
                    {blocked ? (
                      <StageApproval order={o} />
                    ) : to && can(user.role, 'production.update') ? (
                      <button
                        className="btn small primary block"
                        onClick={() => act('ADVANCE_STAGE', { id: o.id, to })}
                        aria-label={`${o.id}: ${t('prod.move', { stage: t(`flow.${to}`) })}`}
                      >
                        {t('prod.move', { stage: t(`flow.${to}`) })} <Icon name="arrowRight" size={14} />
                      </button>
                    ) : (
                      !to && (
                        <div className="muted small inline-icon">
                          <Icon name="clock" size={14} /> {t('prod.waitQc')}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
