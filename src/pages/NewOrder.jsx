import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { Card, PageHeader } from '../components/ui';
import Icon from '../components/Icon';
import { checkAvailability, todayISO } from '../utils';

const emptyItem = () => ({ productId: '', qty: '', specs: '' });

export default function NewOrder() {
  const { state, act } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    customerPoNo: '',
    poDate: todayISO(),
    expectedDeliveryDate: '',
    priority: 'Normal',
    requirements: '',
    customer: { name: '', contact: '', email: '', phone: '', address: '' },
    items: [emptyItem()],
  });
  const [errors, setErrors] = useState([]);
  const [attempt, setAttempt] = useState(0);
  const errorRef = useRef(null);

  // Move focus to the error summary after a failed submit so it is seen / announced.
  useEffect(() => {
    if (attempt && errorRef.current) {
      errorRef.current.focus();
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [attempt]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const setCustomer = (field, value) => setForm((f) => ({ ...f, customer: { ...f.customer, [field]: value } }));
  const setItem = (i, field, value) =>
    setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, [field]: value } : it)) }));

  const validItems = form.items.filter((it) => it.productId && Number(it.qty) > 0);
  const preview = checkAvailability(validItems, state.products, state.materials);

  const submit = (e) => {
    e.preventDefault();
    const errs = [];
    if (!form.customer.name.trim()) errs.push('Customer name is required.');
    if (!form.customer.phone.trim() && !form.customer.email.trim()) errs.push('Enter customer phone or email.');
    if (!form.customerPoNo.trim()) errs.push('Customer PO number is required.');
    if (!form.expectedDeliveryDate) errs.push('Expected delivery date is required.');
    else if (form.expectedDeliveryDate < todayISO()) errs.push('Expected delivery date cannot be in the past.');
    if (validItems.length === 0) errs.push('Add at least one product with quantity.');
    if (form.items.some((it) => (it.productId || it.qty) && !(it.productId && Number(it.qty) > 0)))
      errs.push('Each product line needs a product and a quantity above 0.');
    setErrors(errs);
    if (errs.length) return setAttempt((n) => n + 1);

    const id = `PO-${new Date().getFullYear()}-${String(state.counters.order + 1).padStart(4, '0')}`;
    act('CREATE_ORDER', {
      order: {
        id,
        customerPoNo: form.customerPoNo.trim(),
        poDate: form.poDate,
        expectedDeliveryDate: form.expectedDeliveryDate,
        priority: form.priority,
        requirements: form.requirements.trim(),
        customer: Object.fromEntries(Object.entries(form.customer).map(([k, v]) => [k, v.trim()])),
        items: validItems.map((it) => ({ ...it, qty: Number(it.qty) })),
      },
    });
    navigate(`/orders/${id}`);
  };

  return (
    <form onSubmit={submit}>
      <PageHeader
        title="New Customer PO"
        subtitle="Enter the customer's purchase order. On submit it goes to the factory for review."
        back={
          <Link to="/orders" className="back-link">
            <Icon name="arrowLeft" size={16} /> Purchase orders
          </Link>
        }
      />

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
        <Card title="1. Customer details" icon="user">
          <div className="form-grid">
            <label className="span-2">
              <span>
                Customer / Company name <span className="req">*</span>
              </span>
              <input value={form.customer.name} onChange={(e) => setCustomer('name', e.target.value)} autoComplete="organization" />
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

        <Card title="2. PO details" icon="file">
          <div className="form-grid">
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
                Expected delivery date <span className="req">*</span>
              </span>
              <input
                type="date"
                min={todayISO()}
                value={form.expectedDeliveryDate}
                onChange={(e) => set('expectedDeliveryDate', e.target.value)}
              />
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
            </fieldset>
          ))}
        </div>
        <button type="button" className="btn add-line" onClick={() => set('items', [...form.items, emptyItem()])}>
          <Icon name="plus" size={16} /> Add another product
        </button>
        {validItems.length > 0 && (
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
          Submit to Factory <Icon name="arrowRight" size={16} />
        </button>
      </div>
    </form>
  );
}
