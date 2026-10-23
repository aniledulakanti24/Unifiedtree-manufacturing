import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useStore } from '../context/StoreContext';
import { FLOW } from '../data/statuses';
import { PROCESSES } from '../data/processes';
import Barcode from '../components/Barcode';
import { packetsFor } from '../components/PacketLabels';
import { EmptyState } from '../components/ui';
import Icon from '../components/Icon';
import { useLang } from '../i18n';
import { fmtDate, fmtDateTime, isStageEvent } from '../utils';

/**
 * Printable job card that travels with the goods on the shop floor. The QR code opens this work order
 * in the app – any phone camera can scan it, no special scanner needed.
 */
export default function JobCard() {
  const { id } = useParams();
  const { state } = useStore();
  const { t } = useLang();
  const order = state.orders.find((o) => o.id === id);
  const [qr, setQr] = useState('');
  const link = `${window.location.origin}/orders/${id}`;

  useEffect(() => {
    QRCode.toDataURL(link, { width: 220, margin: 1, errorCorrectionLevel: 'M' }).then(setQr, () => setQr(''));
  }, [link]);

  if (!order) return <EmptyState title={`Work order ${id} not found`} />;
  const plant = state.plants.find((p) => p.id === order.plantId);
  const product = (pid) => state.products.find((p) => p.id === pid);
  const hours = {};
  order.items.forEach((it) =>
    Object.entries(product(it.productId)?.route ?? {}).forEach(([proc, h]) => (hours[proc] = (hours[proc] ?? 0) + h * it.qty)),
  );
  const last = (key, approved) => [...order.history].reverse().find((h) => h.status === key && (approved ? h.approval === 'approved' : isStageEvent(h)));

  return (
    <>
      <div className="no-print jobcard-bar">
        <Link to={`/orders/${id}`} className="back-link">
          <Icon name="arrowLeft" size={16} /> {id}
        </Link>
        <button className="btn primary" onClick={() => window.print()}>
          <Icon name="print" size={16} /> Print job card
        </button>
      </div>

      <article className="jobcard">
        <header className="jc-head">
          <div>
            <div className="jc-brand">Unifiedtree · Job card</div>
            <h1 className="jc-id">{order.id}</h1>
            <div className="jc-sub">
              {order.customer.name} · PO {order.customerPoNo} · PI {order.piNo || '—'}
            </div>
            <div className="jc-sub">
              {plant?.name} · Due <strong>{fmtDate(order.expectedDeliveryDate)}</strong> · Priority <strong>{order.priority}</strong>
            </div>
            {order.extra?.length > 0 && (
              <div className="jc-sub">
                {order.extra.map((x) => (
                  <span key={x.id}>
                    {x.label} <strong>{x.type === 'date' ? fmtDate(x.value) : x.value}</strong>{' '}
                  </span>
                ))}
              </div>
            )}
          </div>
          <figure className="jc-qr">
            {qr ? <img src={qr} alt={`QR code linking to ${order.id}`} width="132" height="132" /> : <div className="jc-qr-empty" />}
            <figcaption>Scan to open</figcaption>
          </figure>
        </header>

        <section>
          <h2>What to make</h2>
          <table className="jc-table">
            <thead>
              <tr>
                <th>Qty</th>
                <th>Product</th>
                <th>Size / colour / details</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it, i) => (
                <tr key={i}>
                  <td className="jc-qty">{it.qty}</td>
                  <td>
                    {product(it.productId)?.name} <span className="jc-muted">{it.productId}</span>
                  </td>
                  <td>{it.specs || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {order.requirements && (
            <p className="jc-needs">
              <strong>Customer needs:</strong> {order.requirements}
            </p>
          )}
        </section>

        {order.items.some((it) => it.barcode) && (
          <section>
            <h2>Customer barcode on packets</h2>
            <div className="jc-barcodes">
              {order.items
                .filter((it) => it.barcode)
                .map((it, i) => (
                  <div key={i} className="jc-barcode">
                    <Barcode value={it.barcode} height={44} width={1.5} fontSize={12} />
                    <div>
                      <strong>{state.products.find((p) => p.id === it.productId)?.name}</strong>
                      <div className="jc-muted">
                        {it.packQty ? `${it.packQty} per packet · ` : ''}
                        {packetsFor(it)} labels
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        <section>
          <h2>Processes</h2>
          <table className="jc-table">
            <thead>
              <tr>
                <th>Process</th>
                <th>Planned hours</th>
                <th>Done by</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(hours).map(([proc, h]) => (
                <tr key={proc}>
                  <td>{PROCESSES[proc].label}</td>
                  <td>{Math.round(h * 10) / 10}</td>
                  <td className="jc-blank" />
                  <td className="jc-blank" />
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Stage sign-off</h2>
          <table className="jc-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Done by</th>
                <th>Approved by</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {FLOW.slice(1, -1).map(({ key }) => {
                const done = last(key);
                const ok = last(key, true);
                return (
                  <tr key={key}>
                    <td>{t(`flow.${key}`)}</td>
                    <td className={done ? '' : 'jc-blank'}>{done?.by}</td>
                    <td className={ok ? '' : 'jc-blank'}>{ok?.by}</td>
                    <td className={done ? '' : 'jc-blank'}>{done && fmtDateTime(done.at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Notes</h2>
          <div className="jc-lines" />
        </section>
        <footer className="jc-foot">
          Printed {fmtDateTime(new Date().toISOString())} · {link}
        </footer>
      </article>
    </>
  );
}
