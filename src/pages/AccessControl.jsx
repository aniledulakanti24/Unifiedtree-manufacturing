import { useState } from 'react';
import { PERMISSIONS, ROLES, rolesFor } from '../auth/permissions';
import { permOff } from '../auth/features';
import { Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { Card, Modal, PageHeader, RoleBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icon';
import { RENAMABLE_LABELS, tr, useLang } from '../i18n';

/** Administrator settings: section names and the role-permission matrix. Stages and modules are on the Customize page. */
export default function AccessControl() {
  const roles = Object.keys(ROLES);
  const { state, act } = useStore();
  const { t } = useLang();
  const { labels } = state.settings;
  const [draft, setDraft] = useState(() => ({ ...labels }));
  const changed = RENAMABLE_LABELS.some((k) => (draft[k] ?? '').trim() !== (labels[k] ?? ''));

  const saveLabels = () =>
    act('SET_LABELS', {
      labels: Object.fromEntries(RENAMABLE_LABELS.map((k) => [k, (draft[k] ?? '').trim()]).filter(([, v]) => v)),
    });

  return (
    <>
      <PageHeader
        title={t('nav.access')}
        subtitle="You decide the section names and who can access what. Changes apply to every role."
      />

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
                      <div className="muted small">
                        {key}
                        {permOff(key) && (
                          <>
                            {' · '}
                            <Link to="/customize">module switched off</Link>
                          </>
                        )}
                      </div>
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

      <Users />
    </>
  );
}

/** People who can sign in: add, edit (name, email, role) and remove. Someone always stays administrator. */
function Users() {
  const { state, act } = useStore();
  const { user: me } = useAuth();
  const [editing, setEditing] = useState(null); // person, or {} for a new one
  const admins = state.users.filter((u) => u.role === 'admin').length;
  const ordersBy = (id) => state.orders.filter((o) => o.createdBy === id).length;

  return (
    <Card
      icon="user"
      title="Users"
      actions={
        <button className="btn small primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={14} /> Add user
        </button>
      }
    >
      <p className="muted small">Everyone here can sign in with the role shown. What a role can do is set in the matrix above.</p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th className="sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.users.map((u) => {
              const lastAdmin = u.role === 'admin' && admins === 1;
              const why = u.id === me.id ? 'You cannot remove yourself' : lastAdmin ? 'There must be at least one administrator' : '';
              return (
                <tr key={u.id}>
                  <td data-label="Name">
                    {u.name} {u.id === me.id && <span className="muted small">(you)</span>}
                  </td>
                  <td data-label="Email">{u.email}</td>
                  <td data-label="Role">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="row-actions">
                    <button className="btn small" onClick={() => setEditing(u)}>
                      Edit
                    </button>
                    <button
                      className="btn small danger"
                      disabled={Boolean(why)}
                      title={why || (ordersBy(u.id) ? `Their ${ordersBy(u.id)} work orders stay, with their name` : 'Remove')}
                      onClick={() => act('DELETE_USER', { id: u.id })}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <UserDialog
          person={editing}
          users={state.users}
          onClose={() => setEditing(null)}
          onSave={(person) => {
            act('SAVE_USER', { person });
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function UserDialog({ person, users, onClose, onSave }) {
  const [name, setName] = useState(person.name ?? '');
  const [email, setEmail] = useState(person.email ?? '');
  const [role, setRole] = useState(person.role ?? 'sales');
  const others = users.filter((u) => u.id !== person.id);
  const error = !name.trim()
    ? 'Enter a name.'
    : !/^\S+@\S+\.\S+$/.test(email.trim())
      ? 'Enter a valid email.'
      : others.some((u) => u.email === email.trim().toLowerCase())
        ? 'Someone already uses this email.'
        : role !== 'admin' && !others.some((u) => u.role === 'admin')
          ? 'This is the only administrator – keep the role, or make someone else administrator first.'
          : null;

  const submit = (e) => {
    e.preventDefault();
    if (!error) onSave({ ...person, name, email, role });
  };

  return (
    <Modal title={person.id ? `Edit ${person.name}` : 'Add user'} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <label className="span-2">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ROLES).map(([k, r]) => (
              <option key={k} value={k}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="field-error span-2">{error}</p>}
        <div className="btn-row span-2">
          <button type="submit" className="btn primary" disabled={Boolean(error)}>
            {person.id ? 'Save' : 'Add user'}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
