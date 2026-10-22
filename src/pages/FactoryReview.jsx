import { useVisibleOrders } from '../context/StoreContext';
import { Card, PageHeader } from '../components/ui';
import OrderTable from '../components/OrderTable';

export default function FactoryReview() {
  const orders = useVisibleOrders();
  const pending = orders.filter((o) => o.status === 'PENDING_REVIEW');
  const held = orders.filter((o) => o.status === 'ON_HOLD');

  return (
    <>
      <PageHeader
        title="Factory Review"
        subtitle="New customer POs from sales. Accept if raw material is available, otherwise put on hold."
      />
      <Card icon="factory" title={`Awaiting decision (${pending.length})`}>
        <OrderTable orders={pending} showMaterials showAction={false} empty="No new POs to review." />
      </Card>
      <Card icon="alert" title={`On hold (${held.length})`}>
        <OrderTable
          orders={held}
          showMaterials
          showAction={false}
          extra={[{ header: 'Hold reason', render: (o) => <span className="small">{o.holdReason}</span> }]}
          empty="No orders on hold."
        />
      </Card>
    </>
  );
}
