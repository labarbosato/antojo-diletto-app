import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';
import { isConfigured } from './lib/supabase';
import { Layout, type PageId } from './components/Layout';
import { Login } from './components/Login';
import { Icon, type IconName } from './components/Icon';
import Summary from './pages/Summary';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Reservations from './pages/Reservations';
import Customers from './pages/Customers';
import Expenses from './pages/Expenses';
import Deliveries from './pages/Deliveries';
import Reports from './pages/Reports';

const MOBILE_NAV: { id: PageId; label: string; icon: IconName }[] = [
  { id: 'summary', label: 'Resumen', icon: 'home' },
  { id: 'inventory', label: 'Inventario', icon: 'box' },
  { id: 'sales', label: 'Ventas', icon: 'sale' },
  { id: 'reservations', label: 'Reservas', icon: 'bookmark' },
  { id: 'customers', label: 'Clientes', icon: 'users' },
  { id: 'expenses', label: 'Gastos', icon: 'wallet' },
  { id: 'deliveries', label: 'Domicilios', icon: 'truck' },
  { id: 'reports', label: 'Reportes', icon: 'chart' },
];

export default function App() {
  if (!isConfigured) return <ConfigMissing />;
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <div className="splash">Cargando…</div>;
  if (!session) return <Login />;
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

function Shell() {
  const { session, signOut } = useAuth();
  const { loading, error, truncated, refresh } = useData();
  const [page, setPage] = useState<PageId>('summary');

  const go = (p: PageId) => {
    setPage(p);
    window.scrollTo(0, 0);
  };

  return (
    <>
      <Layout page={page} onNavigate={go} email={session?.user.email ?? ''} onSignOut={signOut}>
        {error && (
          <div className="notice error" role="alert">
            {error}{' '}
            <button className="btn secondary small" onClick={() => void refresh()}>
              Reintentar
            </button>
          </div>
        )}
        {truncated && <div className="notice">Hay muchos registros: se muestran los 1.000 más recientes por tabla, así que los totales podrían estar incompletos.</div>}
        {loading ? (
          <div className="splash">Cargando tus datos…</div>
        ) : (
          <>
            {page === 'summary' && <Summary go={go} />}
            {page === 'inventory' && <Inventory />}
            {page === 'sales' && <Sales />}
            {page === 'reservations' && <Reservations />}
            {page === 'customers' && <Customers />}
            {page === 'expenses' && <Expenses />}
            {page === 'deliveries' && <Deliveries />}
            {page === 'reports' && <Reports />}
          </>
        )}
      </Layout>
      <nav className="bottomnav" aria-label="Secciones">
        {MOBILE_NAV.map((n) => (
          <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => go(n.id)} aria-current={page === n.id ? 'page' : undefined}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

function ConfigMissing() {
  return (
    <div className="login">
      <div className="brand">
        <div className="logo">✦</div>
        <div>
          <h1>Antojo Diletto Buga</h1>
          <small>Falta configurar</small>
        </div>
      </div>
      <h2>Conecta Supabase</h2>
      <p className="sub">
        Copia <code>.env.example</code> como <code>.env</code> y pega la URL de tu proyecto y la clave publicable (anon) en <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Luego reinicia <code>npm run dev</code>.
      </p>
    </div>
  );
}
