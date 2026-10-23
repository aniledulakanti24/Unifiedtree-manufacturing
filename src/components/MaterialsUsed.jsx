import { useStore } from '../context/StoreContext';
import { materialsUsed } from '../utils';
import { Card, Delta, EmptyState } from './ui';

/**
 * Raw material issued in the period (orders accepted in it), with the previous period beside it.
 * Using less material than before shows as neither good nor bad, so the change is coloured neutrally.
 */
export default function MaterialsUsed({ orders, prevOrders }) {
  const { state } = useStore();
  const now = materialsUsed(orders, state.products, state.materials);
  const prev = prevOrders ? materialsUsed(prevOrders, state.products, state.materials) : null;
  const ids = [...new Set([...now.map((r) => r.rmId), ...(prev ?? []).map((r) => r.rmId)])];
  const rows = ids.map((id) => {
    const a = now.find((r) => r.rmId === id);
    const b = prev?.find((r) => r.rmId === id);
    return { id, name: (a ?? b).name, unit: (a ?? b).unit, qty: a?.qty ?? 0, prev: prev ? (b?.qty ?? 0) : null };
  });

  return (
    <Card title="Raw materials used" icon="factory" className="chart-card">
      <p className="chart-sub">Issued when the factory accepted the work order</p>
      {rows.length === 0 ? (
        <EmptyState title="No raw material issued in this period" />
      ) : (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col" className="num">
                  Used
                </th>
                {prev && (
                  <th scope="col" className="num">
                    Change
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small">{r.name}</td>
                  <td className="num">
                    <strong>{r.qty.toLocaleString('en-IN')}</strong> <span className="muted small">{r.unit}</span>
                  </td>
                  {prev && (
                    <td className="num">
                      <Delta now={r.qty} prev={r.prev} goodWhen="none" compact />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
