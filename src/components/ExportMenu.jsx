import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { useToast } from '../context/ToastContext';

// Download a page section as PDF / JPEG / PNG (a picture of what is on screen) or its data as Excel / CSV.
// The libraries are loaded only when someone exports, so pages stay quick to open.

const FORMATS = [
  { key: 'pdf', label: 'PDF document', ext: 'pdf', icon: 'file' },
  { key: 'jpeg', label: 'JPEG image', ext: 'jpg', icon: 'camera' },
  { key: 'png', label: 'PNG image', ext: 'png', icon: 'camera' },
  { key: 'xlsx', label: 'Excel workbook', ext: 'xlsx', icon: 'chart' },
  { key: 'csv', label: 'CSV (spreadsheet text)', ext: 'csv', icon: 'download' },
];

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The section as a canvas, on the page's own background colour (drawn by the browser, so all CSS works). */
async function snapshot(el) {
  const { toCanvas } = await import('html-to-image');
  const bg = getComputedStyle(document.body).backgroundColor;
  return toCanvas(el, { backgroundColor: bg, pixelRatio: 2, cacheBust: true });
}

/** A4 PDF, the picture split over as many pages as it needs. */
async function toPdf(canvas, title) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const w = pageW - margin * 2;
  const pxPerMm = canvas.width / w;
  const sliceH = Math.floor((pageH - margin * 2) * pxPerMm);
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const part = document.createElement('canvas');
    part.width = canvas.width;
    part.height = Math.min(sliceH, canvas.height - y);
    part.getContext('2d').drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
    if (page) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, w, part.height / pxPerMm);
  }
  pdf.setProperties({ title });
  return pdf.output('blob');
}

const csvOf = (rows) => `﻿${rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')}`;

/**
 * Export button with a menu of formats.
 * target: ref to the element to capture (PDF / images). sheets: () => [{ name, rows: [[...], ...] }] for Excel / CSV
 * (CSV takes the last sheet – the detailed one). fileName: without extension.
 */
export default function ExportMenu({ target, sheets, fileName, title, disabled }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const run = async (f) => {
    setOpen(false);
    setBusy(f.key);
    try {
      const name = `${fileName}.${f.ext}`;
      if (f.key === 'xlsx') {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();
        sheets().forEach((s) => {
          const ws = XLSX.utils.aoa_to_sheet(s.rows);
          ws['!cols'] = s.rows[0]?.map((_, i) => ({ wch: Math.min(40, Math.max(10, ...s.rows.map((r) => String(r[i] ?? '').length + 2))) }));
          XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
        });
        save(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }), name);
      } else if (f.key === 'csv') {
        save(new Blob([csvOf(sheets().at(-1).rows)], { type: 'text/csv;charset=utf-8' }), name);
      } else {
        document.body.classList.add('exporting');
        // Let charts re-measure after the export title appears, or they are caught mid-redraw.
        await new Promise((r) => setTimeout(r, 350));
        const canvas = await snapshot(target.current);
        document.body.classList.remove('exporting');
        if (f.key === 'pdf') save(await toPdf(canvas, title), name);
        else canvas.toBlob((b) => save(b, name), f.key === 'png' ? 'image/png' : 'image/jpeg', 0.92);
      }
      toast(`Downloaded ${name}`);
    } catch (e) {
      document.body.classList.remove('exporting');
      toast(`Could not export: ${e.message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="export-menu" ref={ref}>
      <button className="btn" aria-haspopup="menu" aria-expanded={open} disabled={disabled || Boolean(busy)} onClick={() => setOpen((o) => !o)}>
        <Icon name="download" size={16} /> {busy ? `Preparing ${busy.toUpperCase()}…` : 'Export'}
      </button>
      {open && (
        <ul className="export-list" role="menu">
          {FORMATS.map((f) => (
            <li key={f.key} role="none">
              <button role="menuitem" onClick={() => run(f)}>
                <Icon name={f.icon} size={16} />
                <span>{f.label}</span>
                <span className="muted small">.{f.ext}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
