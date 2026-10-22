import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { can } from '../auth/permissions';
import { useLang } from '../i18n';
import { ReasonDialog, ReasonText } from './ReasonPicker';
import { fmtDateTime } from '../utils';

/** Open problem on an order (machine broken, will be late…) with a "solved" button, or a button to report one. */
export default function ProblemBox({ order, compact = false }) {
  const { user } = useAuth();
  const { act } = useStore();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const canReport = can(user.role, 'production.update') || can(user.role, 'qc.inspect');

  if (order.problem) {
    const pr = order.problem;
    return (
      <div className="problem-box" role="alert">
        <div>
          <strong>{t('problem.banner')}</strong> <ReasonText code={pr.code} note={pr.note} />
          <div className="small">
            {t('problem.by', { name: pr.by })} · {fmtDateTime(pr.at)}
          </div>
        </div>
        <button type="button" className="btn success" onClick={() => act('SOLVE_PROBLEM', { id: order.id })}>
          {t('problem.solved')}
        </button>
      </div>
    );
  }

  if (!canReport || order.status === 'DELIVERED') return null;
  return (
    <>
      <button type="button" className={`btn danger ${compact ? '' : 'block'}`} onClick={() => setOpen(true)}>
        {compact ? t('work.problem') : t('problem.report')}
      </button>
      {open && (
        <ReasonDialog
          group="problem"
          title={t('reason.problemTitle')}
          onClose={() => setOpen(false)}
          onSubmit={({ code, note }) => {
            act('REPORT_PROBLEM', { id: order.id, code, note });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
