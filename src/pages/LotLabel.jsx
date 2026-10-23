import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useStore } from '../context/StoreContext';
import { EmptyState } from '../components/ui';
import Icon from '../components/Icon';
import { fmtDate } from '../utils';

/** Printable label for a batch of raw material. Its QR opens the batch on the Scan page. */
export default function LotLabel() {
  const { id } = useParams();
  const { state } = useStore();
  const lot = state.lots.find((l) => l.id === id);
  const [qr, setQr] = useState('');
  const link = `${window.location.origin}/scan?lot=${encodeURIComponent(lot?.batchNo ?? id)}`;

  useEffect(() => {
    QRCode.toDataURL(link, { width: 200, margin: 1 }).then(setQr, () => setQr(''));
  }, [link]);

  if (!lot) return <EmptyState title={`Batch ${id} not found`} />;
  const m = state.materials.find((x) => x.id === lot.rmId);
  return (
    <>
      <div className="no-print jobcard-bar">
        <Link to="/inventory" className="back-link">
          <Icon name="arrowLeft" size={16} /> Raw materials
        </Link>
        <button className="btn primary" onClick={() => window.print()}>
          <Icon name="print" size={16} /> Print label
        </button>
      </div>
      <article className="lot-label">
        {qr && <img src={qr} alt={`QR code for batch ${lot.batchNo}`} width="150" height="150" />}
        <div>
          <div className="jc-brand">Unifiedtree · Raw material</div>
          <div className="lot-batch">{lot.batchNo}</div>
          <div className="lot-name">{m?.name}</div>
          <div>
            {lot.received} {m?.unit} · {state.plants.find((p) => p.id === lot.plantId)?.name}
          </div>
          <div className="jc-muted">
            Received {fmtDate(lot.receivedAt)} · {lot.source}
          </div>
        </div>
      </article>
    </>
  );
}
