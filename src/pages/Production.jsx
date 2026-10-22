import { Link } from 'react-router-dom';
import { useStore, useVisibleOrders } from '../context/StoreContext';
import { NEXT_STAGE, STATUS } from '../data/statuses';
import { STAGE_ICONS } from '../data/reasons';
import { DueDate, PageHeader, PriorityBadge } from '../components/ui';
import { ReasonText } from '../components/ReasonPicker';
import Icon from '../components/Icon';
import { useLang } from '../i18n';

const COLUMNS = ['ACCEPTED', 'IN_PRODUCTION', 'PACKAGING', 'READY_TO_DISPATCH'];

export default function Production() {
  const { state, act } = useStore();
  const { t } = useLang();
  const orders = useVisibleOrders();
  const product = (id) => state.products.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      <PageHeader title={t('prod.title')} subtitle={t('prod.subtitle')} />
      <div className="kanban">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col);
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
              {list.map((o) => (
                <div key={o.id} className={`kanban-card ${o.problem ? 'has-problem' : ''}`}>
                  <div className="row-between">
                    <Link to={`/orders/${o.id}`}>
                      <strong>{o.id}</strong>
                    </Link>
                    <PriorityBadge priority={o.priority} />
                  </div>
                  <div>{o.customer.name}</div>
                  <ul className="kanban-items">
                    {o.items.map((it, i) => (
                      <li key={i}>
                        <strong>
                          {it.qty} × {product(it.productId)}
                        </strong>
                        {it.specs && <span className="job-spec">{it.specs}</span>}
                      </li>
                    ))}
                  </ul>
                  {o.requirements && (
                    <div className="needs-box small">
                      <strong>📝 {t('work.customerNeeds')}:</strong> {o.requirements}
                    </div>
                  )}
                  {o.problem && (
                    <div className="problem-line small">
                      {t('problem.banner')} <ReasonText code={o.problem.code} note={o.problem.note} />
                    </div>
                  )}
                  <div className="small row-between">
                    <span>
                      {t('prod.due')} <DueDate date={o.expectedDeliveryDate} />
                    </span>
                    {(o.messages?.length ?? 0) > 0 && (
                      <Link to={`/orders/${o.id}#chat`} className="inline-icon" aria-label={`${o.messages.length} messages`}>
                        <Icon name="message" size={14} /> {o.messages.length}
                      </Link>
                    )}
                  </div>
                  {to ? (
                    <button
                      className="btn small primary block"
                      onClick={() => act('ADVANCE_STAGE', { id: o.id, to })}
                      aria-label={`${o.id}: ${t('prod.move', { stage: t(`flow.${to}`) })}`}
                    >
                      {t('prod.move', { stage: t(`flow.${to}`) })} <Icon name="arrowRight" size={14} />
                    </button>
                  ) : (
                    <div className="muted small inline-icon">
                      <Icon name="clock" size={14} /> {t('prod.waitQc')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
