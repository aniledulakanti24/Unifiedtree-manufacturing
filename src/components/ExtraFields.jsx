// Extra work order fields the administrator adds on the Customize page (e.g. "Drawing no.", "Colour").
// Each order keeps its own copy of label and value, so removing a field later does not wipe old orders.

import { fmtDate } from '../utils';

export const FIELD_TYPES = [
  { key: 'text', label: 'Text' },
  { key: 'number', label: 'Number' },
  { key: 'date', label: 'Date' },
  { key: 'select', label: 'Pick from a list' },
];

/** Inputs for the extra fields on the work order form. `values` = { fieldId: value }. */
export function ExtraFieldInputs({ fields, values, onChange }) {
  return fields.map((f) => (
    <label key={f.id} className={f.type === 'text' ? 'span-2' : ''}>
      <span>
        {f.label} {f.required && <span className="req">*</span>}
      </span>
      {f.type === 'select' ? (
        <select value={values[f.id] ?? ''} onChange={(e) => onChange(f.id, e.target.value)}>
          <option value="">Select…</option>
          {f.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input type={f.type} value={values[f.id] ?? ''} onChange={(e) => onChange(f.id, e.target.value)} />
      )}
    </label>
  ));
}

/** The filled-in extra fields, ready to store on the order. */
export const extraForOrder = (fields, values) =>
  fields
    .map((f) => ({ id: f.id, label: f.label, type: f.type, value: String(values[f.id] ?? '').trim() }))
    .filter((x) => x.value);

/** Error messages for required extra fields left empty. */
export const missingExtra = (fields, values) =>
  fields.filter((f) => f.required && !String(values[f.id] ?? '').trim()).map((f) => `${f.label} is required.`);

/** Rows for a <dl>: the extra fields stored on an order. */
export function ExtraFieldRows({ extra }) {
  return (extra ?? []).map((x) => [
    <dt key={`${x.id}-t`}>{x.label}</dt>,
    <dd key={`${x.id}-d`}>{x.type === 'date' ? fmtDate(x.value) : x.value}</dd>,
  ]);
}
