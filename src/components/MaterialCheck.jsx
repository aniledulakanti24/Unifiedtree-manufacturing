import { useStore } from '../context/StoreContext';
import { checkAvailability } from '../utils';
import Icon from './Icon';

/** Required vs available raw material for an order. */
export default function MaterialCheck({ order }) {
  const { state } = useStore();
  const { rows, ok } = checkAvailability(order.items, state.products, state.materials);
  const consumed = order.materialsDeducted;

  return (
    <>
      <div className={`material-status ${consumed || ok ? 'ok' : 'bad'}`}>
        <Icon name={consumed || ok ? 'checkCircle' : 'alert'} size={18} />
        {consumed
          ? 'Raw material was issued from stock when the order was accepted.'
          : ok
            ? 'All raw material is available in stock.'
            : 'Raw material shortfall – the order cannot be accepted until restocked.'}
      </div>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>Raw material</th>
              <th className="num">{consumed ? 'Issued' : 'Required'}</th>
              <th className="num">In stock</th>
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
                <td className="num">
                  {r.available} {r.unit}
                </td>
                {!consumed && <td className={`num ${r.shortfall ? 'bad-text' : 'ok-text'}`}>{r.shortfall ? `${r.shortfall} ${r.unit}` : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
