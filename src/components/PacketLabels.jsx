import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import Barcode from './Barcode';
import { Card } from './ui';
import Icon from './Icon';

/** Packets needed for a product line: quantity ÷ units per packet, rounded up (one per unit if not given). */
export const packetsFor = (it) => Math.ceil(it.qty / (Number(it.packQty) || 1));

/** The customer's packet barcodes on a work order, with the way to print the labels. */
export default function PacketLabels({ order }) {
  const { state } = useStore();
  const lines = order.items.filter((it) => it.barcode);
  if (!lines.length) return null;
  const name = (id) => state.products.find((p) => p.id === id)?.name ?? id;
  return (
    <Card
      title="Packet labels"
      icon="box"
      className="packet-card"
      actions={
        <Link className="btn small primary" to={`/orders/${order.id}/labels`}>
          <Icon name="print" size={14} /> Print labels
        </Link>
      }
    >
      <p className="muted small">The customer's own barcode goes on every packet of these products. Print the labels before packing.</p>
      <ul className="packet-lines">
        {lines.map((it, i) => (
          <li key={i}>
            <div>
              <strong>{name(it.productId)}</strong>
              <div className="muted small">
                {it.qty} units · {it.packQty ? `${it.packQty} per packet · ` : ''}
                <strong>{packetsFor(it)} labels</strong>
                {it.specs ? ` · ${it.specs}` : ''}
              </div>
            </div>
            <Barcode value={it.barcode} height={40} width={1.4} fontSize={12} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
