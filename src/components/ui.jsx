import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { STATUS, FLOW, isComplete, stepIndex } from '../data/statuses';
import { ROLES } from '../auth/permissions';
import { daysUntil, fmtDate, fmtDateTime, isStageEvent } from '../utils';
import { useLang } from '../i18n';
import Icon from './Icon';

const findLast = (list, fn) => [...list].reverse().find(fn);

export function StatusBadge({ status }) {
  const { t } = useLang();
  const s = STATUS[status] ?? { label: status, tone: 'gray' };
  return (
    <span className={`badge tone-${s.tone}`}>
      <span className="badge-dot" aria-hidden="true" />
      {STATUS[status] ? t(`status.${status}`) : s.label}
    </span>
  );
}

/** "3 days left" / "Due today" / "2 days late" in the user's language. */
export function dueText(t, date) {
  const d = daysUntil(date);
  if (d === -1) return t('due.late1');
  if (d < 0) return t('due.late', { n: -d });
  if (d === 0) return t('due.today');
  return d === 1 ? t('due.left1') : t('due.left', { n: d });
}

export function RoleBadge({ role }) {
  return <span className={`badge tone-${ROLES[role]?.tone ?? 'gray'}`}>{ROLES[role]?.label ?? role}</span>;
}

export function PriorityBadge({ priority }) {
  const { t } = useLang();
  const tone = { Urgent: 'red', High: 'amber', Normal: 'gray' }[priority] ?? 'gray';
  return <span className={`badge outline tone-${tone}`}>{t(`priority.${priority}`)}</span>;
}

export function DueDate({ date, done }) {
  const { t } = useLang();
  const d = daysUntil(date);
  let hint = null;
  if (!done) {
    if (d < 0) hint = <span className="due overdue">{dueText(t, date)}</span>;
    else if (d <= 3) hint = <span className="due soon">{dueText(t, date)}</span>;
  }
  return (
    <span className="due-date">
      <span className="nowrap">{fmtDate(date)}</span> {hint}
    </span>
  );
}

/** The products, quantities, specs and customer needs: what the shop floor has to make. Always highlighted. */
export function WorkDetails({ order, products, compact = false }) {
  const { t } = useLang();
  const name = (id) => products.find((p) => p.id === id)?.name ?? id;
  return (
    <div className={`work-details ${compact ? 'compact' : ''}`}>
      <strong className="work-details-title">🛠️ {t('work.details')}</strong>
      <ul className="work-details-items">
        {order.items.map((it, i) => (
          <li key={i}>
            <span className="wd-qty">{it.qty}</span>
            <span>
              <strong>{name(it.productId)}</strong>
              {it.specs && <span className="wd-spec">{it.specs}</span>}
              {it.barcode && <span className="wd-barcode">🏷 Packet barcode {it.barcode}{it.packQty ? ` · ${it.packQty} per packet` : ''}</span>}
            </span>
          </li>
        ))}
      </ul>
      {order.requirements && (
        <p className="wd-needs">
          <strong>📝 {t('work.customerNeeds')}:</strong> {order.requirements}
        </p>
      )}
    </div>
  );
}

/** Who entered the order and who touched it last – visible to everyone at every stage. */
export function PeopleLine({ order }) {
  const { t } = useLang();
  const last = order.history[order.history.length - 1];
  return (
    <div className="people-line small">
      <span>👤 {t('work.enteredBy', { name: order.createdByName })}</span>
      {last && last.by !== order.createdByName && (
        <span>
          · {t('work.lastBy', { name: last.by })} <span className="muted">{fmtDateTime(last.at)}</span>
        </span>
      )}
    </div>
  );
}

/** Small badge for the approval state of the order's current stage. */
export function ApprovalBadge({ order }) {
  const { t } = useLang();
  const a = order.approval?.status === order.status ? order.approval : null;
  if (!a) return null;
  if (a.state === 'approved') return <span className="badge tone-green">✔ {t('approval.approvedBy', { name: a.decidedBy })}</span>;
  if (a.state === 'rejected') return <span className="badge tone-red">✖ {t('approval.rejectedShort')}</span>;
  return <span className="badge tone-violet">⏳ {t('approval.pending')}</span>;
}

/**
 * Change against the previous period: "▲ 3 (+50%)". `goodWhen` says which direction is good
 * ('up' for output, 'down' for delays), so the colour tells better/worse, not just bigger/smaller.
 */
export function Delta({ now, prev, goodWhen = 'up', compact = false }) {
  if (prev == null) return null;
  const diff = now - prev;
  const pct = prev ? Math.round((diff / prev) * 100) : null;
  const good = diff === 0 || goodWhen === 'none' ? '' : (diff > 0) === (goodWhen === 'up') ? 'good' : 'bad';
  const sign = diff > 0 ? '▲' : diff < 0 ? '▼' : '=';
  return (
    <span className={`delta ${good}`} title={`Previous period: ${prev}`}>
      {sign} {Math.abs(diff)}
      {pct != null && diff !== 0 && ` (${diff > 0 ? '+' : ''}${pct}%)`}
      {!compact && <span className="delta-vs"> vs previous ({prev})</span>}
    </span>
  );
}

/** late / soon / ok, used to colour due-date chips and job cards. */
export function dueTone(date) {
  const d = daysUntil(date);
  return d < 0 ? 'late' : d <= 3 ? 'soon' : 'ok';
}

/** Always-visible "Due in 2 days" chip. */
export function DueChip({ date, big = false }) {
  const { t } = useLang();
  return (
    <span className={`due-chip due-${dueTone(date)} ${big ? 'big' : ''}`} title={fmtDate(date)}>
      ⏰ {dueText(t, date)}
    </span>
  );
}

export function StageTracker({ status, history = [], approval }) {
  const { t } = useLang();
  const current = stepIndex(status);
  const held = status === 'ON_HOLD';
  const delivered = isComplete(status);
  const listRef = useRef(null);

  // Keep the current step visible when the tracker scrolls horizontally on small screens.
  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-current="step"]');
    if (el && listRef.current.scrollWidth > listRef.current.clientWidth) {
      listRef.current.scrollLeft = el.offsetLeft - listRef.current.clientWidth / 2 + el.clientWidth / 2;
    }
  }, [status]);

  return (
    <div className="tracker-wrap">
      <p className="tracker-caption">
        {t('tracker.step', { n: current + 1, total: FLOW.length })}{' '}
        <strong>{held ? t('status.ON_HOLD') : t(`flow.${FLOW[current]?.key}`)}</strong>
      </p>
      <ol className="tracker" ref={listRef}>
        {FLOW.map((f, i) => {
          const state = i < current || delivered ? 'done' : i === current ? (held ? 'held' : 'current') : 'todo';
          // Latest person who did this stage, and who approved it.
          const doneBy = state !== 'todo' && findLast(history, (h) => h.status === f.key && isStageEvent(h));
          const approvedBy = state !== 'todo' && findLast(history, (h) => h.status === f.key && h.approval === 'approved');
          const waiting = i === current && approval?.status === f.key && approval.state !== 'approved';
          return (
            <li key={f.key} className={`step ${state}`} aria-current={i === current ? 'step' : undefined}>
              <span className="dot">
                {state === 'done' ? <Icon name="check" size={16} /> : state === 'held' ? <Icon name="pause" size={14} /> : i + 1}
              </span>
              <span className="step-label">{i === 0 && held ? t('status.ON_HOLD') : t(`flow.${f.key}`)}</span>
              {doneBy && (
                <span className="step-who" title={fmtDateTime(doneBy.at)}>
                  {doneBy.by}
                  <span className="muted"> · {fmtDate(doneBy.at).slice(0, 6)}</span>
                </span>
              )}
              {approvedBy && !waiting && <span className="step-ok">✔ {approvedBy.by}</span>}
              {waiting && <span className={`step-wait ${approval.state}`}>{approval.state === 'rejected' ? '✖' : '⏳'} {t('approval.title')}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Card({ title, icon, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <h2 className="card-title">
            {icon && <Icon name={icon} size={18} />}
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function EmptyState({ icon = 'inbox', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {children && <span className="muted">{children}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    if (!ref.current.contains(document.activeElement)) ref.current.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Rendered on <body> so a transformed or clickable parent (e.g. a work card) can't trap or swallow it.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        ref={ref}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="card-head">
          <h2 className="card-title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div className="card-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function PageHeader({ title, subtitle, back, children }) {
  return (
    <div className="page-header">
      <div>
        {back}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

/**
 * A row of small summary tiles. items: [{ key, label, value, icon, tone, sub?, to?, onClick?, active? }].
 * A tile with `to` is a link, with `onClick` a toggle button (e.g. a filter), otherwise plain.
 */
export function StatTiles({ items, label }) {
  return (
    <div className="stat-tiles" role="group" aria-label={label}>
      {items.map((s) => {
        const body = (
          <>
            <span className="st-icon">
              <Icon name={s.icon} size={16} />
            </span>
            <span className="st-text">
              <span className="st-value">{s.value}</span>
              <span className="st-label">{s.label}</span>
              {s.sub && <span className="st-sub">{s.sub}</span>}
            </span>
          </>
        );
        const cls = `st tone-${s.tone ?? 'blue'} ${s.active ? 'active' : ''}`;
        if (s.to)
          return (
            <Link key={s.key} to={s.to} className={cls}>
              {body}
            </Link>
          );
        if (s.onClick)
          return (
            <button key={s.key} type="button" className={cls} aria-pressed={Boolean(s.active)} onClick={s.onClick}>
              {body}
            </button>
          );
        return (
          <div key={s.key} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** How far along its journey an order is, as a thin bar with "step 4 of 9". */
export function StageProgress({ status }) {
  const { t } = useLang();
  const done = isComplete(status);
  const i = done ? FLOW.length - 1 : stepIndex(status);
  const pct = Math.round(((i + (done ? 1 : 0.5)) / FLOW.length) * 100);
  return (
    <span className={`stage-progress ${status === 'ON_HOLD' ? 'held' : done ? 'done' : ''}`} title={`${t(`flow.${FLOW[i]?.key}`)} – step ${i + 1} of ${FLOW.length}`}>
      <span className="sp-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="sp-text">
        {i + 1}/{FLOW.length}
      </span>
    </span>
  );
}
