import { useState, type FormEvent } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import {
  addReservationItem,
  addReservationPayment,
  cancelReservation,
  createCustomer,
  createReservation,
  fulfillReservation,
  removeReservationItem,
} from '../lib/api';
import { dayOf, fmtDay, money, num, toTimestamp, todayISO } from '../lib/format';
import { reservationPaid, reservationTotal, reservationUnits, sum } from '../lib/finance';
import { PAYMENT_METHODS, type Reservation, type ReservationStatus } from '../lib/types';
import { Empty, ErrorNote, Field, PageHead, Stat } from '../components/ui';

const NEW_CUSTOMER = '__new';

const STATUS: Record<ReservationStatus, { label: string; cls: string }> = {
  active: { label: 'Reservada', cls: 'pill' },
  delivered: { label: 'Entregada', cls: 'pill ok' },
  cancelled: { label: 'Cancelada', cls: 'pill bad' },
};

interface Line {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export default function Reservations() {
  const { reservations, reservationsReady, reserved, refresh } = useData();
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<ReservationStatus>('active');

  const active = reservations.filter((r) => r.status === 'active');
  const shown = reservations.filter((r) => r.status === tab);

  return (
    <>
      <PageHead
        eyebrow="Reservas"
        title="Pedidos separados"
        sub="Aparta alfajores para un cliente sin descontar tu stock. Cuando los recoge, conviértelos en venta con un clic."
        action={
          reservationsReady ? (
            <button className="btn" onClick={() => setCreating(true)}>
              + Nueva reserva
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
            <Stat label="Reservas activas" value={active.length} />
            <Stat label="Unidades reservadas" value={sum([...reserved.values()])} note="No descuentan el stock" />
            <Stat label="Abonos en reservas activas" value={money(sum(active.map(reservationPaid)))} note={`Total pedido ${money(sum(active.map(reservationTotal)))}`} />
          </div>

          {creating && (
            <NewReservation
              onDone={async () => {
                await refresh();
                setCreating(false);
                setTab('active');
              }}
              onCancel={() => setCreating(false)}
            />
          )}

          <div className="subtabs" role="tablist" aria-label="Estado de la reserva">
            {(['active', 'delivered', 'cancelled'] as ReservationStatus[]).map((s) => (
              <button key={s} role="tab" aria-selected={tab === s} className={tab === s ? 'active' : ''} onClick={() => setTab(s)}>
                {s === 'active' ? 'Activas' : s === 'delivered' ? 'Entregadas' : 'Canceladas'} ({reservations.filter((r) => r.status === s).length})
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <section className="panel">
              <Empty>{tab === 'active' ? 'No hay reservas activas. Crea una con “Nueva reserva”.' : tab === 'delivered' ? 'Aún no hay reservas entregadas.' : 'No hay reservas canceladas.'}</Empty>
            </section>
          ) : (
            <div className="cards">
              {shown.map((r) => (
                <ReservationCard key={r.id} r={r} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function useAvailability() {
  const { products, reserved } = useData();
  return {
    products,
    availableOf: (id: string): number => {
      const p = products.find((x) => x.id === id);
      return p ? Math.max(0, p.stock - (reserved.get(id) ?? 0)) : 0;
    },
  };
}

/** Selector de producto + cantidad + precio que arma una lista de líneas. */
function LineBuilder({ lines, setLines }: { lines: Line[]; setLines: (l: Line[]) => void }) {
  const { products, availableOf } = useAvailability();
  const choices = products.filter((p) => availableOf(p.id) > 0);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const pid = choices.some((p) => p.id === productId) ? productId : choices[0]?.id ?? '';
  const sel = products.find((p) => p.id === pid);
  const inLines = (id: string) => sum(lines.filter((l) => l.productId === id).map((l) => l.quantity));
  const left = (id: string) => availableOf(id) - inLines(id);

  function pick(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) setPrice(String(p.sale_price));
  }

  function add() {
    setErr(null);
    if (!sel) return setErr('No hay productos disponibles para reservar.');
    const q = num(qty);
    const pr = price === '' ? sel.sale_price : num(price);
    if (!Number.isInteger(q) || q < 1) return setErr('La cantidad debe ser un entero de 1 en adelante.');
    if (!Number.isFinite(pr) || pr < 0) return setErr('El precio debe ser un número igual o mayor que 0.');
    if (q > left(sel.id)) return setErr(`Solo puedes agregar ${Math.max(0, left(sel.id))} más de ${sel.name} (el resto ya está reservado o agotado).`);
    const i = lines.findIndex((l) => l.productId === sel.id && l.unitPrice === pr);
    if (i >= 0) setLines(lines.map((l, k) => (k === i ? { ...l, quantity: l.quantity + q } : l)));
    else setLines([...lines, { productId: sel.id, quantity: q, unitPrice: pr }]);
    setQty('1');
  }

  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? 'Producto';

  return (
    <>
      <div className="addline">
        <Field label="Sabor">
          <select value={pid} onChange={(e) => pick(e.target.value)}>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.size} · disponibles {left(p.id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cantidad">
          <input type="number" inputMode="numeric" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Precio (c/u)">
          <input type="number" inputMode="decimal" min="0" step="100" value={price === '' && sel ? String(sel.sale_price) : price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <button className="btn secondary" type="button" onClick={add} disabled={choices.length === 0}>
          + Agregar
        </button>
      </div>
      <ErrorNote message={err} />
      {lines.length > 0 && (
        <ul className="linelist">
          {lines.map((l, i) => (
            <li key={`${l.productId}-${l.unitPrice}-${i}`}>
              <span className="grow">
                <b>{l.quantity} × {nameOf(l.productId)}</b> <span className="muted">a {money(l.unitPrice)} c/u</span>
              </span>
              <b>{money(l.quantity * l.unitPrice)}</b>
              <button className="btn secondary small" type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NewReservation({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const { customers } = useData();
  const toast = useToast();
  const [customerId, setCustomerId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [pickup, setPickup] = useState('');
  const [notes, setNotes] = useState('');
  const [deposit, setDeposit] = useState('');
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = sum(lines.map((l) => l.quantity * l.unitPrice));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customerId) return setError('Elige un cliente o crea uno nuevo.');
    if (customerId === NEW_CUSTOMER && !newName.trim()) return setError('Escribe el nombre del cliente nuevo.');
    if (lines.length === 0) return setError('Agrega al menos un sabor a la reserva.');
    const dep = deposit.trim() === '' ? 0 : num(deposit);
    if (!Number.isFinite(dep) || dep < 0) return setError('El abono debe ser un número igual o mayor que 0.');
    setBusy(true);
    try {
      const cid = customerId === NEW_CUSTOMER ? await createCustomer({ name: newName.trim(), phone: newPhone.trim(), notes: '' }) : customerId;
      const resId = await createReservation({ customerId: cid, pickupDate: pickup || null, notes: notes.trim(), lines });
      if (dep > 0) await addReservationPayment({ reservationId: resId, amount: dep, method, paidAt: todayISO(), notes: 'Abono inicial' });
      toast('Reserva guardada. El stock no se descontó.');
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la reserva.');
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3>Nueva reserva</h3>
      <form onSubmit={onSubmit}>
        <div className="formgrid">
          <Field label="Cliente" full={customerId !== NEW_CUSTOMER}>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Elige un cliente…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CUSTOMER}>+ Crear cliente nuevo…</option>
            </select>
          </Field>
          {customerId === NEW_CUSTOMER && (
            <>
              <Field label="Nombre del cliente nuevo">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej. Daniela" />
              </Field>
              <Field label="Teléfono (opcional)">
                <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} inputMode="tel" />
              </Field>
            </>
          )}
        </div>

        <LineBuilder lines={lines} setLines={setLines} />

        <div className="formgrid">
          <Field label="Fecha de entrega (opcional)">
            <input type="date" value={pickup} onChange={(e) => setPickup(e.target.value)} />
          </Field>
          <Field label="Abono inicial (opcional)">
            <input type="number" inputMode="decimal" min="0" step="500" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="Ej. 10000" />
          </Field>
          {deposit.trim() !== '' && num(deposit) > 0 && (
            <Field label="Método del abono">
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Notas (opcional)" full>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Para el cumpleaños, sin empaque, etc." />
          </Field>
        </div>

        <dl className="calc">
          <div><dt>Unidades</dt><dd>{sum(lines.map((l) => l.quantity))}</dd></div>
          <div className="strong"><dt>Total reservado</dt><dd>{money(total)}</dd></div>
          {deposit.trim() !== '' && num(deposit) > 0 && <div><dt>Saldo después del abono</dt><dd>{money(Math.max(0, total - num(deposit)))}</dd></div>}
        </dl>

        <ErrorNote message={error} />
        <div className="actions">
          <button className="btn" type="submit" disabled={busy || lines.length === 0}>
            {busy ? 'Guardando…' : 'Guardar reserva'}
          </button>
          <button className="btn secondary" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

type Sub = 'none' | 'pay' | 'add' | 'deliver';

function ReservationCard({ r }: { r: Reservation }) {
  const { refresh, products } = useData();
  const toast = useToast();
  const [sub, setSub] = useState<Sub>('none');
  const total = reservationTotal(r);
  const paid = reservationPaid(r);
  const balance = total - paid;
  const isActive = r.status === 'active';

  async function removeItem(id: string, label: string) {
    if (r.reservation_items.length <= 1) {
      toast('Una reserva necesita al menos un producto. Si ya no la quiere, usa “Cancelar reserva”.');
      return;
    }
    if (!window.confirm(`¿Quitar ${label} de la reserva? Esas unidades quedan disponibles otra vez.`)) return;
    try {
      await removeReservationItem(id);
      toast('Producto quitado de la reserva.');
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo quitar.');
    }
  }

  async function cancel() {
    const extra = paid > 0 ? ` Tiene ${money(paid)} abonados: recuerda devolverlos al cliente.` : '';
    if (!window.confirm(`¿Cancelar la reserva de ${r.customers?.name ?? 'este cliente'}? Las unidades quedan disponibles otra vez.${extra}`)) return;
    try {
      await cancelReservation(r.id);
      toast('Reserva cancelada.');
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo cancelar.');
      await refresh();
    }
  }

  return (
    <article className="rescard">
      <header>
        <div>
          <h3>{r.customers?.name ?? 'Cliente'}</h3>
          <div className="muted">
            Reservada el {fmtDay(dayOf(r.created_at))}
            {r.pickup_date && ` · entrega ${fmtDay(r.pickup_date)}`}
            {r.closed_at && ` · cerrada el ${fmtDay(dayOf(r.closed_at))}`}
          </div>
        </div>
        <span className={STATUS[r.status].cls}>{STATUS[r.status].label}</span>
      </header>

      <ul className="linelist">
        {r.reservation_items.map((i) => (
          <li key={i.id}>
            <span className="grow">
              <b>{i.quantity} × {i.products?.name ?? 'Producto'}</b> <span className="muted">a {money(i.unit_price)} c/u</span>
            </span>
            <b>{money(i.quantity * i.unit_price)}</b>
            {isActive && (
              <button className="btn secondary small" onClick={() => removeItem(i.id, `${i.quantity} × ${i.products?.name ?? 'producto'}`)}>
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>

      <dl className="calc">
        <div><dt>Unidades</dt><dd>{reservationUnits(r)}</dd></div>
        <div className="strong"><dt>Total</dt><dd>{money(total)}</dd></div>
        <div><dt>Abonado</dt><dd>{money(paid)}</dd></div>
        <div className="strong"><dt>{balance >= 0 ? 'Saldo por cobrar' : 'Saldo a favor del cliente'}</dt><dd>{money(Math.abs(balance))}</dd></div>
      </dl>

      {r.reservation_payments.length > 0 && (
        <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Abonos: {r.reservation_payments.map((p) => `${money(p.amount)} (${fmtDay(p.paid_at)}, ${p.method})`).join(' · ')}
        </div>
      )}
      {r.notes && <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Notas: {r.notes}</div>}
      {r.status === 'cancelled' && paid > 0 && <div className="notice">Esta reserva tenía {money(paid)} abonados. Confirma que se los devolviste al cliente.</div>}

      {isActive && sub === 'none' && (
        <div className="actions">
          <button className="btn" onClick={() => setSub('deliver')}>
            Entregar y registrar venta
          </button>
          <button className="btn secondary" onClick={() => setSub('pay')}>
            Registrar abono
          </button>
          <button className="btn secondary" onClick={() => setSub('add')}>
            Agregar producto
          </button>
          <button className="btn secondary" onClick={cancel}>
            Cancelar reserva
          </button>
        </div>
      )}
      {isActive && sub === 'pay' && <PaymentForm r={r} balance={balance} onClose={() => setSub('none')} />}
      {isActive && sub === 'add' && <AddItemForm r={r} onClose={() => setSub('none')} />}
      {isActive && sub === 'deliver' && <DeliverForm r={r} balance={balance} stockOk={r.reservation_items.every((i) => (products.find((p) => p.id === i.product_id)?.stock ?? 0) >= sum(r.reservation_items.filter((x) => x.product_id === i.product_id).map((x) => x.quantity)))} onClose={() => setSub('none')} />}
    </article>
  );
}

function PaymentForm({ r, balance, onClose }: { r: Reservation; balance: number; onClose: () => void }) {
  const { refresh } = useData();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const a = num(amount);
    if (!Number.isFinite(a) || a <= 0) return setError('El abono debe ser un número mayor que 0.');
    setBusy(true);
    try {
      await addReservationPayment({ reservationId: r.id, amount: a, method, paidAt: date, notes: note.trim() });
      toast('Abono registrado.');
      await refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el abono.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
      <div className="formgrid">
        <Field label={`Valor del abono${balance > 0 ? ` (saldo ${money(balance)})` : ''}`}>
          <input type="number" inputMode="decimal" min="0" step="500" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </Field>
        <Field label="Método">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Fecha">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Nota (opcional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <ErrorNote message={error} />
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar abono'}
        </button>
        <button className="btn secondary" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function AddItemForm({ r, onClose }: { r: Reservation; onClose: () => void }) {
  const { refresh } = useData();
  const toast = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (lines.length === 0) return setError('Agrega al menos un producto.');
    setBusy(true);
    try {
      for (const l of lines) await addReservationItem(r.id, l);
      toast('Productos agregados a la reserva.');
      await refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar.');
      await refresh();
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <LineBuilder lines={lines} setLines={setLines} />
      <ErrorNote message={error} />
      <div className="actions">
        <button className="btn" type="button" onClick={save} disabled={busy || lines.length === 0}>
          {busy ? 'Guardando…' : 'Agregar a la reserva'}
        </button>
        <button className="btn secondary" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function DeliverForm({ r, balance, stockOk, onClose }: { r: Reservation; balance: number; stockOk: boolean; onClose: () => void }) {
  const { refresh } = useData();
  const toast = useToast();
  const [delCharged, setDelCharged] = useState('0');
  const [delPaid, setDelPaid] = useState('0');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [isPaid, setIsPaid] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dc = Number.isFinite(num(delCharged)) ? num(delCharged) : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const dp = num(delPaid);
    if (!Number.isFinite(num(delCharged)) || num(delCharged) < 0) return setError('El domicilio cobrado debe ser un número igual o mayor que 0.');
    if (!Number.isFinite(dp) || dp < 0) return setError('El domicilio pagado debe ser un número igual o mayor que 0.');
    if (!stockOk) return setError('No hay stock físico suficiente para entregar esta reserva. Ajusta el inventario primero.');
    setBusy(true);
    try {
      await fulfillReservation({ reservationId: r.id, deliveryCharged: num(delCharged), deliveryPaid: dp, paymentMethod: method, isPaid, notes: notes.trim(), soldAt: toTimestamp(date) });
      toast('Reserva entregada: venta registrada y stock descontado.');
      await refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la entrega.');
      await refresh();
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
      <div className="notice">
        Al entregar se crea la venta de {r.customers?.name ?? 'este cliente'}, se descuenta el stock y la reserva queda como entregada. {balance > 0 ? `Saldo por cobrar: ${money(balance)}.` : 'Ya está cubierta con los abonos.'}
      </div>
      <div className="formgrid">
        <Field label="Domicilio cobrado al cliente">
          <input type="number" inputMode="decimal" min="0" step="100" value={delCharged} onChange={(e) => setDelCharged(e.target.value)} required />
        </Field>
        <Field label="Domicilio pagado al domiciliario">
          <input type="number" inputMode="decimal" min="0" step="100" value={delPaid} onChange={(e) => setDelPaid(e.target.value)} required />
        </Field>
        <Field label="Fecha de entrega">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Método de pago del saldo">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Estado del pago">
          <select value={String(isPaid)} onChange={(e) => setIsPaid(e.target.value === 'true')}>
            <option value="true">Pagado completo</option>
            <option value="false">Pendiente</option>
          </select>
        </Field>
        <Field label="Notas (opcional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={r.notes || ''} />
        </Field>
      </div>
      <dl className="calc">
        <div><dt>Alfajores</dt><dd>{money(reservationTotal(r))}</dd></div>
        <div><dt>Domicilio cobrado</dt><dd>{money(dc)}</dd></div>
        <div className="strong"><dt>Total de la venta</dt><dd>{money(reservationTotal(r) + dc)}</dd></div>
        <div><dt>Ya abonado</dt><dd>{money(reservationPaid(r))}</dd></div>
        <div className="strong"><dt>Por cobrar hoy</dt><dd>{money(Math.max(0, reservationTotal(r) + dc - reservationPaid(r)))}</dd></div>
      </dl>
      {!stockOk && <div className="notice error">El stock físico no alcanza para esta reserva. Ajusta el inventario antes de entregarla.</div>}
      <ErrorNote message={error} />
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Registrando…' : 'Entregar y registrar venta'}
        </button>
        <button className="btn secondary" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
