import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useStore, useVisibleOrders } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { buildBuckets, isoDate, usePeriod } from '../context/PeriodContext';
import { Card, Delta, EmptyState, PageHeader, StatusBadge } from '../components/ui';
import { BarList, ColumnChart, LineChart } from '../components/Charts';
import PeriodPicker from '../components/PeriodPicker';
import MaterialsUsed from '../components/MaterialsUsed';
import { PROCESSES } from '../data/processes';
import Icon from '../components/Icon';
import ExportMenu from '../components/ExportMenu';
import { useLang } from '../i18n';
import { acceptedAt, fmtDateTime, isStageEvent, orderUnits } from '../utils';
import { FLOW, JOURNEY_STATUSES, QC_STEP, afterLastWork, isProductionStage } from '../data/statuses';

// ---------------------------------------------------------------- Events
// Every stage change in an order's history becomes one event; approvals and delays are kept apart.

// An order counts as produced when it leaves the last production stage, whichever step comes next.
const stageEvents = () => FLOW.map((f) => f.key).filter((k) => k !== 'CLIENT_APPROVED');

function collectEvents(orders) {
  return orders.flatMap((o) =>
    o.history.map((h, i) => ({
      ...h,
      orderId: o.id,
      customer: o.customer.name,
      units: orderUnits(o),
      order: o,
      kind: h.approval ? 'approval' : h.delay ? 'delay' : h.edit ? 'edit' : h.note?.startsWith('QC failed') ? 'qcFail' : 'stage',
      // Produced: the order left its last work step (whatever checks the admin put after it).
      made: isStageEvent(h) && afterLastWork(h.status) && isProductionStage(o.history.slice(0, i).findLast(isStageEvent)?.status),
    })),
  );
}

function summarize(events) {
  const stage = (s) => events.filter((e) => e.kind === 'stage' && e.status === s);
  const ready = events.filter((e) => e.made);
  const dispatched = stage('DISPATCHED');
  const promised = (o) => o.originalDeliveryDate ?? o.expectedDeliveryDate;
  const onTime = dispatched.filter((e) => isoDate(new Date(e.at)) <= promised(e.order)).length;
  const delays = events.filter((e) => e.kind === 'delay');
  return {
    received: stage('PENDING_REVIEW').length,
    producedOrders: ready.length,
    producedUnits: ready.reduce((s, e) => s + e.units, 0),
    qcPassed: events.filter((e) => e.kind === 'stage' && e.note?.startsWith('QC passed')).length,
    qcFailed: events.filter((e) => e.kind === 'qcFail').length,
    dispatchedOrders: dispatched.length,
    dispatchedUnits: dispatched.reduce((s, e) => s + e.units, 0),
    onTimePct: dispatched.length ? Math.round((onTime / dispatched.length) * 100) : null,
    delays: delays.length,
    delayDays: delays.reduce((s, e) => s + (Number(e.note.match(/Delayed (\d+) days/)?.[1]) || 0), 0),
  };
}

// ---------------------------------------------------------------- Page

export default function Reports() {
  const { state } = useStore();
  const { t } = useLang();
  const period = usePeriod();
  const { user } = useAuth();
  const reportRef = useRef(null);
  const orders = useVisibleOrders();

  const all = collectEvents(orders);
  const events = all.filter((e) => period.inRange(e.at)).sort((a, b) => b.at.localeCompare(a.at));
  const s = summarize(events);
  const p = period.prev ? summarize(all.filter((e) => period.inPrev(e.at))) : null;

  // Raw material is issued when an order is accepted.
  const acceptedNow = orders.filter((o) => acceptedAt(o) && period.inRange(acceptedAt(o)));
  const acceptedPrev = period.prev ? orders.filter((o) => acceptedAt(o) && period.inPrev(acceptedAt(o))) : null;

  // Scrap by reason, and labour hours by process, recorded in the period.
  const scrapBy = {};
  orders.forEach((o) => (o.scrap ?? []).filter((s) => period.inRange(s.at)).forEach((s) => (scrapBy[s.code] = (scrapBy[s.code] ?? 0) + s.qty)));
  const scrapData = Object.entries(scrapBy)
    .map(([code, value]) => ({ key: code, label: t(`reason.${code}`), value }))
    .sort((a, b) => b.value - a.value);
  const scrapTotal = scrapData.reduce((s, d) => s + d.value, 0);
  const labourBy = {};
  orders.forEach((o) =>
    (o.timeLogs ?? [])
      .filter((x) => x.end && period.inRange(x.end))
      .forEach((x) => (labourBy[x.process] = (labourBy[x.process] ?? 0) + (Date.parse(x.end) - Date.parse(x.start)) / 3600000)),
  );
  const labourData = Object.entries(labourBy)
    .map(([proc, h]) => ({ key: proc, label: PROCESSES[proc]?.label ?? proc, value: Math.round(h * 10) / 10 }))
    .sort((a, b) => b.value - a.value);
  const labourTotal = labourData.reduce((s, d) => s + d.value, 0);

  // Stage activity (columns) and units produced per product (bars).
  const stageData = stageEvents().map((st) => ({
    key: st,
    label: t(`flow.${st}`),
    value: events.filter((e) => e.kind === 'stage' && e.status === st).length,
  }));
  const byProduct = {};
  events
    .filter((e) => e.made)
    .forEach((e) => e.order.items.forEach((it) => (byProduct[it.productId] = (byProduct[it.productId] ?? 0) + it.qty)));
  const productData = Object.entries(byProduct)
    .map(([id, value]) => ({ key: id, label: state.products.find((x) => x.id === id)?.name ?? id, value }))
    .sort((a, b) => b.value - a.value);

  // Trend: daily up to two months, monthly beyond, up to today.
  const { monthly, buckets, bucketOf } = buildBuckets(period.from, period.end);
  const trend = (status) =>
    buckets.map((b) => events.filter((e) => (status === 'made' ? e.made : e.kind === 'stage' && e.status === status) && bucketOf(e.at) === b.key).reduce((sum, e) => sum + e.units, 0));

  const kpis = [
    { label: 'Units produced', value: s.producedUnits, prev: p?.producedUnits, sub: `${s.producedOrders} work orders finished`, icon: 'box', tone: 'blue' },
    { label: 'Units dispatched', value: s.dispatchedUnits, prev: p?.dispatchedUnits, sub: `${s.dispatchedOrders} work orders sent`, icon: 'truck', tone: 'green' },
    { label: 'Work orders received', value: s.received, prev: p?.received, icon: 'file', tone: 'indigo' },
    ...(JOURNEY_STATUSES.includes(QC_STEP) ? [{ label: 'QC passed / failed', value: `${s.qcPassed} / ${s.qcFailed}`, icon: 'shield', tone: 'teal' }] : []),
    { label: 'On-time dispatch', value: s.onTimePct == null ? '—' : `${s.onTimePct}%`, sub: 'Sent on or before the promised date', icon: 'clock', tone: 'violet' },
    { label: 'Delays reported', value: s.delays, prev: p?.delays, good: 'down', sub: s.delays ? `${s.delayDays} days in total` : 'None', icon: 'alert', tone: 'amber' },
  ];

  // Data for Excel / CSV: the headline figures, then every event in the period.
  const sheets = () => {
    const rows = [['Date', 'Time', 'Work order', 'Customer', 'Event', 'Units', 'By', 'Note']];
    events.forEach((e) => {
      const d = new Date(e.at);
      rows.push([
        isoDate(d),
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        e.orderId,
        e.customer,
        e.kind === 'stage' ? t(`flow.${e.status}`) : e.kind,
        e.units,
        e.by,
        e.note ?? '',
      ]);
    });
    const summary = [
      ['Production report', period.text],
      ['Prepared by', user.name],
      [],
      ['Figure', 'This period', 'Previous period'],
      ...kpis.map((k) => [k.label, k.value, k.prev ?? '']),
    ];
    return [
      { name: 'Summary', rows: summary },
      { name: 'Events', rows },
    ];
  };
  const fileName = `production-report_${period.from}_to_${period.to}`;

  return (
    <>
      <PageHeader title={t('nav.reports')} subtitle="Production done in the chosen period">
        <ExportMenu target={reportRef} sheets={sheets} fileName={fileName} title={`Production report – ${period.text}`} disabled={!events.length} />
      </PageHeader>

      <PeriodPicker hint="production activity in this period" />

      <div ref={reportRef} className="report-body">
      <p className="export-title">
        Production report · {period.text} · {user.name}
      </p>
      <div className="report-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`rk tone-${k.tone}`}>
            <span className="rk-head">
              <span className="rk-icon">
                <Icon name={k.icon} size={16} />
              </span>
              {k.label}
            </span>
            <span className="rk-value">{k.value}</span>
            {k.prev != null && <Delta now={k.value} prev={k.prev} goodWhen={k.good ?? 'up'} />}
            {k.sub && <span className="rk-sub">{k.sub}</span>}
          </div>
        ))}
      </div>

      {events.length === 0 ? (
        <Card>
          <EmptyState icon="calendar" title={`No production activity in ${period.text}`}>
            Try another period, or pick custom dates.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid-2-1">
            <Card title={`Units produced & dispatched – ${monthly ? 'by month' : 'by day'}`} icon="chart" className="chart-card">
              {buckets.length > 1 ? (
                <LineChart
                  labels={buckets.map((b) => b.label)}
                  series={[
                    { key: 'made', label: 'Units produced', color: 'var(--series-1)', values: trend('made') },
                    { key: 'sent', label: 'Units dispatched', color: 'var(--series-2)', values: trend('DISPATCHED') },
                  ]}
                />
              ) : (
                <p className="chart-sub">
                  Pick a longer period to see the trend. {period.text}: {s.producedUnits} units produced, {s.dispatchedUnits} dispatched.
                </p>
              )}
            </Card>
            <Card title="Units produced by product" icon="box" className="chart-card">
              {productData.length ? <BarList data={productData} unit="Units" /> : <EmptyState title="Nothing finished in this period" />}
            </Card>
          </div>

          <div className="grid-2-1">
            <Card title="Stage activity" icon="layers" className="chart-card">
              <p className="chart-sub">How many work orders reached each stage in this period</p>
              <ColumnChart data={stageData} unit="Work orders" />
            </Card>
            <MaterialsUsed orders={acceptedNow} prevOrders={acceptedPrev} />
          </div>

          <div className="grid-2">
            <Card title={`Scrap & rejections – ${scrapTotal} pcs`} icon="alert" className="chart-card">
              <p className="chart-sub">Pieces scrapped in production, rejected at QC or after job work, by reason</p>
              {scrapData.length ? <BarList data={scrapData} unit="Pieces" color="var(--status-critical)" /> : <EmptyState title="No scrap in this period" />}
            </Card>
            <Card title={`Labour hours – ${Math.round(labourTotal * 10) / 10} h`} icon="clock" className="chart-card">
              <p className="chart-sub">Time operators logged with Start / Stop work, by process</p>
              {labourData.length ? <BarList data={labourData} unit="Hours" color="var(--series-3)" /> : <EmptyState title="No work time logged in this period" />}
            </Card>
          </div>

          <Card title={`Activity log (${events.length})`} icon="clock">
            <div className="table-wrap">
              <table className="table compact report-log">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Work order</th>
                    <th scope="col">Event</th>
                    <th scope="col" className="num">
                      Units
                    </th>
                    <th scope="col">By</th>
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 50).map((e, i) => (
                    <tr key={i}>
                      <td className="nowrap small">{fmtDateTime(e.at)}</td>
                      <td>
                        <Link to={`/orders/${e.orderId}`}>{e.orderId}</Link>
                        <div className="muted small">{e.customer}</div>
                      </td>
                      <td>
                        {e.kind === 'stage' ? (
                          <StatusBadge status={e.status} />
                        ) : (
                          <span className={`badge tone-${e.kind === 'approval' ? 'violet' : e.kind === 'delay' ? 'amber' : 'red'}`}>
                            {{ approval: 'Approval', delay: 'Delay', qcFail: 'QC failed' }[e.kind]}
                          </span>
                        )}
                      </td>
                      <td className="num">{e.units}</td>
                      <td className="small">{e.by}</td>
                      <td className="small muted">{e.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {events.length > 50 && <p className="muted small">Showing the latest 50 of {events.length}. Export to Excel or CSV for all.</p>}
          </Card>
        </>
      )}
      </div>
    </>
  );
}
