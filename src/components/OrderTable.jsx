import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { pendingActionFor } from '../data/statuses';
import { checkAvailability, itemsSummary } from '../utils';
import { DueDate, EmptyState, PriorityBadge, StatusBadge } from './ui';
import Icon from './Icon';

/**
 * Reusable PO table. Collapses into cards on small screens.
 * extra: optional array of { header, render(order) } columns appended at the end.
 */
export default function OrderTable({
  orders,
  showMaterials = false,
  showAction = true,
  extra = [],
  empty = 'No orders found.',
  emptyHint,
}) {
  const { state } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (orders.length === 0) return <EmptyState title={empty}>{emptyHint}</EmptyState>;

  return (
    <div className="table-wrap">
      <table className="table orders-table">
        <thead>
          <tr>
            <th scope="col">PO No.</th>
            <th scope="col">Customer</th>
            <th scope="col">Products</th>
            <th scope="col">Delivery</th>
            <th scope="col">Priority</th>
            <th scope="col">Status</th>
            {showMaterials && <th scope="col">Raw Material</th>}
            <th scope="col">Sales</th>
            {showAction && <th scope="col">Next Action</th>}
            {extra.map((c) => (
              <th key={c.header} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const action = pendingActionFor(user.role, o);
            const done = ['DISPATCHED', 'DELIVERED'].includes(o.status);
            const ok = showMaterials && checkAvailability(o.items, state.products, state.materials).ok;
            return (
              <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className={action ? 'has-action' : ''}>
                <td data-label="PO No." className="cell-po">
                  <Link to={`/orders/${o.id}`} onClick={(e) => e.stopPropagation()}>
                    {o.id}
                  </Link>
                  <div className="muted small">{o.customerPoNo}</div>
                </td>
                <td data-label="Customer" className="cell-customer">
                  {o.customer.name}
                </td>
                <td data-label="Products" className="small">
                  {itemsSummary(o, state.products)}
                </td>
                <td data-label="Delivery">
                  <DueDate date={o.expectedDeliveryDate} done={done} />
                </td>
                <td data-label="Priority">
                  <PriorityBadge priority={o.priority} />
                </td>
                <td data-label="Status" className="cell-status">
                  <StatusBadge status={o.status} />
                </td>
                {showMaterials && (
                  <td data-label="Raw material">
                    {ok ? (
                      <span className="ok-text inline-icon">
                        <Icon name="checkCircle" size={16} /> Available
                      </span>
                    ) : (
                      <span className="bad-text inline-icon">
                        <Icon name="alert" size={16} /> Shortfall
                      </span>
                    )}
                  </td>
                )}
                <td data-label="Sales" className="small">
                  {o.createdByName}
                </td>
                {showAction && (
                  <td data-label="Next action" className={`small cell-action ${action ? '' : 'empty-action'}`}>
                    {action ? (
                      <span className="action-hint">
                        {action} <Icon name="arrowRight" size={14} />
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                )}
                {extra.map((c) => (
                  <td key={c.header} data-label={c.header}>
                    {c.render(o)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
