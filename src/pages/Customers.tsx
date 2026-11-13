import { useMemo, useState, type FormEvent } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { createCustomer, updateCustomer } from '../lib/api';
import { dayOf, fmtDay, money } from '../lib/format';
import { groupOrders, itemsText, reservationPaid, reservationTotal, reservationUnits, sum } from '../lib/finance';
import type { Customer, ReservationStatus } from '../lib/types';
import { Empty, ErrorNote, Field, PageHead, Stat } from '../components/ui';

type Mode = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; id: string };

const STATUS: Record<ReservationStatus, { label: string; cls: string }> = {
  active: { label: 'Reservada', cls: 'pill' },
  delivered: { label: 'Entregada', cls: 'pill ok' },
  cancelled: { label: 'Cancelada', cls: 'pill bad' },
};

export default function Customers() {
  const { customers, reservations, sales, reservationsReady, refresh } = useData();
  const [mode, setMode] = useState<Mode>({ kind: 'none' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const close = () => setMode({ kind: 'none' });
  const target = mode.kind === 'edit' ? customers.find((c) => c.id === mode.id) : undefined;

  const orders = useMemo(() => groupOrders(sales.filter((s) => s.customer_id)), [sales]);
  const stats = useMemo(() => {
    const map = new Map<string, { active: number; units: number; orders: number; spent: number }>();
    for (const c of customers) map.set(c.id, { active: 0, units: 0, orders: 0, spent: 0 });
    for (const r of reservations) {
      const s = map.get(r.customer_id);
      if (s && r.status === 'active') {
        s.active += 1;
        s.units += reservationUnits(r);
      }
    }
    for (const o of orders) {
      const s = o.customerId ? map.get(o.customerId) : undefined;
      if (s) {
        s.orders += 1;
        s.spent += o.productTotal + o.deliveryCharged;
      }
    }
    return map;
  }, [customers, reservations, orders]);

  const shown = customers.filter((c) => {
    const t = q.trim().toLowerCase();
    return !t || c.name.toLowerCase().includes(t) || c.phone.toLowerCase().includes(t);
  });
  const opened = openId ? customers.find((c) => c.id === openId) : undefined;

  return (
    <>
      <PageHead
        eyebrow="Clientes"
        title="Tus clientes"
        sub="Guarda a quién le vendes y revisa sus reservas y compras."
        action={
          reservationsReady ? (
            <button className="btn" onClick={() => setMode({ kind: 'new' })}>
              + Nuevo cliente
            </button>
          ) : undefined
        }
      />

      {!reservationsReady ? (
        <div className="notice">
          Falta instalar la actualización de clientes y reservas. En Supabase → SQL Editor, ejecuta el contenido de <code>supabase/clientes_reservas.sql</code> y recarga la página.
        </div>
      ) : (
        <>
          <div className="stats three">
            <Stat label="Clientes" value={customers.length} />
            <Stat label="Con reservas activas" value={[...stats.values()].filter((s) => s.active > 0).length} />
            <Stat label="Unidades reservadas" value={sum([...stats.values()].map((s) => s.units))} />
          </div>

          {mode.kind === 'new' && <CustomerForm onDone={async () => { await refresh(); close(); }} onCancel={close} />}
          {mode.kind === 'edit' && target && <CustomerForm customer={target} onDone={async () => { await refresh(); close(); }} onCancel={close} />}

          {customers.length > 0 && (
            <div className="searchbox">
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o teléfono…" aria-label="Buscar cliente" style={{ width: '100%' }} />
            </div>
          )}

          <section className="panel">
            {customers.length === 0 ? (
              <Empty>Aún no tienes clientes. Crea el primero con “Nuevo cliente”.</Empty>
            ) : shown.length === 0 ? (
              <Empty>Ningún cliente coincide con la búsqueda.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Teléfono</th>
                      <th className="num">Reservadas</th>
                      <th className="num">Compras</th>
                      <th className="num">Total comprado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => {
                      const s = stats.get(c.id) ?? { active: 0, units: 0, orders: 0, spent: 0 };
                      return (
                        <tr key={c.id}>
                          <td>
                            <b>{c.name}</b>
                            {c.notes && <div className="muted">{c.notes}</div>}
                          </td>
                          <td>{c.phone || <span className="muted">—</span>}</td>
                          <td className="num">{s.units > 0 ? <span className="pill">{s.units} u.</span> : '—'}</td>
                          <td className="num">{s.orders}</td>
                          <td className="num">{money(s.spent)}</td>
                          <td className="row-actions">
                            <button className="btn secondary small" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                              {openId === c.id ? 'Ocultar historial' : 'Ver historial'}
                            </button>
                            <button className="btn secondary small" onClick={() => setMode({ kind: 'edit', id: c.id })}>
                              Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {opened && <History customer={opened} />}
        </>
      )}
    </>
  );
}

function History({ customer }: { customer: Customer }) {
  const { reservations, sales } = useData();
  const res = reservations.filter((r) => r.customer_id === customer.id);
  const orders = groupOrders(sales.filter((s) => s.customer_id === customer.id));

  return (
    <section className="panel">
      <h3>Historial de {customer.name}</h3>
      <div className="section-head"><h3 style={{ fontSize: 16 }}>Reservas</h3></div>
      {res.length === 0 ? (
        <Empty>Sin reservas.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Productos</th>
                <th className="num">Total</th>
                <th className="num">Abonado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {res.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDay(dayOf(r.created_at))}</td>
                  <td>{itemsText(r.reservation_items)}</td>
                  <td className="num">{money(reservationTotal(r))}</td>
                  <td className="num">{money(reservationPaid(r))}</td>
                  <td><span className={STATUS[r.status].cls}>{STATUS[r.status].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="section-head" style={{ marginTop: 18 }}><h3 style={{ fontSize: 16 }}>Compras</h3></div>
      {orders.length === 0 ? (
        <Empty>Sin compras registradas a su nombre.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Productos</th>
                <th className="num">Alfajores</th>
                <th className="num">Domicilio</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.key}>
                  <td>{fmtDay(dayOf(o.soldAt))}</td>
                  <td>{itemsText(o.lines)}</td>
                  <td className="num">{money(o.productTotal)}</td>
                  <td className="num">{money(o.deliveryCharged)}</td>
                  <td>{o.isPaid ? <span className="pill ok">Pagado</span> : <span className="pill bad">Pendiente</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CustomerForm({ customer, onDone, onCancel }: { customer?: Customer; onDone: () => Promise<void>; onCancel: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Escribe el nombre del cliente.');
    setBusy(true);
    try {
      const input = { name: name.trim(), phone: phone.trim(), notes: notes.trim() };
      if (customer) await updateCustomer(customer.id, input);
      else await createCustomer(input);
      toast(customer ? 'Cliente actualizado.' : 'Cliente creado.');
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3>{customer ? `Editar · ${customer.name}` : 'Nuevo cliente'}</h3>
      <form onSubmit={onSubmit}>
        <div className="formgrid">
          <Field label="Nombre">
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Teléfono (opcional)">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Notas (opcional)" full>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dirección, gustos, observaciones…" />
          </Field>
        </div>
        <ErrorNote message={error} />
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button className="btn secondary" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
