import { useState } from 'react';
import { useLang, tr } from '../i18n';
import { REASON_ICONS, REASONS } from '../data/reasons';
import { Modal } from './ui';
import Icon from './Icon';

/** English text saved in records and notifications, e.g. "Raw material short – 400 kg less". */
export const reasonRecord = (code, note) => [tr('en', `reason.${code}`), note].filter(Boolean).join(' – ');

/** A reason shown in the reader's own language. */
export function ReasonText({ code, note, fallback = '' }) {
  const { t } = useLang();
  if (!code) return fallback;
  return [t(`reason.${code}`), note].filter(Boolean).join(' – ');
}

/** Big tap-to-choose reason buttons with a picture, plus an optional note. */
export function ReasonDialog({ group, title, onSubmit, onClose }) {
  const { t } = useLang();
  const [code, setCode] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const send = () => {
    if (!code) return setError(t('reason.needOne'));
    onSubmit({ code, note: note.trim() });
  };

  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{t('reason.pick')}</p>
      <div className="reason-grid" role="group" aria-label={t('reason.pick')}>
        {REASONS[group].map((c) => (
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
              {REASON_ICONS[c]}
            </span>
            {t(`reason.${c}`)}
          </button>
        ))}
      </div>
      <label>
        {t('reason.more')}
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && (
        <p className="field-error" role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
      <div className="btn-row">
        <button type="button" className="btn ghost lg" onClick={onClose}>
          {t('reason.cancel')}
        </button>
        <button type="button" className="btn primary lg" onClick={send}>
          {t('reason.send')}
        </button>
      </div>
    </Modal>
  );
}

/** "Are you sure?" with big Yes / No, so a wrong tap does not move an order. */
export function ConfirmDialog({ message, detail, onYes, onClose }) {
  const { t } = useLang();
  return (
    <Modal title={t('confirm.title')} onClose={onClose}>
      <p className="confirm-text">{message}</p>
      {detail && <p className="muted">{detail}</p>}
      <div className="btn-row">
        <button type="button" className="btn ghost lg" onClick={onClose}>
          {t('confirm.no')}
        </button>
        <button
          type="button"
          className="btn success lg"
          onClick={() => {
            onYes();
            onClose();
          }}
        >
          {t('confirm.yes')}
        </button>
      </div>
    </Modal>
  );
}
