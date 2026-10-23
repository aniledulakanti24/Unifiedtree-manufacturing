import { usePlan } from '../context/StoreContext';
import { RISK_LABEL } from '../data/planning';
import { fmtDate } from '../utils';

const TONE = { late: 'red', high: 'red', watch: 'amber' };

/** Small "Likely late · forecast 25 Oct" badge; nothing when the order is on track. Hover shows why. */
export function RiskBadge({ order }) {
  const { risk } = usePlan();
  const r = risk[order.id];
  if (!r || r.level === 'ok' || r.level === 'late') return null; // "already late" is shown by the due date itself
  return (
    <span className={`badge tone-${TONE[r.level]}`} title={r.reasons.join('\n') || undefined}>
      ⚠ {RISK_LABEL[r.level]}
      {r.forecast && ` · ready ${fmtDate(r.forecast).slice(0, 6)}`}
    </span>
  );
}

/** Banner on the order page: forecast date and the reasons it may slip. */
export function RiskBanner({ order }) {
  const { risk } = usePlan();
  const r = risk[order.id];
  if (!r) return null;
  if (r.level === 'ok' && !r.reasons.length)
    return (
      <p className="forecast ok">
        ✔ On track – forecast ready to deliver by <strong>{fmtDate(r.forecast)}</strong>
      </p>
    );
  return (
    <div className={`alert ${r.level === 'ok' ? 'amber' : 'red'}`} role="status">
      <span aria-hidden="true">⚠</span>
      <div>
        <strong>
          {RISK_LABEL[r.level]}
          {r.forecast ? ` – forecast to be ready for delivery by ${fmtDate(r.forecast)}` : ' – cannot be forecast until the blocker below is cleared'}
          {r.forecast && r.slack < 0 && ` (${-r.slack} day${r.slack === -1 ? '' : 's'} after the promised date)`}
        </strong>
        {r.reasons.length > 0 && (
          <ul className="delay-list">
            {r.reasons.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
