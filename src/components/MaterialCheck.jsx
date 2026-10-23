import { useStore } from '../context/StoreContext';
import { orderAvailability } from '../data/stock';
import Icon from './Icon';

/** Required vs available raw material for an order in its own factory; after acceptance, the batches issued. */
export default function MaterialCheck({ order }) {
  const { state } = useStore();
  const { rows, ok } = orderAvailability(order, state);
  const consumed = order.materialsDeducted;
  const plant = state.plants.find((p) => p.id === order.plantId)?.name ?? 'this factory';
  const batches = (rmId) => (order.materialLots ?? []).filter((u) => u.rmId === rmId);

  return (
    <>
      <div className={`material-status ${consumed || ok ? 'ok' : 'bad'}`}>
        <Icon name={consumed || ok ? 'checkCircle' : 'alert'} size={18} />
        {consumed
          ? 'Raw material was issued from stock when the order was accepted – batches below.'
          : ok
            ? `All raw material is available at ${plant}.`
            : `Raw material short at ${plant} – the order cannot be accepted until restocked or transferred.`}
      </div>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>Raw material</th>
              <th className="num">{consumed ? 'Issued' : 'Required'}</th>
              {consumed ? <th>Batch</th> : <th className="num">In stock at {plant}</th>}
              {!consumed && <th className="num">Shortfall</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rmId}>
                <td>{r.name}</td>
                <td className="num">
                  {r.required} {r.unit}
                </td>
                {consumed ? (
                  <td className="small">
                    {batches(r.rmId).length
                      ? batches(r.rmId).map((u) => (
                          <div key={u.lotId}>
                            <code className="tracking">{u.batchNo}</code> {u.qty} {r.unit}
                          </div>
                        ))
                      : '—'}
                  </td>
                ) : (
                  <td className="num">
                    {r.available} {r.unit}
                  </td>
                )}
                {!consumed && <td className={`num ${r.shortfall ? 'bad-text' : 'ok-text'}`}>{r.shortfall ? `${r.shortfall} ${r.unit}` : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
