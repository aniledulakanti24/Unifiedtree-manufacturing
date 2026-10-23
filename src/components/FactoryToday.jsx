import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlan, useStore, useVisibleMachines, useVisibleOrders } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { PRODUCTION_STATUSES, QC_STEP, canApprove, isOpen, openApproval, qcInspections } from '../data/statuses';
import { machineIsDown, suggestedPurchases } from '../data/planning';
import { STAGE_ICONS } from '../data/reasons';
import { Card, DueChip, EmptyState, StageProgress, StatTiles } from './ui';
import { useLang } from '../i18n';
import { daysUntil, fmtDate } from '../utils';

/** The factory at a glance: where work is waiting right now, each count a link to the page that clears it. */
export function FactoryToday() {
  const { user } = useAuth();
  const { state, plant } = useStore();
  const orders = useVisibleOrders();
  const machines = useVisibleMachines();
  const at = (statuses) => orders.filter((o) => statuses.includes(o.status)).length;
  const toBuy = can(user.role, 'purchase.view')
    ? suggestedPurchases(state)
        .filter((g) => plant === 'all' || g.plantId === plant)
        .reduce((s, g) => s + g.lines.length, 0)
    : null;
  const down = machines.filter(machineIsDown).length;
  return (
    <Card title="Factory today" icon="factory">
      <StatTiles
        label="Factory today"
        items={[
          { key: 'review', perm: 'orders.review', label: 'To review / on hold', value: at(['PENDING_REVIEW', 'ON_HOLD']), icon: 'inbox', tone: 'amber', to: '/review' },
          { key: 'prod', perm: 'production.view', label: 'In production', value: at(PRODUCTION_STATUSES), icon: 'layers', tone: 'blue', to: '/production' },
          { key: 'qc', perm: 'production.view', label: 'Waiting for QC', value: at([QC_STEP]), icon: 'shield', tone: 'teal', to: '/production' },
          ...(can(user.role, 'stage.approve') ? [{ key: 'sign', perm: 'stage.approve', label: 'Waiting for sign-off', value: orders.filter((o) => canApprove(user, o)).length, icon: 'lock', tone: 'amber', to: '/approvals' }] : []),
          { key: 'ship', perm: 'dispatch.view', label: 'Ready to dispatch', value: at(['CLIENT_APPROVED']), icon: 'truck', tone: 'violet', to: '/dispatch' },
          { key: 'down', perm: 'machines.view', label: 'Machines down', value: down, icon: 'cog', tone: down ? 'red' : 'green', to: '/machines' },
          ...(toBuy != null ? [{ key: 'buy', label: 'Materials to buy', value: toBuy, icon: 'cart', tone: toBuy ? 'red' : 'green', to: '/purchasing' }] : []),
        ].map(({ perm, ...tile }) => (perm && !can(user.role, perm) ? { ...tile, to: undefined } : tile))}
      />
    </Card>
  );
}

/** Every open order due in the next 7 days (or already late): where it is and whether it will make it. */
export function DeliverySchedule() {
  const { t } = useLang();
  const orders = useVisibleOrders();
  const { plan, risk } = usePlan();
  const due = orders
    .filter((o) => isOpen(o) && daysUntil(o.expectedDeliveryDate) <= 7)
    .sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));

  const verdict = (o) => {
    if (daysUntil(o.expectedDeliveryDate) < 0) return { tone: 'red', text: 'Late' };
    if (o.status === 'CLIENT_APPROVED') return { tone: 'green', text: 'Ready to send' };
    if (risk[o.id]?.level === 'high') return { tone: 'red', text: 'At risk' };
    if (risk[o.id]?.level === 'watch') return { tone: 'amber', text: 'Tight' };
    return { tone: 'green', text: 'On track' };
  };

  return (
    <Card
      title="Delivery schedule – next 7 days"
      icon="calendar"
      actions={
        <Link to="/orders" className="small">
          All work orders
        </Link>
      }
    >
      {due.length === 0 ? (
        <EmptyState icon="checkCircle" title="Nothing due in the next 7 days" />
      ) : (
        <div className="table-wrap">
          <table className="table orders-table schedule-table">
            <thead>
              <tr>
                <th>Work order</th>
                <th>Now at</th>
                <th>Due</th>
                <th>Forecast</th>
              </tr>
            </thead>
            <tbody>
              {due.map((o) => {
                const v = verdict(o);
                const f = plan[o.id]?.finishDate;
                return (
                  <tr key={o.id}>
                    <td data-label="Work order">
                      <Link to={`/orders/${o.id}`}>
                        <strong>{o.id}</strong>
                      </Link>
                      <div className="small">{o.customer.name}</div>
                    </td>
                    <td data-label="Now at">
                      <span className="small">
                        {STAGE_ICONS[o.status] ?? '⚙️'} {t(`flow.${o.status}`)}
                        {openApproval(o) && <span className="warn-text"> · sign-off</span>}
                      </span>
                      <StageProgress status={o.status} />
                    </td>
                    <td data-label="Due">
                      <DueChip date={o.expectedDeliveryDate} />
                    </td>
                    <td data-label="Forecast">
                      <span className={`badge tone-${v.tone}`}>{v.text}</span>
                      {f && o.status !== 'CLIENT_APPROVED' && <div className="muted small">ready by {fmtDate(f)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** The QC inspector's day: what is waiting, and today's passes and fails. */
export function QcToday() {
  const orders = useVisibleOrders();
  const today = new Date().toISOString().slice(0, 10);
  const todays = orders.flatMap((o) => qcInspections(o).filter((h) => h.at.slice(0, 10) === today));
  const passed = todays.filter((h) => h.pass).length;
  return (
    <Card title="Quality today" icon="shield" actions={<Link to="/qc" className="small">Quality control</Link>}>
      <StatTiles
        label="Quality today"
        items={[
          { key: 'wait', label: 'Waiting for inspection', value: orders.filter((o) => o.status === QC_STEP).length, icon: 'inbox', tone: 'amber', to: '/qc' },
          { key: 'pass', label: 'Passed today', value: passed, icon: 'checkCircle', tone: 'green', to: '/qc' },
          { key: 'fail', label: 'Failed today', value: todays.length - passed, icon: 'xCircle', tone: todays.length - passed ? 'red' : 'gray', to: '/qc' },
        ]}
      />
    </Card>
  );
}
