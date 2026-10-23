import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { isOpen } from '../data/statuses';
import { DELAY_DAYS, REASONS, reasonIcon } from '../data/reasons';
import { useLang } from '../i18n';
import { addDays, delayDays, fmtDate, fmtDateTime } from '../utils';
import { ReasonText } from './ReasonPicker';
import { Modal } from './ui';
import Icon from './Icon';
import VoiceInput from './VoiceInput';

/** Pick why and by how many days the order is late; shows the new delivery date before saving. */
function DelayDialog({ order, onClose }) {
  const { act } = useStore();
  const { t } = useLang();
  const [code, setCode] = useState(null);
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const n = Math.round(Number(days));
  const valid = n > 0 && n <= 365;

  const send = () => {
    if (!code) return setError(t('reason.needOne'));
    if (!valid) return setError(t('delay.needDays'));
    act('REPORT_DELAY', { id: order.id, code, days: n, note: note.trim() });
    onClose();
  };

  return (
    <Modal title={t('delay.title')} onClose={onClose}>
      <p className="muted small">
        {order.id} · {order.customer.name}
      </p>

      <p className="delay-step">{t('delay.why')}</p>
      <div className="reason-grid" role="group" aria-label={t('delay.why')}>
        {REASONS.delay.map((c) => (
          <button
            key={c}
            type="button"
            className={`reason-chip ${code === c ? 'on' : ''}`}
            aria-pressed={code === c}
            onClick={() => {
              setCode(c);
              setError('');
            }}
          >
            <span className="reason-emoji" aria-hidden="true">
              {reasonIcon(c)}
            </span>
            {t(`reason.${c}`)}
          </button>
        ))}
      </div>

      <p className="delay-step">{t('delay.howMany')}</p>
      <div className="delay-days">
        {DELAY_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            className={`chip ${n === d ? 'active' : ''}`}
            aria-pressed={n === d}
            onClick={() => {
              setDays(String(d));
              setError('');
            }}
          >
            {t('delay.nDays', { n: d })}
          </button>
        ))}
        <label className="delay-custom">
          <span className="sr-only">{t('delay.howMany')}</span>
          <input
            type="number"
            min="1"
            max="365"
            inputMode="numeric"
            placeholder={t('delay.other')}
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setError('');
            }}
          />
        </label>
      </div>

      {valid && (
        <div className="delay-preview" aria-live="polite">
          <span>
            {t('delay.was')} <s>{fmtDate(order.expectedDeliveryDate)}</s>
          </span>
          <Icon name="arrowRight" size={16} />
          <strong>
            {t('delay.newDate')} {fmtDate(addDays(order.expectedDeliveryDate, n))}
          </strong>
        </div>
      )}

      <label>
        {t('reason.more')}
        <span className="with-voice">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('delay.notePh')} />
          <VoiceInput onText={(txt) => setNote((n) => (n ? `${n} ${txt}` : txt))} />
        </span>
      </label>
      <p className="muted small">{t('delay.notify')}</p>

      {error && (
        <p className="field-error" role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
      <div className="btn-row">
        <button type="button" className="btn ghost lg" onClick={onClose}>
          {t('reason.cancel')}
        </button>
        <button type="button" className="btn warn lg" onClick={send}>
          {t('delay.save')}
        </button>
      </div>
    </Modal>
  );
}

/** "Report delay" button, shown only to roles that may push the date on an order not yet sent. */
export function DelayButton({ order, className = 'btn small' }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  if (!can(user.role, 'orders.delay') || !isOpen(order)) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        ⏳ {t('delay.report')}
      </button>
      {open && <DelayDialog order={order} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Small "Delayed +15 days" chip. */
export function DelayBadge({ order }) {
  const { t } = useLang();
  const total = delayDays(order);
  if (!total) return null;
  return <span className="badge tone-amber">⏳ {t('delay.badge', { n: total })}</span>;
}

/** Banner on the order page: total delay, first promised date, and each reported delay. */
export function DelayBanner({ order }) {
  const { t } = useLang();
  const delays = order.delays ?? [];
  if (!delays.length) return null;
  return (
    <div className="alert amber" role="status">
      <span aria-hidden="true">⏳</span>
      <div>
        <strong>
          {t('delay.banner', { n: delayDays(order) })} · {t('delay.newDate')} {fmtDate(order.expectedDeliveryDate)}
        </strong>{' '}
        <span className="small">
          ({t('delay.promised')} {fmtDate(order.originalDeliveryDate)})
        </span>
        <ul className="delay-list">
          {delays.map((d, i) => (
            <li key={i}>
              +{d.days} · <ReasonText code={d.code} note={d.note} /> ·{' '}
              <span className="muted">
                {d.by}, {fmtDateTime(d.at)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
