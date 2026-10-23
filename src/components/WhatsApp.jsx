import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { can } from '../auth/permissions';
import { featureOn } from '../auth/features';
import { ReasonText } from './ReasonPicker';
import { Modal } from './ui';
import Icon from './Icon';
import { tr } from '../i18n';
import { delayDays, fmtDate, orderUnits } from '../utils';

// What the customer is told at each stage – in their terms, not the factory's.
const CUSTOMER_STATUS = {
  PENDING_REVIEW: 'received and is being planned',
  ON_HOLD: 'received and is waiting for raw material',
  ACCEPTED: 'confirmed and scheduled for production',
  IN_PRODUCTION: 'in production',
  PACKAGING: 'made and being packed',
  READY_TO_DISPATCH: 'ready and under quality inspection',
  QC_APPROVED: 'through quality inspection',
  CLIENT_APPROVED: 'cleared and being dispatched',
  DISPATCHED: 'dispatched',
  DELIVERED: 'delivered',
};

/** Message templates that make sense for this order right now. */
function templates(o) {
  const hi = `Dear ${o.customer.contact || o.customer.name},`;
  const ref = `your order ${o.customerPoNo} (our ref ${o.id})`;
  const link = featureOn('customerView') ? `\n\nTrack your order any time: ${trackingLink(o.id)}` : '';
  const sign = `${link}\n\nRegards,\nUnifiedtree`;
  const list = [
    {
      key: 'status',
      label: 'Status update',
      text: `${hi}\nUpdate on ${ref}: it is ${CUSTOMER_STATUS[o.status] ?? 'in production'}.\nExpected delivery: ${fmtDate(o.expectedDeliveryDate)}.${sign}`,
    },
  ];
  if (o.qc?.result === 'PASS')
    list.push({
      key: 'qc',
      label: 'QC passed – ask approval',
      text: `${hi}\n${ref[0].toUpperCase()}${ref.slice(1)} has passed quality inspection – ${o.qc.inspectedQty} of ${orderUnits(o)} units checked.\nRemarks: ${o.qc.remarks}${o.qc.photos?.length ? `\nWe have ${o.qc.photos.length} inspection photos and will share them here.` : ''}\n\nPlease ${featureOn('customerView') ? 'approve on the tracking link below (or reply APPROVE)' : 'reply APPROVE'} so we can dispatch.${sign}`,
    });
  if (o.dispatch)
    list.push({
      key: 'dispatch',
      label: 'Dispatch details',
      text: `${hi}\n${ref[0].toUpperCase()}${ref.slice(1)} has been dispatched on ${fmtDate(o.dispatch.dispatchDate)} via ${o.dispatch.carrier}.\nTracking / LR no.: ${o.dispatch.trackingId}\nExpected arrival: ${fmtDate(o.dispatch.eta)}.${sign}`,
    });
  if (o.delays?.length) {
    const last = o.delays[o.delays.length - 1];
    list.push({
      key: 'delay',
      label: 'Delay notice',
      text: `${hi}\nWe regret that ${ref} is delayed by ${delayDays(o)} days (${tr('en', `reason.${last.code}`).toLowerCase()}).\nNew delivery date: ${fmtDate(o.expectedDeliveryDate)}.\nWe are working to bring it forward and will keep you updated.${sign}`,
    });
  }
  return list;
}

/** Customer tracking page for an order (opens without login). */
const trackingLink = (id) => `${window.location.origin}/track/${id}`;

/** Turns "+91 98450 11223" / "9845011223" into "919845011223" for wa.me. */
const waNumber = (phone = '') => {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
};

/**
 * "WhatsApp customer": pick a message that fits the order's stage, edit it, and WhatsApp opens with it ready
 * to send (no WhatsApp Business account needed). Shown to people who deal with customers.
 */
export default function WhatsAppButton({ order, small = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!featureOn('whatsapp') || !(can(user.role, 'client.approve') || can(user.role, 'orders.create'))) return null;
  return (
    <>
      <button type="button" className={`btn wa-btn ${small ? 'small' : ''}`} onClick={() => setOpen(true)}>
        <Icon name="message" size={small ? 14 : 16} /> {small ? 'WhatsApp' : 'WhatsApp customer'}
      </button>
      {open && <WhatsAppDialog order={order} onClose={() => setOpen(false)} />}
    </>
  );
}

function WhatsAppDialog({ order, onClose }) {
  const options = templates(order);
  const best = options.find((x) => x.key === { QC_APPROVED: 'qc', DISPATCHED: 'dispatch', DELIVERED: 'dispatch' }[order.status]) ?? (order.delays?.length ? options.at(-1) : options[0]);
  const [key, setKey] = useState(best.key);
  const [text, setText] = useState(best.text);
  const number = waNumber(order.customer.phone);

  return (
    <Modal title={`WhatsApp ${order.customer.name}`} onClose={onClose}>
      <div className="chips">
        {options.map((x) => (
          <button
            key={x.key}
            type="button"
            className={`chip ${key === x.key ? 'active' : ''}`}
            aria-pressed={key === x.key}
            onClick={() => {
              setKey(x.key);
              setText(x.text);
            }}
          >
            {x.label}
          </button>
        ))}
      </div>
      <label>
        Message (you can edit it)
        <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {order.problem && (
        <p className="small muted">
          Note: there is an open shop-floor problem (<ReasonText code={order.problem.code} note="" />) – mention it only if it affects the customer.
        </p>
      )}
      {!number && <p className="field-error">No phone number on this order – WhatsApp will ask you to pick a contact.</p>}
      <div className="btn-row">
        <button type="button" className="btn ghost lg" onClick={onClose}>
          Cancel
        </button>
        <a
          className="btn wa-btn lg"
          href={`https://wa.me/${number}?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
        >
          <Icon name="message" size={16} /> Open in WhatsApp
        </a>
      </div>
      <p className="muted small">WhatsApp opens on this phone or computer with the message ready – you press send.</p>
    </Modal>
  );
}
