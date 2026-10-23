import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui';
import Icon from './Icon';

// Reads a product barcode (EAN, UPC, Code 128, QR…) with the camera, or from a photo of the packet.
// The reader is loaded only when the scanner opens.

async function reader() {
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  return new BrowserMultiFormatReader();
}

/** Scanner in a dialog. onResult(text) is called once with the first code read. */
export default function BarcodeScanner({ title = 'Scan barcode', onResult, onClose }) {
  const video = useRef(null);
  const controls = useRef(null);
  const [status, setStatus] = useState('starting'); // starting | on | denied | none | photo-fail
  const done = useRef(false);

  const finish = (text) => {
    if (done.current) return;
    done.current = true;
    controls.current?.stop();
    onResult(text.trim());
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setStatus('none');
      try {
        const r = await reader();
        if (cancelled) return;
        controls.current = await r.decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current, (result) => {
          if (result) finish(result.getText());
        });
        if (cancelled) controls.current.stop();
        else setStatus('on');
      } catch {
        if (!cancelled) setStatus('denied');
      }
    })();
    return () => {
      cancelled = true;
      controls.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromPhoto = async (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const r = await reader();
      const result = await r.decodeFromImageUrl(url);
      finish(result.getText());
    } catch {
      setStatus('photo-fail');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div className="scanner">
        <video ref={video} className={`scanner-video ${status === 'on' ? '' : 'idle'}`} muted playsInline />
        {status === 'on' && <span className="scanner-line" aria-hidden="true" />}
        {status !== 'on' && (
          <p className="scanner-msg">
            {status === 'starting' && 'Starting the camera…'}
            {status === 'denied' && 'The camera is blocked or busy. Allow camera access, or use a photo below.'}
            {status === 'none' && 'This device has no camera here. Use a photo of the barcode below.'}
            {status === 'photo-fail' && 'No barcode found in that photo. Try a sharper, closer photo with the whole barcode in view.'}
          </p>
        )}
      </div>
      <p className="muted small">Hold the barcode flat, filling most of the frame. It is read automatically.</p>
      <label className="btn block">
        <Icon name="camera" size={16} /> Use a photo of the barcode
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => fromPhoto(e.target.files?.[0])} />
      </label>
    </Modal>
  );
}
