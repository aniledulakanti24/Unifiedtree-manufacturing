import { useState } from 'react';
import { useLang, tr } from '../i18n';
import { REASONS, reasonIcon } from '../data/reasons';
import { Modal } from './ui';
import Icon from './Icon';
import VoiceInput from './VoiceInput';

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
              {reasonIcon(c)}
            </span>
            {t(`reason.${c}`)}
          </button>
        ))}
      </div>
      <label>
        {t('reason.more')}
        <span className="with-voice">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <VoiceInput onText={(txt) => setNote((n) => (n ? `${n} ${txt}` : txt))} />
        </span>
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
