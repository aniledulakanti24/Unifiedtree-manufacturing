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
import Reports from './pages/Reports';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Purchasing from './pages/Purchasing';
import Machines from './pages/Machines';
import JobCard from './pages/JobCard';
import Ask from './pages/Ask';
import Setup from './pages/Setup';
import Scan from './pages/Scan';
import Approvals from './pages/Approvals';
import PacketLabelsPrint from './pages/PacketLabelsPrint';
import Customize from './pages/Customize';
import LotLabel from './pages/LotLabel';
import Track from './pages/Track';
import AccessControl from './pages/AccessControl';

const guard = (perm, el) => <RequirePermission perm={perm}>{el}</RequirePermission>;

export default function App() {
  const { user } = useAuth();
  const [theme, toggleTheme] = useTheme();

  if (!user) {
    return (
      <Routes>
        {/* The customer's tracking page needs no login. */}
        <Route path="track/:id" element={<Track />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="track/:id" element={<Track />} />
      <Route element={<Layout theme={theme} onToggleTheme={toggleTheme} />}>
        <Route index element={<Navigate to={['factory', 'qc', 'supervisor'].includes(user.role) ? '/work' : '/dashboard'} replace />} />
        <Route path="work" element={guard('work.view', <MyWork />)} />
        <Route path="dashboard" element={guard('dashboard.view', <Dashboard />)} />
        <Route path="orders" element={guard('orders.view', <Orders />)} />
        <Route path="orders/new" element={guard('orders.create', <NewOrder />)} />
        <Route path="orders/:id/edit" element={guard('orders.edit', <NewOrder />)} />
        <Route path="orders/:id" element={guard('orders.view', <OrderDetail />)} />
        <Route path="review" element={guard('orders.review', <FactoryReview />)} />
        <Route path="production" element={guard('production.view', <Production />)} />
        <Route path="qc" element={guard('qc.inspect', <QualityControl />)} />
        <Route path="approvals" element={guard('stage.approve', <Approvals />)} />
        <Route path="dispatch" element={guard('dispatch.view', <Dispatch />)} />
        <Route path="inventory" element={guard('inventory.view', <Inventory />)} />
        <Route path="reports" element={guard('reports.view', <Reports />)} />
        <Route path="customers" element={guard('customers.view', <Customers />)} />
        <Route path="customers/:name" element={guard('customers.view', <CustomerDetail />)} />
        <Route path="purchasing" element={guard('purchase.view', <Purchasing />)} />
        <Route path="machines" element={guard('machines.view', <Machines />)} />
        <Route path="orders/:id/job-card" element={guard('orders.view', <JobCard />)} />
        <Route path="orders/:id/labels" element={guard('orders.view', <PacketLabelsPrint />)} />
        <Route path="ask" element={guard('ask.use', <Ask />)} />
        <Route path="setup" element={guard('setup.manage', <Setup />)} />
        <Route path="scan" element={guard('scan.use', <Scan />)} />
        <Route path="lots/:id/label" element={guard('inventory.view', <LotLabel />)} />
        <Route path="access" element={guard('access.view', <AccessControl />)} />
        <Route path="customize" element={guard('access.view', <Customize />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
