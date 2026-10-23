import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canEditOrder, isOpen } from '../data/statuses';
import { useStore } from '../context/StoreContext';
import { useLang } from '../i18n';
import { buildPlan } from '../data/planning';
import { PROCESSES } from '../data/processes';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { ExtraFieldInputs, extraForOrder, missingExtra } from '../components/ExtraFields';
import Barcode, { barcodeInfo } from '../components/Barcode';
import BarcodeScanner from '../components/BarcodeScanner';
import Icon from '../components/Icon';
import { fmtDate, sameData, todayISO } from '../utils';
import { orderAvailability } from '../data/stock';

const emptyItem = () => ({ productId: '', qty: '', specs: '', barcode: '', packQty: '' });

/** The form filled in from an existing work order, for editing it. */
const formFrom = (o) => ({
  customerPoNo: o.customerPoNo,
  poDate: o.poDate ?? '',
  piNo: o.piNo ?? '',
  piDate: o.piDate ?? '',
  expectedDeliveryDate: o.expectedDeliveryDate,
  priority: o.priority,
  plantId: o.plantId,
  requirements: o.requirements ?? '',
  customer: { name: '', contact: '', email: '', phone: '', address: '', ...o.customer },
  items: o.items.map((it) => ({ specs: '', barcode: '', ...it, qty: String(it.qty), packQty: it.packQty ? String(it.packQty) : '' })),
  extra: Object.fromEntries((o.extra ?? []).map((x) => [x.id, x.value])),
});

/** New work order, or – at /orders/:id/edit – changing one (sales, until it is dispatched). */
export default function NewOrder() {
  const { state, act, plant } = useStore();
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const editing = editId ? state.orders.find((o) => o.id === editId) : null;
  const [form, setForm] = useState(() =>
    editing
      ? formFrom(editing)
      : {
          customerPoNo: '',
          poDate: todayISO(),
          piNo: '',
          piDate: todayISO(),
          expectedDeliveryDate: '',
          priority: 'Normal',
          requirements: '',
          customer: { name: '', contact: '', email: '', phone: '', address: '' },
          items: [emptyItem()],
          extra: {},
        },
  );
  const [errors, setErrors] = useState([]);
  const [attempt, setAttempt] = useState(0);
  const [scanFor, setScanFor] = useState(null); // product line whose packet barcode is being scanned
  const errorRef = useRef(null);

  // Move focus to the error summary after a failed submit so it is seen / announced.
  useEffect(() => {
    if (attempt && errorRef.current) {
      errorRef.current.focus();
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [attempt]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const setExtra = (id, value) => setForm((f) => ({ ...f, extra: { ...f.extra, [id]: value } }));
  const setCustomer = (field, value) => setForm((f) => ({ ...f, customer: { ...f.customer, [field]: value } }));
  const setItem = (i, field, value) =>
    setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, [field]: value } : it)) }));

  // Extra fields the administrator added to the form.
  const extraFields = state.settings.orderFields ?? [];
  const validItems = form.items.filter((it) => it.productId && Number(it.qty) > 0);

  // Factory: the one chosen, else the one in view, else where these products are made.
  const plantId =
    form.plantId || (plant !== 'all' ? plant : validItems.some((it) => ['FG-103', 'FG-104'].includes(it.productId)) ? 'P2' : 'P1');

  // Raw material check against the chosen factory's stock (indicative – the factory confirms on review).
  const preview = orderAvailability({ items: validItems, plantId }, state);

  // When editing: did products, quantities or the factory change? After acceptance that means a new review.
  const asItems = (items) =>
    items.map((it) => ({ ...it, qty: Number(it.qty), specs: (it.specs ?? '').trim(), barcode: (it.barcode ?? '').trim(), packQty: Number(it.packQty) || '' }));
  // Only products, quantities and the factory change what raw material is needed (not specs or barcodes).
  const materials = (items) => items.map((it) => ({ productId: it.productId, qty: Number(it.qty) }));
  const materialChange =
    editing && (!sameData(materials(validItems), materials(editing.items)) || plantId !== editing.plantId);
  const backToReview = materialChange && editing.status !== 'PENDING_REVIEW';

  // Earliest date the factory can deliver if this order joins the back of the queue today.
  const earliest = validItems.length && (!editing || materialChange)
    ? buildPlan(state, {
        id: 'NEW',
        plantId,
        status: 'PENDING_REVIEW',
        items: validItems.map((it) => ({ ...it, qty: Number(it.qty) })),
        expectedDeliveryDate: '9999-12-31',
        createdAt: new Date().toISOString(),
      }).NEW
    : null;
  const tooEarly = earliest && !earliest.blocked.length && form.expectedDeliveryDate && form.expectedDeliveryDate < earliest.finishDate;

  const submit = (e) => {
    e.preventDefault();
    const errs = [];
    if (!form.customer.name.trim()) errs.push('Customer name is required.');
    if (!form.customer.phone.trim() && !form.customer.email.trim()) errs.push('Enter customer phone or email.');
    if (!form.customerPoNo.trim()) errs.push('Customer PO number is required.');
    if (!form.piNo.trim()) errs.push('PI (proforma invoice) number is required.');
    if (!form.expectedDeliveryDate) errs.push('Expected delivery date is required.');
    else if (form.expectedDeliveryDate < todayISO() && form.expectedDeliveryDate !== editing?.expectedDeliveryDate)
      errs.push('Expected delivery date cannot be in the past.');
    errs.push(...missingExtra(extraFields, form.extra));
    if (validItems.length === 0) errs.push('Add at least one product with quantity.');
    if (form.items.some((it) => (it.productId || it.qty) && !(it.productId && Number(it.qty) > 0)))
      errs.push('Each product line needs a product and a quantity above 0.');
    validItems.forEach((it, i) => {
      if (it.barcode?.trim() && !barcodeInfo(it.barcode).ok) errs.push(`Product line ${i + 1}: the packet barcode has characters a barcode cannot hold.`);
      if (it.packQty !== '' && it.packQty != null && !(Number(it.packQty) > 0)) errs.push(`Product line ${i + 1}: units per packet must be above 0.`);
    });
    setErrors(errs);
    if (errs.length) return setAttempt((n) => n + 1);

    const details = {
      customerPoNo: form.customerPoNo.trim(),
      poDate: form.poDate,
      piNo: form.piNo.trim(),
      piDate: form.piDate,
      expectedDeliveryDate: form.expectedDeliveryDate,
      priority: form.priority,
      plantId,
      requirements: form.requirements.trim(),
      customer: Object.fromEntries(Object.entries(form.customer).map(([k, v]) => [k, String(v ?? '').trim()])),
      items: asItems(validItems),
      extra: extraForOrder(extraFields, form.extra),
    };
    if (editing) {
      // Fields the admin has since removed keep what was entered on this order.
      const kept = (editing.extra ?? []).filter((x) => !extraFields.some((f) => f.id === x.id));
      const changes = { ...details, extra: [...details.extra, ...kept] };
      if (Object.keys(changes).every((k) => sameData(changes[k], editing[k]))) {
        setErrors(['Nothing has changed yet.']);
        return setAttempt((n) => n + 1);
      }
      act('UPDATE_ORDER', { id: editing.id, changes });
      return navigate(`/orders/${editing.id}`);
    }

    const id = `WO-${new Date().getFullYear()}-${String(state.counters.order + 1).padStart(4, '0')}`;
    act('CREATE_ORDER', { order: { id, ...details } });
    navigate(`/orders/${id}`);
  };

  if (editId && (!editing || !canEditOrder(user, editing)))
    return (
      <div className="card">
        <EmptyState
          icon="lock"
          title={!editing ? 'Work order not found' : isOpen(editing) ? `You cannot change ${editing.id}` : `${editing.id} can no longer be changed`}
        >
          {editing && (isOpen(editing) ? 'Only the sales person who entered it, or an administrator, can change a work order.' : 'A work order can be edited until it is dispatched.')}
        </EmptyState>
        <Link className="btn" to={editing ? `/orders/${editing.id}` : '/orders'}>
          <Icon name="arrowLeft" size={16} /> Back
        </Link>
      </div>
    );

  return (
    <form onSubmit={submit}>
      <PageHeader
        title={editing ? `Edit ${editing.id}` : t('nav.newOrder')}
        subtitle={
          editing
            ? 'Correct anything until the order is dispatched. The factory is told what changed, and the change is kept in the order history.'
            : 'Enter the customer, their PO and PI numbers and the products. On submit it goes to the factory for review.'
        }
        back={
          <Link to={editing ? `/orders/${editing.id}` : '/orders'} className="back-link">
            <Icon name="arrowLeft" size={16} /> {editing ? editing.id : t('nav.orders')}
          </Link>
        }
      />

      {backToReview && (
        <div className="alert amber" role="status">
          <span aria-hidden="true">⚠️</span>
          <div>
            <strong>Products, quantities or factory changed.</strong> When you save, this order goes back to factory review
            {editing.materialsDeducted ? ' and the raw material already issued for it is returned to stock' : ''}. Production starts again from the
            beginning once the factory accepts it.
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="alert red" role="alert" ref={errorRef} tabIndex={-1}>
          <Icon name="alert" size={18} />
          <div>
            <strong>Please fix the following:</strong>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid-2">
        <Card title="1. Customer, PO & PI" icon="user">
          <div className="form-grid">
            <label className="span-2">
              <span>
                Customer / Company name <span className="req">*</span>
              </span>
              <input value={form.customer.name} onChange={(e) => setCustomer('name', e.target.value)} autoComplete="organization" />
            </label>
            <label>
              <span>
                Customer PO number <span className="req">*</span>
              </span>
              <input value={form.customerPoNo} onChange={(e) => set('customerPoNo', e.target.value)} />
            </label>
            <label>
              PO date
              <input type="date" value={form.poDate} onChange={(e) => set('poDate', e.target.value)} />
            </label>
            <label>
              <span>
                PI number <span className="req">*</span>
              </span>
              <input value={form.piNo} onChange={(e) => set('piNo', e.target.value)} placeholder="Proforma invoice no." />
            </label>
            <label>
              PI date
              <input type="date" value={form.piDate} onChange={(e) => set('piDate', e.target.value)} />
            </label>
            <label>
              Contact person
              <input value={form.customer.contact} onChange={(e) => setCustomer('contact', e.target.value)} autoComplete="name" />
            </label>
            <label>
              Phone
              <input type="tel" value={form.customer.phone} onChange={(e) => setCustomer('phone', e.target.value)} autoComplete="tel" />
            </label>
            <label className="span-2">
              Email
              <input type="email" value={form.customer.email} onChange={(e) => setCustomer('email', e.target.value)} autoComplete="email" />
              <small className="hint">Phone or email is required.</small>
            </label>
            <label className="span-2">
              Delivery address
              <textarea rows={2} value={form.customer.address} onChange={(e) => setCustomer('address', e.target.value)} />
            </label>
          </div>
        </Card>

        <Card title="2. Work order details" icon="file">
          <div className="form-grid">
            <label>
              <span>
                Expected delivery date <span className="req">*</span>
              </span>
              <input
                type="date"
                min={editing && editing.expectedDeliveryDate < todayISO() ? editing.expectedDeliveryDate : todayISO()}
                value={form.expectedDeliveryDate}
                onChange={(e) => set('expectedDeliveryDate', e.target.value)}
              />
              {earliest &&
                (earliest.blocked.length ? (
                  <small className="field-error">
                    {earliest.blocked.map((p) => PROCESSES[p].label).join(', ')}: no running machine in this factory.
                  </small>
                ) : (
                  <small className={tooEarly ? 'field-error' : 'hint'}>
                    {tooEarly ? '⚠ Not possible with current capacity. ' : ''}Earliest the factory can deliver: <strong>{fmtDate(earliest.finishDate)}</strong>
                    {!form.expectedDeliveryDate || tooEarly ? (
                      <>
                        {' '}
                        <button type="button" className="link-btn" onClick={() => set('expectedDeliveryDate', earliest.finishDate)}>
                          Use this date
                        </button>
                      </>
                    ) : null}
                  </small>
                ))}
            </label>
            <label>
              Factory
              <select value={plantId} onChange={(e) => set('plantId', e.target.value)}>
                {state.plants.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                <option>Normal</option>
                <option>High</option>
                <option>Urgent</option>
              </select>
            </label>
            <label className="span-2">
              Customer requirements
              <textarea
                rows={3}
                placeholder="Certifications, packaging, colour, delivery instructions…"
                value={form.requirements}
                onChange={(e) => set('requirements', e.target.value)}
              />
            </label>
            <ExtraFieldInputs fields={extraFields} values={form.extra} onChange={setExtra} />
          </div>
        </Card>
      </div>

      <Card title="3. Products" icon="box">
        <div className="item-lines">
          {form.items.map((it, i) => (
            <fieldset key={i} className="item-line">
              <legend className="sr-only">Product line {i + 1}</legend>
              <span className="item-no" aria-hidden="true">
                {i + 1}
              </span>
              <label className="item-product">
                <span>
                  Product <span className="req">*</span>
                </span>
                <select value={it.productId} onChange={(e) => setItem(i, 'productId', e.target.value)}>
                  <option value="">Select product…</option>
                  {state.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="item-qty">
                <span>
                  Quantity <span className="req">*</span>
                </span>
                <input type="number" min="1" inputMode="numeric" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
              </label>
              <label className="item-specs">
                Specification / notes
                <input value={it.specs} onChange={(e) => setItem(i, 'specs', e.target.value)} placeholder="Colour, size, model…" />
              </label>
              <button
                type="button"
                className="icon-btn item-remove"
                aria-label={`Remove product line ${i + 1}`}
                disabled={form.items.length === 1}
                onClick={() => set('items', form.items.filter((_, j) => j !== i))}
              >
                <Icon name="x" />
              </button>
              <PacketBarcode item={it} onChange={(field, value) => setItem(i, field, value)} onScan={() => setScanFor(i)} />
            </fieldset>
          ))}
          {scanFor != null && (
            <BarcodeScanner
              title={`Scan the barcode for product line ${scanFor + 1}`}
              onClose={() => setScanFor(null)}
              onResult={(code) => {
                setItem(scanFor, 'barcode', code);
                setScanFor(null);
              }}
            />
          )}
        </div>
        <button type="button" className="btn add-line" onClick={() => set('items', [...form.items, emptyItem()])}>
          <Icon name="plus" size={16} /> Add another product
        </button>
        {validItems.length > 0 && (!editing || materialChange) && (
          <div className={`material-status ${preview.ok ? 'ok' : 'bad'}`} aria-live="polite">
            <Icon name={preview.ok ? 'checkCircle' : 'alert'} size={18} />
            <span>
              {preview.ok
                ? 'Raw material currently looks sufficient (indicative – factory confirms on review).'
                : `Possible raw material shortfall: ${preview.rows
                    .filter((r) => r.shortfall)
                    .map((r) => `${r.name} (${r.shortfall} ${r.unit})`)
                    .join(', ')}. The factory may put this order on hold.`}
            </span>
          </div>
        )}
      </Card>

      <div className="form-footer">
        <button type="button" className="btn ghost" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <button className="btn primary lg">
          {editing ? 'Save changes' : 'Submit to Factory'} <Icon name="arrowRight" size={16} />
        </button>
      </div>
    </form>
  );
}

/** The customer's own barcode for this product's packets (printed on packet labels by the factory). */
function PacketBarcode({ item, onChange, onScan }) {
  const info = barcodeInfo(item.barcode);
  return (
    <div className="item-pack">
      <label className="pack-code">
        <span>
          Customer barcode on packets <span className="muted small">(optional)</span>
        </span>
        <span className="input-with-btn">
          <input
            value={item.barcode ?? ''}
            onChange={(e) => onChange('barcode', e.target.value)}
            placeholder="Number under the barcode, e.g. 8901234567893"
            inputMode="text"
            autoComplete="off"
          />
          <button type="button" className="btn" onClick={onScan} title="Scan with the camera or from a photo">
            <Icon name="camera" size={16} /> Scan
          </button>
        </span>
      </label>
      <label className="pack-qty">
        Units per packet
        <input type="number" min="1" inputMode="numeric" value={item.packQty ?? ''} onChange={(e) => onChange('packQty', e.target.value)} placeholder="e.g. 10" />
      </label>
      {item.barcode?.trim() && (
        <div className="pack-preview">
          <Barcode value={item.barcode} height={36} width={1.3} fontSize={11} />
          <span className={`small ${info.warning ? 'warn-text' : 'muted'}`}>{info.warning ?? `${info.label} – the factory prints this on every packet`}</span>
        </div>
      )}
    </div>
  );
}
