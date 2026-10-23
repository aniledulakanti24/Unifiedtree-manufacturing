import { useEffect, useRef, useState } from 'react';
import { PERIODS, fmtDay, isoDate, rangeText, usePeriod } from '../context/PeriodContext';
import Icon from './Icon';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Date filter: one button showing the period ("Last 365 Days" or "01 Oct 2026 - 30 Oct 2026").
 * It opens a list of presets – hover a row to see its dates – and "Custom" opens a range calendar.
 * The calendar icon on the right of the button goes straight to the calendar.
 */
export default function PeriodPicker({ hint }) {
  const period = usePeriod();
  const [open, setOpen] = useState(null); // null | 'list' | 'calendar'
  const [hover, setHover] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(null);
    const onKey = (e) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Keep the selected preset in view when the list opens.
  useEffect(() => {
    if (open === 'list') ref.current?.querySelector('.pp-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  return (
    <div className="pp-row">
      <div className="pp" ref={ref}>
        <div className={`pp-button ${open ? 'open' : ''}`}>
          <button
            type="button"
            className="pp-main"
            aria-haspopup="listbox"
            aria-expanded={open === 'list'}
            onClick={() => setOpen(open === 'list' ? null : 'list')}
          >
            <Icon name="calendar" size={16} />
            <span>{period.label}</span>
          </button>
          <button
            type="button"
            className="pp-cal"
            aria-label="Pick custom dates"
            title="Pick custom dates"
            onClick={() => setOpen(open === 'calendar' ? null : 'calendar')}
          >
            <Icon name="calendar" size={16} />
          </button>
        </div>

        {open === 'list' && (
          <ul className="pp-menu" role="listbox" aria-label="Date range">
            {PERIODS.map((p) => {
              const selected = period.key === p.key;
              const range = p.range ? period.rangeOf(p.key) : null;
              return (
                <li key={p.key} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={`pp-item ${selected ? 'selected' : ''}`}
                    onMouseEnter={() => setHover(p.key)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(p.key)}
                    onClick={() => {
                      if (p.key === 'custom') return setOpen('calendar');
                      period.setPreset(p.key);
                      setOpen(null);
                    }}
                  >
                    <span>{p.label}</span>
                    {range && (hover === p.key || selected) && <span className="pp-range">{rangeText(range)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {open === 'calendar' && (
          <RangeCalendar
            initial={period.key === 'custom' ? [period.from, period.to] : null}
            today={period.today}
            onCancel={() => setOpen(null)}
            onOk={(from, to) => {
              period.setCustom(from, to);
              setOpen(null);
            }}
          />
        )}
      </div>
      <p className="pp-caption">
        {period.key !== 'custom' && <strong>{period.text}</strong>}
        {hint && <span className={period.key !== 'custom' ? 'pp-dot' : ''}>{hint}</span>}
        <span className="muted pp-dot">compared with {period.prevText}</span>
      </p>
    </div>
  );
}

/** Two-click range calendar: first click = start date, second = end date, then OK. */
function RangeCalendar({ initial, today, onOk, onCancel }) {
  const [start, setStart] = useState(initial?.[0] ?? null);
  const [end, setEnd] = useState(initial?.[1] ?? null);
  const [hoverDay, setHoverDay] = useState(null);
  const base = new Date(`${(initial?.[0] ?? today).slice(0, 7)}-01T00:00:00`);
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(view.y, view.m, 1 - first.getDay() + i);
    return { iso: isoDate(d), day: d.getDate(), inMonth: d.getMonth() === view.m };
  });
  // Drop a trailing row that is entirely next month.
  const rows = cells.slice(35).every((c) => !c.inMonth) ? cells.slice(0, 35) : cells;

  const pick = (iso) => {
    if (!start || end) {
      setStart(iso);
      setEnd(null);
    } else if (iso < start) {
      setEnd(start);
      setStart(iso);
    } else {
      setEnd(iso);
    }
  };
  const lo = start && (end ?? (hoverDay && hoverDay > start ? hoverDay : start));
  const shift = (months) => {
    const d = new Date(view.y, view.m + months, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="pp-calendar" role="dialog" aria-label="Pick a date range">
      <div className="pp-cal-head">
        <span className={start ? 'set' : ''}>{start ? fmtDay(start) : 'Select Start Date'}</span>
        <span className={end ? 'set' : ''}>{end ? fmtDay(end) : 'Select End Date'}</span>
      </div>
      <div className="pp-cal-nav">
        <div className="pp-cal-step">
          <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
            <Icon name="arrowLeft" size={14} />
          </button>
          <strong>{MONTHS[view.m]}</strong>
          <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
        <div className="pp-cal-step">
          <button type="button" className="icon-btn" aria-label="Previous year" onClick={() => shift(-12)}>
            <Icon name="arrowLeft" size={14} />
          </button>
          <strong>{view.y}</strong>
          <button type="button" className="icon-btn" aria-label="Next year" onClick={() => shift(12)}>
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>
      <div className="pp-grid" onMouseLeave={() => setHoverDay(null)}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="pp-wd">
            {w}
          </span>
        ))}
        {rows.map((c) => {
          const edge = c.iso === start || c.iso === end;
          const within = start && lo && c.iso > start && c.iso < lo;
          return (
            <button
              key={c.iso}
              type="button"
              className={`pp-day ${c.inMonth ? '' : 'out'} ${edge ? 'edge' : ''} ${within ? 'within' : ''} ${c.iso === today ? 'today' : ''}`}
              aria-pressed={edge}
              aria-label={fmtDay(c.iso)}
              onMouseEnter={() => setHoverDay(c.iso)}
              onClick={() => pick(c.iso)}
            >
              {c.day}
            </button>
          );
        })}
      </div>
      <div className="pp-cal-foot">
        <button type="button" className="link-btn muted-btn" onClick={onCancel}>
          CANCEL
        </button>
        <button type="button" className="link-btn" disabled={!start || !end} onClick={() => onOk(start, end)}>
          OK
        </button>
      </div>
    </div>
  );
}
