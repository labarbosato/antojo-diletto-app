import type { ReactNode } from 'react';

export function PageHead({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="pagehead">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="stat">
      <label>{label}</label>
      <strong className={tone}>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? (
    <div className="notice error" role="alert">
      {message}
    </div>
  ) : null;
}

export function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
