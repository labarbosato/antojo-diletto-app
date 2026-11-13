import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { ErrorNote, Field } from './ui';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const msg = await signIn(email, password);
    setBusy(false);
    if (msg) setError(msg);
  }

  return (
    <div className="login">
      <div className="brand">
        <div className="logo">✦</div>
        <div>
          <h1>Antojo Diletto Buga</h1>
          <small>Tu negocio, en orden</small>
        </div>
      </div>
      <h2>Bienvenida</h2>
      <p className="sub">Ingresa a tu espacio privado de gestión.</p>
      <form onSubmit={onSubmit}>
        <Field label="Correo electrónico">
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Contraseña">
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorNote message={error} />
        <button className="btn block" type="submit" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p className="footer">Tus datos solo se consultan con tu sesión. No compartas tu contraseña.</p>
    </div>
  );
}
