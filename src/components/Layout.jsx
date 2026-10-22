import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications, useStore, useVisibleOrders } from '../context/StoreContext';
import { can, ROLES } from '../auth/permissions';
import { pendingActionFor } from '../data/statuses';
import { useLang } from '../i18n';
import Icon from './Icon';
import { fmtDateTime } from '../utils';

// Labels are i18n keys. `count: 'mine'` counts orders waiting on the current user.
const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { to: '/work', label: 'nav.work', icon: 'checkCircle', perm: 'work.view', count: 'mine' },
      { to: '/dashboard', label: 'nav.dashboard', icon: 'dashboard', perm: 'dashboard.view' },
      { to: '/orders', label: 'nav.orders', icon: 'file', perm: 'orders.view', end: true },
      { to: '/orders/new', label: 'nav.newOrder', icon: 'plus', perm: 'orders.create' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/review', label: 'nav.review', icon: 'factory', perm: 'orders.review', count: ['PENDING_REVIEW', 'ON_HOLD'] },
      { to: '/production', label: 'nav.production', icon: 'layers', perm: 'production.view', count: ['ACCEPTED', 'IN_PRODUCTION', 'PACKAGING'] },
      { to: '/qc', label: 'nav.qc', icon: 'shield', perm: 'qc.inspect', count: ['READY_TO_DISPATCH'] },
      { to: '/dispatch', label: 'nav.dispatch', icon: 'truck', perm: 'dispatch.manage', count: ['CLIENT_APPROVED'] },
    ],
  },
  {
    title: 'Inventory',
    items: [{ to: '/inventory', label: 'nav.inventory', icon: 'box', perm: 'inventory.view' }],
  },
  {
    title: 'Admin',
    items: [{ to: '/access', label: 'nav.access', icon: 'lock', perm: 'access.view' }],
  },
];

/** Big one-tap switch between English and Hindi. */
export function LangToggle({ className = 'icon-btn lang-btn' }) {
  const { lang, setLang, t } = useLang();
  return (
    <button className={className} onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')} aria-label={t('lang.label')} title={t('lang.label')}>
      <Icon name="globe" size={18} />
      <span lang={lang === 'hi' ? 'en' : 'hi'}>{t('lang.switch')}</span>
    </button>
  );
}

export default function Layout({ theme, onToggleTheme }) {
  const { user, logout } = useAuth();
  const { act } = useStore();
  const orders = useVisibleOrders();
  const { t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);

  // On navigation: close the mobile menu, scroll to top and move focus to the page for screen readers.
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const resetDemo = () => {
    if (window.confirm('Reset all demo data? Orders and stock changes will be lost.')) act('RESET');
  };

  return (
    <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark">UT</span>
          <div>
            <strong>Unifiedtree</strong>
            <small>Supply Chain Management</small>
          </div>
          <button className="icon-btn close-menu" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <Icon name="x" />
          </button>
        </div>
        <nav>
          {NAV_GROUPS.map((g) => {
            const items = g.items.filter((n) => can(user.role, n.perm));
            if (items.length === 0) return null;
            return (
              <div key={g.title} className="nav-group">
                <div className="nav-title">{t(`navg.${g.title}`)}</div>
                {items.map((n) => {
                  const count =
                    n.count === 'mine'
                      ? orders.filter((o) => pendingActionFor(user.role, o) || o.problem).length
                      : n.count
                        ? orders.filter((o) => n.count.includes(o.status)).length
                        : 0;
                  return (
                    <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
                      <Icon name={n.icon} />
                      <span>{t(n.label)}</span>
                      {count > 0 && (
                        <span className="nav-count" aria-label={`${count} waiting`}>
                          {count}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="avatar">{user.name[0]}</div>
            <div>
              <strong>{user.name}</strong>
              <small>{ROLES[user.role].label}</small>
            </div>
          </div>
          <button className="side-btn" onClick={logout}>
            <Icon name="logout" size={16} /> {t('nav.switchUser')}
          </button>
          <button className="side-btn" onClick={resetDemo}>
            <Icon name="reset" size={16} /> {t('nav.reset')}
          </button>
        </div>
      </aside>
      <div className="backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}>
            <Icon name="menu" />
          </button>
          <GlobalSearch />
          <div className="topbar-actions">
            <LangToggle />
            <button
              className="icon-btn"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <NotificationBell />
            <div className="user-chip" title={`${user.name} · ${ROLES[user.role].label}`}>
              <div className="avatar">{user.name[0]}</div>
              <div className="user-meta">
                <strong>{user.name}</strong>
                <small>{ROLES[user.role].label}</small>
              </div>
            </div>
          </div>
        </header>
        <main id="main" className="content" ref={mainRef} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  // Press "/" anywhere to jump to search.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/orders${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
        inputRef.current?.blur();
      }}
    >
      <Icon name="search" size={16} />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search WO no., PO / PI no. or customer…"
        aria-label="Search work orders"
      />
      <kbd aria-hidden="true">/</kbd>
    </form>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { act } = useStore();
  const notes = useNotifications();
  const navigate = useNavigate();
  const ref = useRef(null);
  const unread = notes.filter((n) => !n.readBy.includes(user.id));

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="notif" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`}
        aria-expanded={open}
      >
        <Icon name="bell" />
        {unread.length > 0 && <span className="notif-dot">{unread.length}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>Notifications</strong>
            {unread.length > 0 && (
              <button className="link-btn" onClick={() => act('MARK_ALL_READ', { ids: unread.map((n) => n.id) })}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {notes.length === 0 && <p className="muted pad">You're all caught up.</p>}
            {notes.slice(0, 15).map((n) => (
              <button
                key={n.id}
                className={`notif-item ${n.readBy.includes(user.id) ? '' : 'unread'}`}
                onClick={() => {
                  act('MARK_ALL_READ', { ids: [n.id] });
                  setOpen(false);
                  if (n.orderId) navigate(`/orders/${n.orderId}`);
                }}
              >
                <span>{n.message}</span>
                <small className="muted">{fmtDateTime(n.at)}</small>
              </button>
            ))}
          </div>
          <Link className="notif-foot" to="/orders" onClick={() => setOpen(false)}>
            View all orders
          </Link>
        </div>
      )}
    </div>
  );
}
