import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type PageId = 'summary' | 'inventory' | 'sales' | 'reservations' | 'customers' | 'expenses' | 'deliveries' | 'reports';

const NAV: { id: PageId; label: string; icon: IconName }[] = [
  { id: 'summary', label: 'Resumen', icon: 'home' },
  { id: 'inventory', label: 'Inventario', icon: 'box' },
  { id: 'sales', label: 'Ventas', icon: 'sale' },
  { id: 'reservations', label: 'Reservas', icon: 'bookmark' },
  { id: 'customers', label: 'Clientes', icon: 'users' },
  { id: 'expenses', label: 'Gastos', icon: 'wallet' },
  { id: 'deliveries', label: 'Domicilios', icon: 'truck' },
  { id: 'reports', label: 'Reportes', icon: 'chart' },
];

interface Props {
  page: PageId;
  onNavigate: (p: PageId) => void;
  email: string;
  onSignOut: () => void;
  children: ReactNode;
}

export function Layout({ page, onNavigate, email, onSignOut, children }: Props) {
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="logo">✦</div>
          <div>
            <h1>Antojo Diletto Buga</h1>
            <small>Alfajores</small>
          </div>
        </div>
        <nav className="nav" aria-label="Secciones">
          {NAV.map((n) => (
            <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => onNavigate(n.id)} aria-current={page === n.id ? 'page' : undefined}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <span className="muted">{email}</span>
          <button className="btn secondary" onClick={onSignOut}>
            <Icon name="logout" size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <header className="topbar">
        <div className="brand">
          <div className="logo">✦</div>
          <h1>Antojo Diletto Buga</h1>
        </div>
        <button className="btn secondary small" onClick={onSignOut} aria-label="Cerrar sesión">
          <Icon name="logout" size={16} /> Salir
        </button>
      </header>

      <main className="main">
        {children}
        <p className="footer">Valores en pesos colombianos (COP). Las cifras son estimaciones contables y no reemplazan asesoría tributaria.</p>
      </main>
    </div>
  );
}
