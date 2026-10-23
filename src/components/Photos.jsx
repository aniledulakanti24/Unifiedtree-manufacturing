import { useState } from 'react';
import { Modal } from './ui';
import Icon from './Icon';

const MAX_SIDE = 900; // px – enough to see a scratch or a label, small enough for browser storage
const QUALITY = 0.62;

/** Shrinks a photo to a JPEG data URL (about 60–120 KB). */
function compress(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Not an image'));
    };
    img.src = url;
  });
}

/** Take or choose photos (camera on phones). Shows thumbnails with remove buttons. */
export function PhotoPicker({ photos, onChange, max = 4, label = 'Photos' }) {
  const [busy, setBusy] = useState(false);
  const add = async (files) => {
    setBusy(true);
    const room = max - photos.length;
    const next = [];
    for (const f of [...files].slice(0, room)) {
      try {
        next.push(await compress(f));
      } catch {
        /* skip files that are not images */
      }
    }
    onChange([...photos, ...next]);
    setBusy(false);
  };
  return (
    <div className="photo-picker">
      <span className="photo-label">
        {label} <span className="muted small">({photos.length}/{max})</span>
      </span>
      <div className="photo-row">
        {photos.map((src, i) => (
          <span key={i} className="photo-thumb">
            <img src={src} alt={`Photo ${i + 1}`} />
            <button type="button" className="photo-remove" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))}>
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        {photos.length < max && (
          <label className="photo-add">
            <Icon name="camera" size={20} />
            <span>{busy ? 'Adding…' : 'Add photo'}</span>
            <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => add(e.target.files)} className="sr-only" />
          </label>
        )}
      </div>
    </div>
  );
}

/** Thumbnails that open full size. */
export function PhotoGallery({ photos = [], title = 'Photo' }) {
  const [open, setOpen] = useState(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="photo-row">
        {photos.map((src, i) => (
          <button key={i} type="button" className="photo-thumb" onClick={() => setOpen(i)} aria-label={`Open ${title.toLowerCase()} ${i + 1}`}>
            <img src={src} alt="" />
          </button>
        ))}
      </div>
      {open != null && (
        <Modal title={`${title} ${open + 1} of ${photos.length}`} onClose={() => setOpen(null)}>
          <img src={photos[open]} alt={`${title} ${open + 1}`} className="photo-full" />
        </Modal>
      )}
    </>
  );
}
