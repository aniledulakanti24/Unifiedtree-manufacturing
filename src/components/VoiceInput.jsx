import { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n';
import Icon from './Icon';

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/**
 * Microphone button: speak and the words are typed for you (Hindi or English, following the app language).
 * Uses the browser's own speech recognition (Chrome, Edge, Android); hidden where it is not available.
 */
export default function VoiceInput({ onText }) {
  const { lang } = useLang();
  const [listening, setListening] = useState(false);
  const rec = useRef(null);

  useEffect(() => () => rec.current?.abort(), []);
  if (!Recognition) return null;

  const toggle = () => {
    if (listening) return rec.current?.stop();
    const r = new Recognition();
    r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((res) => res[0].transcript)
        .join(' ')
        .trim();
      if (text) onText(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  const label = listening ? 'Stop listening' : lang === 'hi' ? 'बोलकर लिखें' : 'Speak instead of typing';
  return (
    <button type="button" className={`icon-btn voice-btn ${listening ? 'listening' : ''}`} onClick={toggle} aria-label={label} title={label} aria-pressed={listening}>
      <Icon name="mic" size={18} />
    </button>
  );
}
