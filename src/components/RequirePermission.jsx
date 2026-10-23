import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { can, ROLES } from '../auth/permissions';
import { permOff } from '../auth/features';
import Icon from './Icon';

export default function RequirePermission({ perm, children }) {
  const { user } = useAuth();
  if (can(user?.role, perm)) return children;
  if (permOff(perm)) return <AccessDenied title="Module switched off" message="The administrator has switched this module off for the company (Customize → Modules)." />;
  return <AccessDenied role={user?.role} />;
}

export function AccessDenied({ role, message, title = 'Access restricted' }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon name="lock" size={28} />
      </span>
      <h1>{title}</h1>
      <p className="muted">{message ?? `Your role (${ROLES[role]?.label ?? role}) doesn't have permission to open this page.`}</p>
      <Link className="btn primary" to="/">
        Back to dashboard
      </Link>
    </div>
  );
}
