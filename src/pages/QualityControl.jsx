import { useVisibleOrders } from '../context/StoreContext';
import { useLang } from '../i18n';
import { Card, PageHeader } from '../components/ui';
import OrderTable from '../components/OrderTable';
import { fmtDateTime } from '../utils';

export default function QualityControl() {
  const { t } = useLang();
  const orders = useVisibleOrders();
  const queue = orders.filter((o) => o.status === 'READY_TO_DISPATCH');
  const inspected = orders
    .filter((o) => o.qc && o.status !== 'READY_TO_DISPATCH')
    .sort((a, b) => b.qc.at.localeCompare(a.qc.at));

  return (
    <>
      <PageHeader title={t('nav.qc')} subtitle="Inspect orders marked Ready to Dispatch. Passed reports go to the sales person and client." />
      <Card icon="shield" title={`Awaiting inspection (${queue.length})`}>
        <OrderTable orders={queue} showAction={false} empty="No orders waiting for QC." />
      </Card>
      <Card icon="clock" title="Inspection history">
        <OrderTable
          orders={inspected}
          showAction={false}
          extra={[
            {
              header: 'QC result',
              render: (o) => (
                <span className={o.qc.result === 'PASS' ? 'ok-text' : 'bad-text'}>
                  {o.qc.result} <span className="muted small">{fmtDateTime(o.qc.at)}</span>
                </span>
              ),
            },
          ]}
          empty="No inspections yet."
        />
      </Card>
    </>
  );
}
