import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { addDays } from '../utils';

// One date period shared by the Dashboard, My Work, Customers and Reports, remembered per browser.
// Dates are local "YYYY-MM-DD" strings and a period includes both ends. Weeks run Monday–Sunday;
// the financial year runs 1 April – 31 March (India) and quarters follow it (Apr–Jun = Q1).

const KEY = 'unifiedtree-scm-period';
const DEFAULT_KEY = 'last365';

export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localToday = () => isoDate(new Date());
const parse = (s) => new Date(`${s}T00:00:00`);
export const fmtDay = (s) => parse(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const rangeText = ([a, b]) => (a === b ? fmtDay(a) : `${fmtDay(a)} - ${fmtDay(b)}`);
const dayCount = (from, to) => Math.round((parse(to) - parse(from)) / 86400000) + 1;

const monthStart = (t) => `${t.slice(0, 8)}01`;
const monthEnd = (t) => addDays(addMonths(monthStart(t), 1), -1);
function addMonths(first, n) {
  const d = parse(first);
  d.setMonth(d.getMonth() + n);
  return isoDate(d);
}
const weekStart = (t) => addDays(t, -((parse(t).getDay() + 6) % 7)); // Monday
const fyStart = (t) => {
  const d = parse(t);
  return `${d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1}-04-01`;
};
// Quarters of the April financial year start in Apr, Jul, Oct and Jan.
const quarterStart = (t) => {
  const d = parse(t);
  const m = d.getMonth();
  const qm = m >= 3 ? m - ((m - 3) % 3) : m - (m % 3);
  return `${d.getFullYear()}-${String(qm + 1).padStart(2, '0')}-01`;
};
const fyLabel = (start) => `FY ${start.slice(0, 4)}–${String(Number(start.slice(0, 4)) + 1).slice(2)}`;

// `current` periods are still running; they are compared with the same elapsed part of the period before.
export const PERIODS = [
  { key: 'today', label: 'Today', range: (t) => [t, t], prevOf: (f) => [addDays(f, -1), addDays(f, -1)] },
  { key: 'yesterday', label: 'Yesterday', range: (t) => [addDays(t, -1), addDays(t, -1)], prevOf: (f) => [addDays(f, -1), addDays(f, -1)] },
  { key: 'thisWeek', label: 'This Week', current: true, range: (t) => [weekStart(t), addDays(weekStart(t), 6)], prevOf: (f) => [addDays(f, -7), addDays(f, -1)] },
  { key: 'lastWeek', label: 'Last Week', range: (t) => [addDays(weekStart(t), -7), addDays(weekStart(t), -1)], prevOf: (f) => [addDays(f, -7), addDays(f, -1)] },
  { key: 'last7', label: 'Last 7 Days', range: (t) => [addDays(t, -6), t] },
  { key: 'thisMonth', label: 'This Month', current: true, range: (t) => [monthStart(t), monthEnd(t)], prevOf: (f) => [addMonths(f, -1), addDays(f, -1)] },
  { key: 'lastMonth', label: 'Previous Month', range: (t) => [addMonths(monthStart(t), -1), addDays(monthStart(t), -1)], prevOf: (f) => [addMonths(f, -1), addDays(f, -1)] },
  { key: 'last30', label: 'Last 30 Days', range: (t) => [addDays(t, -29), t] },
  { key: 'thisQuarter', label: 'This Quarter', current: true, range: (t) => [quarterStart(t), addDays(addMonths(quarterStart(t), 3), -1)], prevOf: (f) => [addMonths(f, -3), addDays(f, -1)] },
  { key: 'lastQuarter', label: 'Previous Quarter', range: (t) => [addMonths(quarterStart(t), -3), addDays(quarterStart(t), -1)], prevOf: (f) => [addMonths(f, -3), addDays(f, -1)] },
  { key: 'thisFY', label: 'Current Fiscal Year', current: true, range: (t) => [fyStart(t), addDays(addMonths(fyStart(t), 12), -1)], prevOf: (f) => [addMonths(f, -12), addDays(f, -1)] },
  { key: 'lastFY', label: 'Previous Fiscal Year', range: (t) => [addMonths(fyStart(t), -12), addDays(fyStart(t), -1)], prevOf: (f) => [addMonths(f, -12), addDays(f, -1)] },
  { key: 'last365', label: 'Last 365 Days', range: (t) => [addDays(t, -364), t] },
  { key: 'custom', label: 'Custom', range: null },
];

/** Day or month buckets covering a period, for trend charts. */
export function buildBuckets(from, to) {
  const monthly = dayCount(from, to) > 62;
  const buckets = [];
  if (monthly) {
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); ) {
      buckets.push({ key: m, label: parse(`${m}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) });
      m = addMonths(`${m}-01`, 1).slice(0, 7);
    }
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      buckets.push({ key: d, label: parse(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) });
    }
  }
  return { monthly, buckets, bucketOf: (at) => (monthly ? isoDate(new Date(at)).slice(0, 7) : isoDate(new Date(at))) };
}

/** The window a period is compared with. */
function previousOf(preset, from, to, today) {
  if (!preset?.prevOf) {
    const end = addDays(from, -1);
    return [addDays(end, -(dayCount(from, to) - 1)), end];
  }
  const [pFrom, pTo] = preset.prevOf(from);
  // A running period is compared like-for-like: the days elapsed so far against the same days before.
  if (preset.current && today < to) {
    const elapsedEnd = addDays(pFrom, dayCount(from, today) - 1);
    return [pFrom, elapsedEnd < pTo ? elapsedEnd : pTo];
  }
  return [pFrom, pTo];
}

const PeriodContext = createContext(null);

function readSaved() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && PERIODS.some((p) => p.key === s.key) && (s.key !== 'custom' || (s.from && s.to))) return s;
  } catch {
    /* ignore */
  }
  return { key: DEFAULT_KEY };
}

export function PeriodProvider({ children }) {
  const [saved, setSaved] = useState(readSaved);

  const save = useCallback((next) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setSaved(next);
  }, []);

  const value = useMemo(() => {
    const today = localToday();
    const preset = PERIODS.find((p) => p.key === saved.key);
    const [from, to] = preset.range ? preset.range(today) : [saved.from, saved.to].sort();
    const prev = previousOf(preset, from, to, today);
    const inside = (at, a, b) => {
      const d = isoDate(new Date(at));
      return d >= a && d <= b;
    };
    const text = rangeText([from, to]);
    return {
      key: saved.key,
      from,
      to,
      // Last day that can have data – a running period ends today, not at its calendar end.
      end: to < today ? to : today,
      today,
      prev,
      label: preset.key === 'custom' ? text : preset.label,
      text: preset.key === 'thisFY' || preset.key === 'lastFY' ? `${text} · ${fyLabel(from)}` : text,
      prevText: rangeText(prev),
      inRange: (at) => inside(at, from, to),
      inPrev: (at) => inside(at, prev[0], prev[1]),
      rangeOf: (key) => PERIODS.find((p) => p.key === key)?.range?.(today) ?? null,
      setPreset: (key) => save({ key }),
      setCustom: (f, t) => save({ key: 'custom', from: f, to: t }),
    };
  }, [saved, save]);

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  return useContext(PeriodContext);
}
