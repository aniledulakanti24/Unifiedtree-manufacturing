import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import Barcode from '../components/Barcode';
import BarcodeScanner from '../components/BarcodeScanner';
import { packetsFor } from '../components/PacketLabels';
import { EmptyState } from '../components/ui';
import Icon from '../components/Icon';

// Sticker sizes that common label rolls / A4 label sheets come in (width × height in mm).
const SIZES = {
  small: { label: 'Small 50 × 25 mm', w: 50, h: 25, bar: 26 },
  medium: { label: 'Medium 75 × 38 mm', w: 75, h: 38, bar: 40 },
  large: { label: 'Large 100 × 50 mm', w: 100, h: 50, bar: 54 },
};

/**
 * Packet labels for a work order: the customer's barcode with product, quantity per packet, customer, PO and WO.
 * The factory prints them before packing; "Check a packet" confirms a packet carries the right barcode.
 */
export default function PacketLabelsPrint() {
  const { id } = useParams();
  const { state } = useStore();
  const order = state.orders.find((o) => o.id === id);
  const lines = order?.items.filter((it) => it.barcode) ?? [];
  const [size, setSize] = useState('medium');
  const [counts, setCounts] = useState(() => lines.map(packetsFor));
  const [check, setCheck] = useState('');
  const [scanning, setScanning] = useState(false);

  if (!order) return <EmptyState title={`Work order ${id} not found`} />;
  if (!lines.length)
    return (
      <div className="card">
        <EmptyState icon="box" title="No packet barcode on this work order">
          Sales add the customer&apos;s barcode to a product line when entering or editing the work order.
        </EmptyState>
        <Link className="btn" to={`/orders/${order.id}`}>
          <Icon name="arrowLeft" size={16} /> {order.id}
        </Link>
      </div>
    );

  const s = SIZES[size];
  const name = (pid) => state.products.find((p) => p.id === pid)?.name ?? pid;
  const total = counts.reduce((a, n) => a + (Number(n) || 0), 0);
  const code = check.trim();
  const match = code && lines.find((it) => it.barcode.trim() === code);

  return (
    <>
      <div className="no-print labels-bar">
        <Link to={`/orders/${order.id}`} className="back-link">
          <Icon name="arrowLeft" size={16} /> {order.id}
        </Link>
        <h1>Packet labels</h1>
        <p className="muted">
          {order.customer.name} · PO {order.customerPoNo} · {total} labels
        </p>

        <div className="labels-controls">
          <label>
            Label size
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              {Object.entries(SIZES).map(([k, x]) => (
                <option key={k} value={k}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          {lines.map((it, i) => (
            <label key={i}>
              {name(it.productId)} – labels
              <input
                type="number"
                min="0"
                value={counts[i]}
                onChange={(e) => setCounts((c) => c.map((n, j) => (j === i ? e.target.value : n)))}
                title={`${it.qty} units${it.packQty ? `, ${it.packQty} per packet` : ''}`}
              />
            </label>
          ))}
          <button className="btn primary" onClick={() => window.print()} disabled={!total}>
            <Icon name="print" size={16} /> Print {total} labels
          </button>
        </div>

        <div className="packet-check">
          <strong>Check a packet</strong>
          <span className="input-with-btn">
            <input value={check} onChange={(e) => setCheck(e.target.value)} placeholder="Scan or type the barcode on a packet" aria-label="Barcode on the packet" />
            <button type="button" className="btn" onClick={() => setScanning(true)}>
              <Icon name="camera" size={16} /> Scan
            </button>
          </span>
          {code &&
            (match ? (
              <span className="ok-text">✅ Correct – {name(match.productId)} for {order.customer.name}</span>
            ) : (
              <span className="bad-text">✖ Not this order&apos;s barcode. Expected {lines.map((it) => it.barcode).join(' or ')}.</span>
            ))}
        </div>
        {scanning && (
          <BarcodeScanner
            title="Scan the barcode on the packet"
            onClose={() => setScanning(false)}
            onResult={(text) => {
              setCheck(text);
              setScanning(false);
            }}
          />
        )}
      </div>

      <div className="label-sheet" style={{ '--lw': `${s.w}mm`, '--lh': `${s.h}mm` }}>
        {lines.flatMap((it, i) =>
          Array.from({ length: Math.min(500, Number(counts[i]) || 0) }, (_, n) => (
            <article key={`${i}-${n}`} className={`packet-label size-${size}`}>
              <div className="pl-text">
                <strong className="pl-product">{name(it.productId)}</strong>
                {size !== 'small' && it.specs && <span className="pl-spec">{it.specs}</span>}
                <span>{it.packQty ? `Qty ${it.packQty} pcs` : '1 pc'}</span>
                {size !== 'small' && (
                  <span className="pl-ref">
                    {order.customer.name} · PO {order.customerPoNo}
                  </span>
                )}
                <span className="pl-ref">{order.id}</span>
              </div>
              <Barcode value={it.barcode} height={s.bar} width={size === 'small' ? 1.1 : 1.5} fontSize={size === 'small' ? 10 : 12} />
            </article>
          )),
        )}
      </div>
    </>
  );
}
