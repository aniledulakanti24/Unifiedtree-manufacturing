import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

// Customer barcodes printed on product packets. Retail codes are EAN-13 / EAN-8 / UPC-A (digits with a check
// digit); anything else (letters, part numbers) is printed as Code 128, which takes any text.

/** True when the last digit is the correct GS1 check digit (EAN-8, UPC-A, EAN-13). */
function gs1Ok(code) {
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Which barcode type a code is, and whether it looks right: { format, label, ok, warning }. */
export function barcodeInfo(raw) {
  const code = (raw ?? '').trim();
  if (!code) return { format: null, label: '', ok: false };
  if (/^\d{13}$/.test(code)) return gs1Ok(code) ? { format: 'EAN13', label: 'EAN-13', ok: true } : { format: 'CODE128', label: 'Code 128', ok: true, warning: 'The last digit does not match an EAN-13 check digit – please re-check the number.' };
  if (/^\d{12}$/.test(code)) return gs1Ok(code) ? { format: 'UPC', label: 'UPC-A', ok: true } : { format: 'CODE128', label: 'Code 128', ok: true, warning: 'The last digit does not match a UPC check digit – please re-check the number.' };
  if (/^\d{8}$/.test(code)) return gs1Ok(code) ? { format: 'EAN8', label: 'EAN-8', ok: true } : { format: 'CODE128', label: 'Code 128', ok: true };
  if (/^[\x20-\x7E]{1,48}$/.test(code)) return { format: 'CODE128', label: 'Code 128', ok: true };
  return { format: null, label: '', ok: false, warning: 'Use letters, digits and common symbols only (up to 48).' };
}

/** The barcode drawn as SVG (crisp on screen and in print). */
export default function Barcode({ value, height = 50, width = 1.6, fontSize = 13, className = '' }) {
  const ref = useRef(null);
  const info = barcodeInfo(value);
  useEffect(() => {
    if (!ref.current || !info.ok) return;
    try {
      JsBarcode(ref.current, value.trim(), { format: info.format, height, width, fontSize, margin: 6, background: '#ffffff', lineColor: '#000000', displayValue: true });
    } catch {
      /* invalid for this format – nothing drawn */
    }
  }, [value, info.format, info.ok, height, width, fontSize]);
  if (!info.ok) return null;
  return <svg ref={ref} className={`barcode ${className}`} role="img" aria-label={`Barcode ${value}`} />;
}
