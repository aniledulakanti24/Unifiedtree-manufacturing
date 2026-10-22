import { PERMISSIONS, ROLES } from '../auth/permissions';
import { USERS } from '../data/seed';
import { Card, PageHeader, RoleBadge } from '../components/ui';

export default function AccessControl() {
  const roles = Object.keys(ROLES);
  return (
    <>
      <PageHeader title="Roles & Access" subtitle="Role-based access control. Edit src/auth/permissions.js to change what each role can do." />
      <Card icon="lock" title="Permission matrix">
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
              {Object.entries(PERMISSIONS).map(([key, p]) => (
                <tr key={key}>
                  <td>
                    {p.label}
                    <div className="muted small">{key}</div>
                  </td>
                  {roles.map((r) => (
                    <td key={r} className="center">
                      {p.roles.includes(r) ? <span className="ok-text">✓</span> : <span className="muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
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
