import { useEffect, useRef, useState } from 'react';

// Small dependency-free charts for the dashboard. Colours come from the --series-* and --chart-*
// tokens in styles.css (validated categorical palette, separate light and dark steps).
// Every chart has a hover tooltip and visible values, so nothing relies on colour alone.

/** Width of an element, kept up to date on resize (for crisp SVG charts). */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Tooltip positioned inside a chart's relative wrapper. */
function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{tip.title}</strong>
      {tip.rows.map(([label, value, color]) => (
        <span key={label} className="chart-tip-row">
          {color && <i className="chart-key" style={{ background: color }} />}
          <span>{label}</span>
          <b>{value}</b>
        </span>
      ))}
    </div>
  );
}

/** Position for a tooltip from a mouse event, relative to the wrapper. */
const tipAt = (e, wrap) => {
  const r = wrap.getBoundingClientRect();
  return { x: Math.min(e.clientX - r.left + 12, r.width - 150), y: e.clientY - r.top + 12 };
};

/** Clean axis maximum and ticks (0 / 2 / 4 …). Steps are whole numbers: every chart here counts things. */
function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw));
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/* ---------------------------------------------------------------- Donut */

/** Part-to-whole donut with a legend (label, count, share). data: [{ key, label, value, color }] */
export function DonutChart({ data, centerLabel, onSelect }) {
  const wrap = useRef(null);
  const [tip, setTip] = useState(null);
  const [active, setActive] = useState(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 168;
  const r = 66;
  const stroke = 22;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && data.filter((d) => d.value > 0).length > 1 ? 3 : 0; // surface gap between slices
  let offset = 0;

  return (
    <div className="donut-wrap" ref={wrap}>
      <svg viewBox={`0 0 ${size} ${size}`} className="donut" role="img" aria-label={`${centerLabel}: ${total}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={stroke} />
        {data.map((d) => {
          if (!d.value) return null;
          const len = (d.value / total) * c;
          const seg = (
            <circle
              key={d.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={active === d.key ? stroke + 6 : stroke}
              strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="donut-seg"
              onMouseMove={(e) => {
                setActive(d.key);
                setTip({
                  ...tipAt(e, wrap.current),
                  title: d.label,
                  rows: [
                    ['Work orders', d.value, d.color],
                    ['Share', `${Math.round((d.value / total) * 100)}%`],
                  ],
                });
              }}
              onMouseLeave={() => {
                setActive(null);
                setTip(null);
              }}
              onClick={() => onSelect?.(d.key)}
            />
          );
          offset += len;
          return seg;
        })}
        <text x="50%" y="47%" textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="donut-label">
          {centerLabel}
        </text>
      </svg>
      <ul className="chart-legend">
        {data.map((d) => (
          <li key={d.key}>
            <button
              type="button"
              className={active === d.key ? 'on' : ''}
              onMouseEnter={() => setActive(d.key)}
              onMouseLeave={() => setActive(null)}
              onClick={() => onSelect?.(d.key)}
            >
              <i className="chart-key" style={{ background: d.color }} />
              <span className="legend-label">{d.label}</span>
              <b>{d.value}</b>
              <span className="legend-pct">{total ? Math.round((d.value / total) * 100) : 0}%</span>
            </button>
          </li>
        ))}
      </ul>
      <Tip tip={tip} />
    </div>
  );
}

/* ---------------------------------------------------------------- Columns */

/** Vertical columns from one baseline, value on each cap. data: [{ key, label, value, color?, note? }] */
export function ColumnChart({ data, unit = '', height = 170, onSelect }) {
  const wrap = useRef(null);
  const [tip, setTip] = useState(null);
  const ticks = niceTicks(Math.max(...data.map((d) => d.value), 1));
  const top = ticks[ticks.length - 1];

  return (
    <div className="columns-wrap" ref={wrap}>
      <div className="columns" style={{ height }}>
        <div className="columns-grid" aria-hidden="true">
          {ticks
            .slice()
            .reverse()
            .map((tk) => (
              <span key={tk} className="grid-line">
                <em>{tk}</em>
              </span>
            ))}
        </div>
        {data.map((d) => (
          <button
            type="button"
            key={d.key}
            className="column-slot"
            aria-label={`${d.label}: ${d.value} ${unit}`}
            onClick={() => onSelect?.(d.key)}
            onMouseMove={(e) =>
              setTip({ ...tipAt(e, wrap.current), title: d.label, rows: [[unit || 'Value', d.value, d.color ?? 'var(--series-1)']] })
            }
            onMouseLeave={() => setTip(null)}
          >
            <span className="column-value">{d.value}</span>
            <span className="column-bar" style={{ height: `${(d.value / top) * 100}%`, background: d.color ?? 'var(--series-1)' }} />
          </button>
        ))}
      </div>
      <div className="columns-labels">
        {data.map((d) => (
          <span key={d.key}>
            {d.note && <span aria-hidden="true">{d.note} </span>}
            {d.label}
          </span>
        ))}
      </div>
      <Tip tip={tip} />
    </div>
  );
}

/* ---------------------------------------------------------------- Horizontal bars */

/** Ranked horizontal bars, value at the tip. data: [{ key, label, value, sub? }]; onSelect(key) makes rows clickable. */
export function BarList({ data, unit = '', color = 'var(--series-1)', onSelect }) {
  const wrap = useRef(null);
  const [tip, setTip] = useState(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="barlist-wrap" ref={wrap}>
      <ul className="barlist">
        {data.map((d) => (
          <li
            key={d.key}
            onMouseMove={(e) =>
              setTip({
                ...tipAt(e, wrap.current),
                title: d.label,
                rows: [[unit || 'Value', d.value.toLocaleString('en-IN'), color], ...(d.sub ? [[d.sub, '']] : [])],
              })
            }
            onMouseLeave={() => setTip(null)}
            className={onSelect ? 'clickable' : undefined}
            onClick={onSelect && (() => onSelect(d.key))}
          >
            {onSelect ? (
              <button type="button" className="barlist-label link-btn" onClick={(e) => (e.stopPropagation(), onSelect(d.key))}>
                {d.label}
              </button>
            ) : (
              <span className="barlist-label">{d.label}</span>
            )}
            <span className="barlist-track">
              <span className="barlist-bar" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
              <span className="barlist-value">{d.value.toLocaleString('en-IN')}</span>
            </span>
          </li>
        ))}
      </ul>
      <Tip tip={tip} />
    </div>
  );
}

/* ---------------------------------------------------------------- Line / area */

/**
 * Line + area over time with a hover crosshair. series: [{ key, label, color, values: number[] }],
 * labels: x labels (same length as values).
 */
export function LineChart({ series, labels, height = 200 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 28, r: 16, t: 14, b: 26 };
  const w = Math.max(width, 240);
  const ticks = niceTicks(Math.max(...series.flatMap((s) => s.values), 1));
  const top = ticks[ticks.length - 1];
  const n = labels.length;
  const x = (i) => pad.l + (i / Math.max(n - 1, 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / top) * (height - pad.t - pad.b);
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const every = Math.ceil(n / Math.max(Math.floor((w - 60) / 56), 1));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / (w - pad.l - pad.r)) * (n - 1));
    setHover(Math.min(Math.max(i, 0), n - 1));
  };

  return (
    <div className="line-wrap" ref={ref}>
      {series.length > 1 && (
        <ul className="chart-legend inline">
          {series.map((s) => (
            <li key={s.key}>
              <i className="chart-key line" style={{ background: s.color }} /> {s.label}
            </li>
          ))}
        </ul>
      )}
      {width > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          aria-label={series.map((s) => `${s.label}: ${s.values.reduce((a, b) => a + b, 0)} in ${n} days`).join('; ')}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={pad.l} x2={w - pad.r} y1={y(tk)} y2={y(tk)} className={tk === 0 ? 'axis-line' : 'grid-line-svg'} />
              <text x={pad.l - 8} y={y(tk) + 4} textAnchor="end" className="axis-text">
                {tk}
              </text>
            </g>
          ))}
          {labels.map((lb, i) =>
            (i % every === 0 && n - 1 - i >= every) || i === n - 1 ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="axis-text">
                {lb}
              </text>
            ) : null,
          )}
          {series.map((s) => (
            <g key={s.key}>
              <path d={`${path(s.values)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={s.color} opacity="0.1" />
              <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
            </g>
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} className="crosshair" />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r="5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>
      )}
      {hover != null && (
        <Tip
          tip={{
            x: Math.min(x(hover) + 12, w - 150),
            y: pad.t,
            title: labels[hover],
            rows: series.map((s) => [s.label, s.values[hover], s.color]),
          }}
        />
      )}
    </div>
  );
}
