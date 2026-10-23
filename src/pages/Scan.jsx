import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import jsQR from 'jsqr';
import { useStore } from '../context/StoreContext';
import { ordersUsingBatch } from '../data/stock';
import { Card, EmptyState, PageHeader, StatusBadge } from '../components/ui';
import Barcode from '../components/Barcode';
import BarcodeScanner from '../components/BarcodeScanner';
import Icon from '../components/Icon';
import { fmtDate } from '../utils';

/**
 * Point the phone camera at a QR code: a job card opens its work order, a batch label shows the batch –
 * where it is, how much is left and which work orders used it. Codes can also be typed.
 */
export default function Scan() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [camera, setCamera] = useState('off'); // off | starting | on | denied | none
  const [barScan, setBarScan] = useState(false); // 1D packet barcodes (EAN / Code 128) use a different reader
  const video = useRef(null);
  const stream = useRef(null);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera((c) => (c === 'on' || c === 'starting' ? 'off' : c));
  };

  // What a scanned text means: a work order link / number, or a batch (label code or batch number).
  const handle = (text) => {
    const raw = text.trim();
    const wo = raw.match(/WO-\d{4}-\d{4}/i);
    if (wo) {
      stop();
      return navigate(`/orders/${wo[0].toUpperCase()}`);
    }
    const lot = raw.match(/[?&]lot=([^&]+)/);
    const value = lot ? decodeURIComponent(lot[1]) : raw;
    setCode(value);
    setParams({ code: value }, { replace: true });
    stop();
  };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return setCamera('none');
    setCamera('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.current.srcObject = stream.current;
      await video.current.play();
      setCamera('on');
    } catch {
      setCamera('denied');
    }
  };

  // While the camera runs, read frames and look for a QR code.
  useEffect(() => {
    if (camera !== 'on') return undefined;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let raf;
    const scan = () => {
      const v = video.current;
      if (v?.readyState >= 2) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const found = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (found?.data) return handle(found.data);
      }
      raf = requestAnimationFrame(scan);
    };
    raf = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  return (
    <>
      <PageHeader title="Scan" subtitle="Scan a job card, a batch label or a packet barcode with the camera, or type the code" />
      <div className="grid-2">
        <Card title="Camera" icon="camera">
          <div className={`scan-view ${camera === 'on' ? 'on' : ''}`}>
            <video ref={video} playsInline muted aria-label="Camera view" />
            {camera !== 'on' && (
              <div className="scan-placeholder">
                <Icon name="qr" size={40} />
                {camera === 'denied' && <p>Camera permission was refused. Allow it in the browser, or type the code below.</p>}
                {camera === 'none' && <p>No camera available here – type the code below.</p>}
              </div>
            )}
            {camera === 'on' && <span className="scan-frame" aria-hidden="true" />}
          </div>
          <div className="btn-row">
            {camera === 'on' || camera === 'starting' ? (
              <button className="btn" onClick={stop}>
                Stop camera
              </button>
            ) : (
              <button className="btn primary" onClick={start}>
                <Icon name="camera" size={16} /> Start camera
              </button>
            )}
            <button
              className="btn"
              onClick={() => {
                stop();
                setBarScan(true);
              }}
            >
              <Icon name="box" size={16} /> Scan a packet barcode
            </button>
          </div>
          <form
            className="scan-manual"
            onSubmit={(e) => {
              e.preventDefault();
              handle(code);
            }}
          >
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="WO-2026-0001, batch e.g. SST-2609-114, or packet barcode" aria-label="Code" />
            <button className="btn">Look up</button>
          </form>
        </Card>
        <BatchResult code={params.get('code')} />
        {barScan && (
          <BarcodeScanner
            title="Scan a packet barcode"
            onClose={() => setBarScan(false)}
            onResult={(text) => {
              setBarScan(false);
              handle(text);
            }}
          />
        )}
      </div>
    </>
  );
}

/** A batch: where it is, how much is left, and which work orders used it. */
function BatchResult({ code }) {
  const { state } = useStore();
  if (!code) return null;
  const key = code.trim().toLowerCase();
  const lots = state.lots.filter((l) => l.id.toLowerCase() === key || l.batchNo.toLowerCase() === key);
  const used = ordersUsingBatch(state.orders, lots[0]?.batchNo ?? code);
  const material = (id) => state.materials.find((m) => m.id === id);
  const plant = (id) => state.plants.find((p) => p.id === id)?.name;
  // A customer's packet barcode: which work orders it is printed on.
  const packets = state.orders.filter((o) => o.items.some((it) => it.barcode?.trim().toLowerCase() === key));
  if (!lots.length && packets.length) return <PacketResult code={code.trim()} orders={packets} />;
  if (!lots.length && !used.length)
    return (
      <Card title={code} icon="search">
        <EmptyState title="No batch, work order or packet barcode with this code" />
      </Card>
    );
  return (
    <Card title={`Batch ${lots[0]?.batchNo ?? code}`} icon="layers">
      {lots.map((l) => (
        <dl key={l.id} className="dl">
          <dt>Material</dt>
          <dd>{material(l.rmId)?.name}</dd>
          <dt>Factory</dt>
          <dd>{plant(l.plantId)}</dd>
          <dt>Left</dt>
          <dd>
            <strong>
              {l.qty} / {l.received} {material(l.rmId)?.unit}
            </strong>
          </dd>
          <dt>Received</dt>
          <dd>
            {fmtDate(l.receivedAt)} · {l.source}
          </dd>
        </dl>
      ))}
      <h3 className="scan-sub">Used in {used.length} work order{used.length === 1 ? '' : 's'}</h3>
      <ul className="feed">
        {used.map((u, i) => (
          <li key={i}>
            <Link to={`/orders/${u.order.id}`} className="feed-main">
              {u.order.id} · {u.order.customer.name}
            </Link>
            <span className="feed-sub">
              {u.qty} {material(u.rmId)?.unit}
            </span>
          </li>
        ))}
      </ul>
      {lots[0] && (
        <Link className="btn" to={`/lots/${lots[0].id}/label`}>
          <Icon name="print" size={16} /> Print label
        </Link>
      )}
    </Card>
  );
}

/** A packet barcode: the work orders whose packets carry it, and their labels. */
function PacketResult({ code, orders }) {
  const { state } = useStore();
  const name = (id) => state.products.find((p) => p.id === id)?.name ?? id;
  return (
    <Card title={`Packet barcode ${code}`} icon="box">
      <Barcode value={code} height={46} />
      <h3 className="scan-sub">
        On {orders.length} work order{orders.length === 1 ? '' : 's'}
      </h3>
      <ul className="feed">
        {orders.map((o) => {
          const it = o.items.find((x) => x.barcode?.trim().toLowerCase() === code.toLowerCase());
          return (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="feed-main">
                {o.id} · {o.customer.name}
              </Link>
              <span className="feed-sub">
                {name(it.productId)} · {it.qty} units · <StatusBadge status={o.status} />{' '}
                <Link to={`/orders/${o.id}/labels`}>Labels</Link>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
