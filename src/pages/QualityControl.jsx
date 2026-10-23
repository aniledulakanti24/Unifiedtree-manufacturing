import { Link } from 'react-router-dom';
import { useStore, useVisibleOrders } from '../context/StoreContext';
import { usePeriod } from '../context/PeriodContext';
import { QC_STEP, openApproval, qcInspections } from '../data/statuses';
import { Card, DueChip, EmptyState, PageHeader, PriorityBadge, StatTiles } from '../components/ui';
import { BarList } from '../components/Charts';
import PeriodPicker from '../components/PeriodPicker';
import { ReasonText } from '../components/ReasonPicker';
import { timeAgo } from '../components/ActivityFeed';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { fmtDateTime } from '../utils';

const PRIORITY_RANK = { Urgent: 0, High: 1, Normal: 2 };

/**
 * Quality control: the inspection queue (what to check on each order), and how inspections went in the chosen
 * period – pass / fail, first-pass rate, pieces rejected, why, and on which products.
 */
export default function QualityControl() {
  const { t } = useLang();
  const { state } = useStore();
  const period = usePeriod();
  const orders = useVisibleOrders();
  const product = (id) => state.products.find((p) => p.id === id)?.name ?? id;

  // Waiting for inspection: most urgent first, then by delivery date.
  const queue = orders
    .filter((o) => o.status === QC_STEP)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate));
  const arrivedAt = (o) => o.history.findLast((h) => h.status === QC_STEP && !h.approval && !h.delay && !h.edit)?.at ?? o.createdAt;

  // Every inspection is in the order history ("QC passed …" / "QC failed …"); QC rejects are scrap with stage 'qc'.
  const inspections = orders
    .flatMap((o) => qcInspections(o).map((h) => ({ ...h, order: o })))
    .sort((a, b) => b.at.localeCompare(a.at));
  const inPeriod = inspections.filter((x) => period.inRange(x.at));
  const passed = inPeriod.filter((x) => x.pass).length;
  const failed = inPeriod.length - passed;
  // First-pass: orders whose first inspection in the period passed.
  const firstTries = Object.values(
    inPeriod.reduce((acc, x) => {
      if (!acc[x.order.id] || x.at < acc[x.order.id].at) acc[x.order.id] = x;
      return acc;
    }, {}),
  );
  const firstPass = firstTries.length ? Math.round((firstTries.filter((x) => x.pass).length / firstTries.length) * 100) : null;

  const rejects = orders.flatMap((o) => (o.scrap ?? []).filter((s) => s.stage === 'qc' && period.inRange(s.at)).map((s) => ({ ...s, order: o })));
  const rejectedPcs = rejects.reduce((n, s) => n + s.qty, 0);
  const byReason = {};
  rejects.forEach((s) => (byReason[s.code] = (byReason[s.code] ?? 0) + s.qty));
  // Fails without rejected pieces still count towards their reason.
  inPeriod.filter((x) => !x.pass && x.order.qc?.code && !rejects.some((s) => s.order.id === x.order.id)).forEach((x) => (byReason[x.order.qc.code] = (byReason[x.order.qc.code] ?? 0) + 1));
  const reasonData = Object.entries(byReason)
    .map(([code, value]) => ({ key: code, label: t(`reason.${code}`), value }))
    .sort((a, b) => b.value - a.value);
  const byProduct = {};
  rejects.forEach((s) => s.order.items.forEach((it) => (byProduct[it.productId] = (byProduct[it.productId] ?? 0) + s.qty / s.order.items.length)));
  const productData = Object.entries(byProduct)
    .map(([id, v]) => ({ key: id, label: product(id), value: Math.round(v) }))
    .sort((a, b) => b.value - a.value);

  const oldest = queue.length ? queue.reduce((m, o) => (arrivedAt(o) < m ? arrivedAt(o) : m), arrivedAt(queue[0])) : null;

  return (
    <>
      <PageHeader title={t('nav.qc')} subtitle="Orders waiting for inspection, and how inspections went. Passed reports go to the sales person and the customer." />

      <StatTiles
        label="Quality summary"
        items={[
          { key: 'queue', label: 'Waiting', value: queue.length, icon: 'inbox', tone: queue.length ? 'amber' : 'green', sub: oldest ? `oldest ${timeAgo(oldest)}` : undefined },
          { key: 'pass', label: 'Passed', sub: period.label, value: passed, icon: 'checkCircle', tone: 'green' },
          { key: 'fail', label: 'Failed', sub: period.label, value: failed, icon: 'xCircle', tone: failed ? 'red' : 'gray' },
          { key: 'fpy', label: 'First-time pass', sub: 'orders passing first go', value: firstPass == null ? '—' : `${firstPass}%`, icon: 'shield', tone: firstPass == null || firstPass >= 90 ? 'teal' : 'amber' },
          { key: 'rej', label: 'Pieces rejected', sub: period.label, value: rejectedPcs, icon: 'alert', tone: rejectedPcs ? 'red' : 'gray' },
        ]}
      />

      <Card title={`Inspection queue (${queue.length})`} icon="shield">
        {queue.length === 0 ? (
          <EmptyState icon="checkCircle" title="Nothing waiting for inspection" />
        ) : (
          <div className="qc-queue">
            {queue.map((o) => {
              const a = openApproval(o);
              const lastFail = o.qc?.result === 'FAIL' ? o.qc : null;
              return (
                <article key={o.id} className={`qc-card ${lastFail ? 'retry' : ''}`}>
                  <header className="rc-head">
                    <div className="rc-title">
                      <Link to={`/orders/${o.id}`} className="rc-id">
                        {o.id}
                      </Link>
                      <strong>{o.customer.name}</strong>
                      {o.priority !== 'Normal' && <PriorityBadge priority={o.priority} />}
                      {lastFail && <span className="badge tone-red">Re-inspection</span>}
                    </div>
                    <DueChip date={o.expectedDeliveryDate} />
                  </header>
                  <p className="muted small rc-sub">Ready for QC {timeAgo(arrivedAt(o))} · PO {o.customerPoNo}</p>
                  <ul className="rc-items">
                    {o.items.map((it, i) => (
                      <li key={i}>
                        <b>{it.qty}</b> × {product(it.productId)}
                        {it.specs && <span className="muted small"> · {it.specs}</span>}
                        {it.barcode && <span className="wd-barcode">🏷 Packets must carry {it.barcode}</span>}
                      </li>
                    ))}
                  </ul>
                  {o.requirements && <p className="qc-needs small">📝 {o.requirements}</p>}
                  {lastFail && (
                    <p className="small bad-text">
                      Failed last time ({fmtDateTime(lastFail.at)}): <ReasonText code={lastFail.code} note={lastFail.note} fallback={lastFail.remarks} />
                    </p>
                  )}
                  <footer className="rc-actions">
                    {a ? (
                      <span className="warn-text small">⏳ Waiting for sign-off of the step before – inspect after it is approved</span>
                    ) : (
                      <Link className="btn primary" to={`/orders/${o.id}`}>
                        <Icon name="shield" size={16} /> Inspect
                      </Link>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <PeriodPicker hint="inspections in this period" />

      <div className="grid-2">
        <Card title="Why pieces fail" icon="alert" className="chart-card">
          <p className="chart-sub">Rejected pieces by reason ({period.label})</p>
          {reasonData.length ? <BarList data={reasonData} unit="Pieces" color="var(--status-critical)" /> : <EmptyState icon="checkCircle" title="No rejects in this period" />}
        </Card>
        <Card title="Rejects by product" icon="box" className="chart-card">
          <p className="chart-sub">Pieces rejected at QC ({period.label})</p>
          {productData.length ? <BarList data={productData} unit="Pieces" color="var(--series-2)" /> : <EmptyState icon="checkCircle" title="No rejects in this period" />}
        </Card>
      </div>

      <Card title={`Inspection history (${inPeriod.length})`} icon="clock">
        {inPeriod.length === 0 ? (
          <EmptyState title={`No inspections in ${period.text}`} />
        ) : (
          <div className="table-wrap">
            <table className="table orders-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Work order</th>
                  <th>Result</th>
                  <th>Inspector</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {inPeriod.slice(0, 50).map((x, i) => (
                  <tr key={i}>
                    <td data-label="When" className="small nowrap">
                      {fmtDateTime(x.at)}
                    </td>
                    <td data-label="Work order">
                      <Link to={`/orders/${x.order.id}`}>
                        <strong>{x.order.id}</strong>
                      </Link>
                      <div className="small">{x.order.customer.name}</div>
                    </td>
                    <td data-label="Result">
                      <span className={`badge tone-${x.pass ? 'green' : 'red'}`}>{x.pass ? 'Passed' : 'Failed'}</span>
                    </td>
                    <td data-label="Inspector" className="small">
                      {x.by}
                    </td>
                    <td data-label="Remarks" className="small">
                      {x.note.replace(/^QC (passed|failed[^:]*):\s*/, '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
