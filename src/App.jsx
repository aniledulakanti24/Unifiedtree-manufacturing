import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/useTheme';
import Layout from './components/Layout';
import RequirePermission from './components/RequirePermission';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyWork from './pages/MyWork';
import Orders from './pages/Orders';
import NewOrder from './pages/NewOrder';
import OrderDetail from './pages/OrderDetail';
import FactoryReview from './pages/FactoryReview';
import Production from './pages/Production';
import QualityControl from './pages/QualityControl';
import Dispatch from './pages/Dispatch';
import Inventory from './pages/Inventory';
import AccessControl from './pages/AccessControl';

const guard = (perm, el) => <RequirePermission perm={perm}>{el}</RequirePermission>;

export default function App() {
  const { user } = useAuth();
  const [theme, toggleTheme] = useTheme();

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout theme={theme} onToggleTheme={toggleTheme} />}>
        <Route index element={<Navigate to={['factory', 'qc', 'supervisor'].includes(user.role) ? '/work' : '/dashboard'} replace />} />
        <Route path="work" element={guard('work.view', <MyWork />)} />
        <Route path="dashboard" element={guard('dashboard.view', <Dashboard />)} />
        <Route path="orders" element={guard('orders.view', <Orders />)} />
        <Route path="orders/new" element={guard('orders.create', <NewOrder />)} />
        <Route path="orders/:id" element={guard('orders.view', <OrderDetail />)} />
        <Route path="review" element={guard('orders.review', <FactoryReview />)} />
        <Route path="production" element={guard('production.view', <Production />)} />
        <Route path="qc" element={guard('qc.inspect', <QualityControl />)} />
        <Route path="dispatch" element={guard('dispatch.manage', <Dispatch />)} />
        <Route path="inventory" element={guard('inventory.view', <Inventory />)} />
        <Route path="access" element={guard('access.view', <AccessControl />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
