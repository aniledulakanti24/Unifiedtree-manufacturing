import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { useLang } from '../i18n';
import { QUICK_REPLIES } from '../data/reasons';
import { Card } from './ui';
import VoiceInput from './VoiceInput';
import { fmtDateTime } from '../utils';

/** Message text in the reader's language: preset codes are translated, typed text is shown as written. */
function messageText(m, t) {
  if (m.kind === 'solved') return t('problem.solved');
  const words = [m.code && t(m.code), m.text].filter(Boolean).join(' – ');
  return m.kind === 'problem' ? `${t('problem.banner')} ${words}` : words;
}

/** One conversation per order between sales and the factory, so nothing is lost on phone calls. */
export default function OrderChat({ order }) {
  const { user } = useAuth();
  const { act } = useStore();
  const { t } = useLang();
  const [text, setText] = useState('');
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const messages = order.messages ?? [];

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  // Opened from a "Message" button (#chat): bring the chat into view after the page's own scroll-to-top.
  useEffect(() => {
    if (window.location.hash !== '#chat') return;
    const id = requestAnimationFrame(() => {
      wrapRef.current?.scrollIntoView({ block: 'start' });
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    act('SEND_MESSAGE', { id: order.id, text });
    setText('');
  };

  return (
    <div id="chat" ref={wrapRef} className="chat-anchor">
      <Card title={t('chat.title')} icon="message" className="chat-card">
        <div className="chat-list" ref={listRef} aria-live="polite">
          {messages.length === 0 && <p className="muted chat-empty">{t('chat.empty')}</p>}
          {messages.map((m) => {
            const mine = m.byId === user.id;
            return (
              <div key={m.id} className={`chat-msg ${mine ? 'mine' : ''} kind-${m.kind}`}>
                <div className="chat-meta">
                  {mine ? t('chat.you') : m.by} · {t(`role.${m.role}`)} · {fmtDateTime(m.at)}
                </div>
                <div className="chat-bubble">{messageText(m, t)}</div>
              </div>
            );
          })}
        </div>
        <div className="quick-replies" role="group" aria-label={t('chat.quick')}>
          {QUICK_REPLIES.map((q) => (
            <button key={q} type="button" className="quick-btn" onClick={() => act('SEND_MESSAGE', { id: order.id, code: `quick.${q}` })}>
              {t(`quick.${q}`)}
            </button>
          ))}
        </div>
        <form className="chat-form" onSubmit={send}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
          />
          <VoiceInput onText={(txt) => setText((v) => (v ? `${v} ${txt}` : txt))} />
          <button className="btn primary">{t('chat.send')}</button>
        </form>
      </Card>
    </div>
  );
}
