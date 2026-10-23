import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../auth/permissions';
import Icon from '../components/Icon';

const ROLE_INFO = {
  admin: { icon: 'lock', hint: 'Full access. Decides section names, access and which stages need approval.' },
  sales: { icon: 'file', hint: 'Creates work orders (customer PO & PI) and shares QC reports with the client.' },
  factory: { icon: 'factory', hint: 'Checks raw material, runs production and dispatch.' },
  supervisor: { icon: 'checkCircle', hint: 'Approves every stage before the order moves on.' },
  qc: { icon: 'shield', hint: 'Inspects finished goods before dispatch.' },
};

const FLOW = ['Work order', 'Factory review', 'Production', 'Stage approvals', 'QC', 'Client approval', 'Dispatch'];

export default function Login() {
  const { login, users } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="login">
      <section className="login-intro">
        <div className="brand">
          <span className="brand-mark">UT</span>
          <div>
            <strong>Unifiedtree SCM</strong>
            <small>Supply Chain Management</small>
          </div>
        </div>
        <h1>From work order to dispatch, in one place.</h1>
        <ol className="login-flow">
          {FLOW.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ol>
      </section>

      <main className="login-box">
        <h2>Sign in</h2>
        <p className="muted">Demo mode: choose a user to see the app with that role's access.</p>
        <div className="login-grid">
          {users.map((u) => (
            <button
              key={u.id}
              className={`login-user tone-${ROLES[u.role].tone}`}
              onClick={() => {
                login(u.id);
                navigate('/');
              }}
            >
              <span className="login-role-icon">
                <Icon name={ROLE_INFO[u.role].icon} size={20} />
              </span>
              <span className="login-user-text">
                <strong>{u.name}</strong>
                <span className="login-role">{ROLES[u.role].label}</span>
                <small className="muted">{ROLE_INFO[u.role].hint}</small>
              </span>
              <Icon name="arrowRight" size={18} className="login-go" />
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
