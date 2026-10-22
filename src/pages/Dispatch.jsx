import { useVisibleOrders } from '../context/StoreContext';
import { useLang } from '../i18n';
import { Card, PageHeader } from '../components/ui';
import OrderTable from '../components/OrderTable';
import { fmtDate } from '../utils';

export default function Dispatch() {
  const { t } = useLang();
  const orders = useVisibleOrders();
  const ready = orders.filter((o) => o.status === 'CLIENT_APPROVED');
  const shipped = orders.filter((o) => o.dispatch).sort((a, b) => b.dispatch.at.localeCompare(a.dispatch.at));

  return (
    <>
      <PageHeader title={t('nav.dispatch')} subtitle="QC- and client-approved orders. Assign a vehicle or delivery service and enter the tracking ID." />
      <Card icon="truck" title={`Ready to dispatch (${ready.length})`}>
        <OrderTable orders={ready} showAction={false} empty="No orders cleared for dispatch." />
      </Card>
      <Card icon="checkCircle" title="Dispatched shipments">
        <OrderTable
          orders={shipped}
          showAction={false}
          extra={[
            { header: 'Carrier / Vehicle', render: (o) => <span className="small">{o.dispatch.carrier}</span> },
            { header: 'Tracking ID', render: (o) => <code className="tracking">{o.dispatch.trackingId}</code> },
            { header: 'Dispatched', render: (o) => <span className="small nowrap">{fmtDate(o.dispatch.dispatchDate)}</span> },
          ]}
          empty="Nothing dispatched yet."
        />
      </Card>
    </>
  );
}
