import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { can, ROLES } from '../auth/permissions';
import Icon from './Icon';

export default function RequirePermission({ perm, children }) {
  const { user } = useAuth();
  if (can(user?.role, perm)) return children;
  return <AccessDenied role={user?.role} />;
}

export function AccessDenied({ role, message }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon name="lock" size={28} />
      </span>
      <h1>Access restricted</h1>
      <p className="muted">{message ?? `Your role (${ROLES[role]?.label ?? role}) doesn't have permission to open this page.`}</p>
      <Link className="btn primary" to="/">
        Back to dashboard
      </Link>
    </div>
  );
}
