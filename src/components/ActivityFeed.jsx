import { Link } from 'react-router-dom';
import { ROLES } from '../auth/permissions';
import { STATUS } from '../data/statuses';
import { useLang } from '../i18n';
import { fmtDateTime } from '../utils';
import { EmptyState } from './ui';

/** "just now", "5 min ago", "3 h ago", "yesterday", else the date. */
export function timeAgo(at) {
  const mins = Math.round((Date.now() - Date.parse(at)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'yesterday';
  return fmtDateTime(at).split(',')[0];
}

const initials = (name = '') =>
  name
    .replace(/\(.*\)/, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/**
 * Who did what to which work order, newest first, as a short timeline.
 * items: history entries with `orderId` and `customer` added.
 */
export default function ActivityFeed({ items, empty = 'No activity yet', showCustomer = true }) {
  const { t } = useLang();
  if (!items.length) return <EmptyState icon="clock" title={empty} />;

  // One sentence per entry, with the work order number where it reads naturally.
  const sentence = (h, wo) => {
    const step = <strong>{t(`flow.${h.status}`) || STATUS[h.status]?.label}</strong>;
    if (h.edit) return <>changed the details of {wo}</>;
    if (h.delay) return <>reported a delay on {wo}</>;
    if (h.approval === 'approved') return <>approved {step} on {wo}</>;
    if (h.approval === 'rejected') return <>sent back {step} on {wo}</>;
    if (h.approval === 'requested') return <>asked again to approve {step} on {wo}</>;
    if (h.status === 'PENDING_REVIEW') return <>entered {wo}</>;
    if (h.status === 'ON_HOLD') return <>put {wo} on hold</>;
    return <>moved {wo} to {step}</>;
  };
  const tone = (h) => (h.approval === 'rejected' || h.status === 'ON_HOLD' || h.delay ? 'red' : h.approval === 'approved' ? 'green' : h.edit ? 'amber' : 'blue');

  return (
    <ol className="activity-feed">
      {items.map((h, i) => (
        <li key={`${h.orderId}-${h.at}-${i}`} className={`af tone-${tone(h)}`}>
          <span className={`af-avatar tone-${ROLES[h.role]?.tone ?? 'gray'}`} title={`${h.by}${ROLES[h.role] ? ` · ${ROLES[h.role].label}` : ''}`} aria-hidden="true">
            {initials(h.by)}
          </span>
          <div className="af-body">
            <p className="af-line">
              <strong>{h.by}</strong> {sentence(h, <Link to={`/orders/${h.orderId}`}>{h.orderId}</Link>)}
            </p>
            <p className="af-sub">
              {showCustomer && <span>{h.customer}</span>}
              <time dateTime={h.at} title={fmtDateTime(h.at)}>
                {timeAgo(h.at)}
              </time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
