import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePlan, useStore, useVisibleOrders } from '../context/StoreContext';
import { EXAMPLES, answer } from '../data/ask';
import { Card, PageHeader } from '../components/ui';
import VoiceInput from '../components/VoiceInput';
import Icon from '../components/Icon';
import { useLang } from '../i18n';

/** Ask in plain words ("Which orders will be late this month?") and get the answer from the app's data. */
export default function Ask() {
  const { t } = useLang();
  const { state } = useStore();
  const orders = useVisibleOrders();
  const { risk } = usePlan();
  const [params, setParams] = useSearchParams();
  const asked = params.get('q') ?? '';
  const [q, setQ] = useState(asked);
  const result = asked ? answer(asked, { orders, state, risk }) : null;

  const ask = (text) => {
    setQ(text);
    setParams(text.trim() ? { q: text.trim() } : {}, { replace: true });
  };

  return (
    <>
      <PageHeader title={t('nav.ask')} subtitle="Ask about orders, customers, stock, machines, approvals, purchases or dispatch – answered from your own data" />

      <form
        className="ask-box card"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <Icon name="sparkle" size={20} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Which orders will be late this month?" aria-label="Your question" autoFocus />
        <VoiceInput onText={(txt) => ask(txt)} />
        <button className="btn primary">Ask</button>
      </form>

      <div className="chips ask-examples" role="group" aria-label="Example questions">
        {EXAMPLES.map((x) => (
          <button key={x} type="button" className="chip" onClick={() => ask(x)}>
            {x}
          </button>
        ))}
      </div>

      {result && (
        <Card title={result.title} icon="sparkle" className="ask-answer">
          {result.text && <p>{result.text}</p>}
          {result.items.length > 0 && (
            <ul className="feed">
              {result.items.map((it, i) => (
                <li key={i}>
                  {it.to ? (
                    <Link to={it.to} className="feed-main">
                      {it.label}
                    </Link>
                  ) : (
                    <span className="feed-main">{it.label}</span>
                  )}
                  {it.sub && <span className="feed-sub">{it.sub}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
