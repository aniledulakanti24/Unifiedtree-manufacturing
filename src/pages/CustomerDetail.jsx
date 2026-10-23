import { Link, useParams } from 'react-router-dom';
import { useVisibleOrders } from '../context/StoreContext';
import { usePeriod } from '../context/PeriodContext';
import { CUSTOMER_STAGES, customerFigures } from '../data/customers';
import { Card, Delta, EmptyState, PageHeader } from '../components/ui';
import { DonutChart } from '../components/Charts';
import PeriodPicker from '../components/PeriodPicker';
import MaterialsUsed from '../components/MaterialsUsed';
import OrderTable from '../components/OrderTable';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { acceptedAt, fmtDate } from '../utils';

const TILES = [
  { key: 'orders', label: 'Work orders received', icon: 'file', tone: 'blue' },
  { key: 'units', label: 'Units ordered', icon: 'box', tone: 'indigo' },
  { key: 'processing', label: 'In production', icon: 'layers', tone: 'violet', good: 'none' },
  { key: 'completed', label: 'Completed – awaiting dispatch', icon: 'checkCircle', tone: 'teal' },
  { key: 'arrived', label: 'Arrived (delivered)', icon: 'truck', tone: 'green' },
  { key: 'delayed', label: 'Delayed', icon: 'alert', tone: 'red', good: 'down' },
];

/** One customer: contact details, then everything for the chosen period, compared with the one before. */
export default function CustomerDetail() {
  const { name } = useParams();
  const { t } = useLang();
  const period = usePeriod();
  const all = useVisibleOrders().filter((o) => o.customer.name === name);

  const back = (
    <Link to="/customers" className="back-link">
      <Icon name="arrowLeft" size={16} /> {t('nav.customers')}
    </Link>
  );

  if (all.length === 0)
    return (
      <>
        <PageHeader title={name} back={back} />
        <Card>
          <EmptyState icon="user" title="No work orders for this customer">
            The customer may not exist, or their orders were entered by another sales person.
          </EmptyState>
        </Card>
      </>
    );

  const byDate = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = byDate[0];
  const c = latest.customer;
  const now = all.filter((o) => period.inRange(o.createdAt));
  const f = customerFigures(now);
  const p = customerFigures(all.filter((o) => period.inPrev(o.createdAt)));

  // Raw material follows the acceptance date (when stock was issued), not the order date.
  const acceptedNow = all.filter((o) => acceptedAt(o) && period.inRange(acceptedAt(o)));
  const acceptedPrev = all.filter((o) => acceptedAt(o) && period.inPrev(acceptedAt(o)));
  const stageData = CUSTOMER_STAGES.map((s, i) => ({ key: s.key, label: s.label, value: f[s.key], color: `var(--series-${i + 1})` }));

  return (
    <>
      <PageHeader title={name} subtitle={`${all.length} work orders in total · first on ${fmtDate(byDate.at(-1).createdAt)}`} back={back} />

      <Card className="customer-card">
        <dl className="customer-facts">
          <div>
            <dt>Contact</dt>
            <dd>{c.contact || '—'}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{c.address || '—'}</dd>
          </div>
          <div>
            <dt>Last order</dt>
            <dd>{fmtDate(latest.createdAt)}</dd>
          </div>
        </dl>
      </Card>

      <PeriodPicker hint={`work orders received from ${name}`} />

      <div className="report-kpis">
        {TILES.map((k) => (
          <div key={k.key} className={`rk tone-${k.tone}`}>
            <span className="rk-head">
              <span className="rk-icon">
                <Icon name={k.icon} size={16} />
              </span>
              {k.label}
            </span>
            <span className="rk-value">{f[k.key].toLocaleString('en-IN')}</span>
            <Delta now={f[k.key]} prev={p[k.key]} goodWhen={k.good ?? 'up'} />
          </div>
        ))}
      </div>

      <div className="grid-2-1">
        <Card title="Where the work orders stand" icon="layers" className="chart-card">
          {f.orders ? <DonutChart data={stageData} centerLabel="work orders" /> : <EmptyState title={`No work orders in ${period.text}`} />}
        </Card>
        <MaterialsUsed orders={acceptedNow} prevOrders={acceptedPrev} />
      </div>

      <Card title={`Work orders (${now.length})`} icon="file">
        <OrderTable orders={now} empty={`No work orders from ${name} in ${period.text}`} emptyHint="Pick a longer period in the date filter." />
      </Card>
    </>
  );
}
