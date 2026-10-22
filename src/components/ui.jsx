import { useEffect, useRef } from 'react';
import { STATUS, FLOW, stepIndex } from '../data/statuses';
import { ROLES } from '../auth/permissions';
import { daysUntil, fmtDate } from '../utils';
import { useLang } from '../i18n';
import Icon from './Icon';

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

export function StageTracker({ status }) {
  const { t } = useLang();
  const current = stepIndex(status);
  const held = status === 'ON_HOLD';
  const delivered = status === 'DELIVERED';
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
          return (
            <li key={f.key} className={`step ${state}`} aria-current={i === current ? 'step' : undefined}>
              <span className="dot">
                {state === 'done' ? <Icon name="check" size={16} /> : state === 'held' ? <Icon name="pause" size={14} /> : i + 1}
              </span>
              <span className="step-label">{i === 0 && held ? t('status.ON_HOLD') : t(`flow.${f.key}`)}</span>
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
  return (
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
    </div>
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
