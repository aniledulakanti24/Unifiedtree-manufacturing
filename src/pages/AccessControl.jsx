import { useState } from 'react';
import { PERMISSIONS, ROLES, rolesFor } from '../auth/permissions';
import { APPROVAL_STAGES } from '../data/statuses';
import { USERS } from '../data/seed';
import { useStore } from '../context/StoreContext';
import { Card, PageHeader, RoleBadge } from '../components/ui';
import { RENAMABLE_LABELS, tr, useLang } from '../i18n';

/** Administrator settings: section names, which stages need approval, and the role-permission matrix. */
export default function AccessControl() {
  const roles = Object.keys(ROLES);
  const { state, act } = useStore();
  const { t } = useLang();
  const { labels, approvalStages } = state.settings;
  const [draft, setDraft] = useState(() => ({ ...labels }));
  const changed = RENAMABLE_LABELS.some((k) => (draft[k] ?? '').trim() !== (labels[k] ?? ''));

  const saveLabels = () =>
    act('SET_LABELS', {
      labels: Object.fromEntries(RENAMABLE_LABELS.map((k) => [k, (draft[k] ?? '').trim()]).filter(([, v]) => v)),
    });

  const toggleStage = (s, on) =>
    act('SET_APPROVAL_STAGES', { stages: on ? [...approvalStages, s] : approvalStages.filter((x) => x !== s) });

  return (
    <>
      <PageHeader
        title={t('nav.access')}
        subtitle="You decide the section names, who can access what, and which stages need approval. Changes apply to every role."
      />

      <div className="grid-2">
        <Card icon="file" title="Section names">
          <p className="muted small">Leave a name empty to use the default. The new name shows in the menu and page titles for everyone.</p>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th scope="col">Default</th>
                  <th scope="col">Name shown to everyone</th>
                </tr>
              </thead>
              <tbody>
                {RENAMABLE_LABELS.map((k) => (
                  <tr key={k}>
                    <td className="small">
                      {tr('en', k)}
                      <div className="muted">{k.startsWith('navg.') ? 'Menu group' : 'Section'}</div>
                    </td>
                    <td>
                      <input
                        value={draft[k] ?? ''}
                        placeholder={tr('en', k)}
                        aria-label={`New name for ${tr('en', k)}`}
                        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="btn-row">
            <button className="btn primary" disabled={!changed} onClick={saveLabels}>
              Save names
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setDraft({});
                act('SET_LABELS', { labels: {} });
              }}
            >
              Reset to defaults
            </button>
          </div>
        </Card>

        <Card icon="lock" title="Stage approvals">
          <p className="muted small">
            When a stage is ticked, the order stops after that stage until a stage approver ({rolesFor('stage.approve').map((r) => ROLES[r].label).join(', ')})
            signs it off. Nobody can approve their own work, except the administrator.
          </p>
          <fieldset className="checks">
            <legend className="sr-only">Stages that need approval</legend>
            {APPROVAL_STAGES.map((s) => {
              const on = approvalStages.includes(s);
              return (
                <label key={s} className={`check ${on ? 'checked' : ''}`}>
                  <input type="checkbox" checked={on} onChange={(e) => toggleStage(s, e.target.checked)} />
                  {t(`flow.${s}`)}
                </label>
              );
            })}
          </fieldset>
          <p className="muted small">Applies to stages reached from now on. Orders already waiting keep their current approval.</p>
        </Card>
      </div>

      <Card icon="lock" title="Permission matrix">
        <p className="muted small">Tick a box to give a role that permission. The administrator always has every permission.</p>
        <div className="table-wrap">
          <table className="table matrix">
            <thead>
              <tr>
                <th>Permission</th>
                {roles.map((r) => (
                  <th key={r} className="center">
                    <RoleBadge role={r} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERMISSIONS).map(([key, p]) => {
                const holders = rolesFor(key);
                return (
                  <tr key={key}>
                    <td>
                      {p.label}
                      <div className="muted small">{key}</div>
                    </td>
                    {roles.map((r) => (
                      <td key={r} className="center">
                        <input
                          type="checkbox"
                          className="matrix-check"
                          checked={holders.includes(r)}
                          disabled={r === 'admin'}
                          aria-label={`${ROLES[r].label}: ${p.label}`}
                          onChange={(e) => act('SET_ACCESS', { perm: key, role: r, on: e.target.checked })}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card icon="user" title="Users">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {USERS.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
