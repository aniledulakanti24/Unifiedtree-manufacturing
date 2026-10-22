import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { can, rolesFor, ROLES } from '../auth/permissions';
import { canApprove, openApproval, stageOwnerPerm } from '../data/statuses';
import { useLang } from '../i18n';
import { fmtDateTime } from '../utils';

/**
 * Sign-off for the order's current stage. Approvers see Approve / Reject; the person who did the
 * stage can resubmit after a rejection; everyone else sees who it is waiting on.
 * Renders nothing when the current stage needs no approval.
 */
export default function StageApproval({ order, big = false }) {
  const { user } = useAuth();
  const { act } = useStore();
  const { t } = useLang();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const a = openApproval(order);
  if (!a) return null;

  const stage = t(`flow.${order.status}`);
  const btn = big ? 'xl' : 'lg';
  const approvers = rolesFor('stage.approve')
    .filter((r) => r !== 'admin')
    .map((r) => ROLES[r]?.label ?? r)
    .join(' / ');

  if (a.state === 'rejected') {
    const owner = can(user.role, stageOwnerPerm(order.status));
    return (
      <div className="approval-box rejected">
        <strong>✖ {t('approval.rejected', { name: a.decidedBy, note: a.note })}</strong>
        <span className="muted small">{fmtDateTime(a.decidedAt)}</span>
        {owner && (
          <>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('stage.note')} aria-label={t('stage.note')} />
            <button className={`btn primary ${btn} block`} onClick={() => act('RESUBMIT_STAGE', { id: order.id, note: note.trim() })}>
              {t('approval.resubmit')}
            </button>
          </>
        )}
      </div>
    );
  }

  if (!canApprove(user, order)) {
    const self = can(user.role, 'stage.approve') && a.requestedById === user.id;
    return (
      <div className="approval-box">
        <strong>⏳ {t('approval.pendingBy', { stage, name: a.requestedBy })}</strong>
        <span className="small">{self ? t('approval.notSelf') : t('approval.waitingFor', { roles: approvers })}</span>
      </div>
    );
  }

  const decide = (type) => {
    if (type === 'REJECT_STAGE' && !note.trim()) return setError(t('approval.needNote'));
    act(type, { id: order.id, note: note.trim() });
  };

  return (
    <div className="approval-box mine">
      <strong>⏳ {t('approval.pendingBy', { stage, name: a.requestedBy })}</strong>
      <span className="muted small">{fmtDateTime(a.at)}</span>
      <label className="approval-note">
        {t('approval.note')}
        <input
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setError('');
          }}
        />
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className={big ? 'work-actions' : 'btn-row'}>
        <button className={`btn success ${btn}`} onClick={() => decide('APPROVE_STAGE')}>
          {t('approval.approve')}
        </button>
        <button className={`btn danger ${btn}`} onClick={() => decide('REJECT_STAGE')}>
          {t('approval.reject')}
        </button>
      </div>
    </div>
  );
}
