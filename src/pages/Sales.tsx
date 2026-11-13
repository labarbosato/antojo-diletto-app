import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { createCustomer, markOrderPaid, registerOrder, registerSale } from '../lib/api';
import { dayOf, fmtDay, money, num, toTimestamp, todayISO } from '../lib/format';
import { PAYMENT_METHODS } from '../lib/types';
import { groupOrders, sum } from '../lib/finance';
import { ALL, DateRange, inRange, type Range } from '../components/DateRange';
import { Empty, ErrorNote, Field, PageHead, Stat } from '../components/ui';

interface CartLine {
  productId: string;
  quantity: number;
  price: number;
}

const NEW_CUSTOMER = '__new';

export default function Sales() {
  const { products, sales, customers, reservationsReady, reserved, refresh } = useData();
  const toast = useToast();

  /** Unidades que se pueden vender ahora: stock menos lo reservado para otras personas. */
  const availableOf = (id: string): number => {
    const p = products.find((x) => x.id === id);
    return p ? Math.max(0, p.stock - (reserved.get(id) ?? 0)) : 0;
  };
  const sellable = products.filter((p) => availableOf(p.id) > 0);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [date, setDate] = useState(todayISO());
  const [delCharged, setDelCharged] = useState('0');
  const [delPaid, setDelPaid] = useState('0');
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [isPaid, setIsPaid] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<Range>(ALL);

  const selected = products.find((p) => p.id === productId);
  const sellableKey = sellable.map((p) => p.id).join(',');
  const inCart = (id: string) => sum(cart.filter((l) => l.productId === id).map((l) => l.quantity));
  const leftFor = (id: string) => availableOf(id) - inCart(id);

  // Mantiene un producto válido seleccionado (p. ej. si el elegido se agotó).
  useEffect(() => {
    if (!sellable.some((p) => p.id === productId)) setProductId(sellable[0]?.id ?? '');
  }, [sellableKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al cambiar de producto, propone su precio de venta (editable).
  useEffect(() => {
    const p = products.find((x) => x.id === productId);
    if (p) setPrice(String(p.sale_price));
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  function addLine() {
    setLineError(null);
    if (!selected) return setLineError('Selecciona un producto con existencias.');
    const q = num(qty);
    const pr = num(price);
    if (!Number.isInteger(q) || q < 1) return setLineError('La cantidad debe ser un número entero de 1 en adelante.');
    if (!Number.isFinite(pr) || pr < 0) return setLineError('El precio debe ser un número igual o mayor que 0.');
    if (q > leftFor(selected.id)) {
      const res = reserved.get(selected.id) ?? 0;
      return setLineError(`Solo puedes agregar ${Math.max(0, leftFor(selected.id))} más de ${selected.name}${res > 0 ? ` (hay ${res} reservadas para clientes)` : ''}.`);
    }
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === selected.id && l.price === pr);
      if (i >= 0) return c.map((l, k) => (k === i ? { ...l, quantity: l.quantity + q } : l));
      return [...c, { productId: selected.id, quantity: q, price: pr }];
    });
    setQty('1');
  }

  const calc = useMemo(() => {
    const dc = Number.isFinite(num(delCharged)) ? num(delCharged) : 0;
    const dp = Number.isFinite(num(delPaid)) ? num(delPaid) : 0;
    const subtotal = sum(cart.map((l) => l.price * l.quantity));
    const cost = sum(cart.map((l) => (products.find((p) => p.id === l.productId)?.unit_cost ?? 0) * l.quantity));
    return { units: sum(cart.map((l) => l.quantity)), subtotal, delCharged: dc, total: subtotal + dc, delPaid: dp, delDiff: dc - dp, cost, gross: subtotal - cost };
  }, [cart, delCharged, delPaid, products]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (cart.length === 0) return setError('Agrega al menos un producto al pedido con “Agregar al pedido”.');
    const dc = num(delCharged);
    const dp = num(delPaid);
    if (!Number.isFinite(dc) || dc < 0) return setError('El domicilio cobrado debe ser un número igual o mayor que 0.');
    if (!Number.isFinite(dp) || dp < 0) return setError('El domicilio pagado debe ser un número igual o mayor que 0.');
    if (!date) return setError('Elige la fecha de la venta.');
    if (customerId === NEW_CUSTOMER && !newName.trim()) return setError('Escribe el nombre del cliente nuevo.');
    for (const l of cart) {
      if (l.quantity > availableOf(l.productId)) return setError('Alguna cantidad ya no está disponible. Revisa el pedido.');
    }

    setBusy(true);
    try {
      if (!reservationsReady) {
        if (cart.length > 1 || customerId) throw new Error('Para pedidos con varios productos o con cliente, ejecuta primero supabase/clientes_reservas.sql en Supabase.');
        await registerSale({
          productId: cart[0].productId,
          quantity: cart[0].quantity,
          salePrice: cart[0].price,
          deliveryCharged: dc,
          deliveryPaid: dp,
          paymentMethod: method,
          isPaid,
          notes: notes.trim(),
          soldAt: toTimestamp(date),
        });
      } else {
        let cid: string | null = customerId || null;
        if (customerId === NEW_CUSTOMER) cid = await createCustomer({ name: newName.trim(), phone: newPhone.trim(), notes: '' });
        await registerOrder({
          customerId: cid,
          lines: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, salePrice: l.price })),
          deliveryCharged: dc,
          deliveryPaid: dp,
          paymentMethod: method,
          isPaid,
          notes: notes.trim(),
          soldAt: toTimestamp(date),
        });
      }
      toast(cart.length > 1 ? 'Pedido guardado y stock descontado.' : 'Venta guardada y stock descontado.');
      setCart([]);
      setQty('1');
      setDelCharged('0');
      setDelPaid('0');
      setNotes('');
      setIsPaid(true);
      setCustomerId('');
      setNewName('');
      setNewPhone('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la venta.');
      await refresh(); // por si el stock cambió desde otro dispositivo
    } finally {
      setBusy(false);
    }
  }

  async function payNow(order: ReturnType<typeof groupOrders>[number]) {
    try {
      await markOrderPaid(order);
      toast('Marcado como pagado.');
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo actualizar.');
    }
  }

  const customerName = (id: string | null) => (id ? customers.find((c) => c.id === id)?.name ?? 'Cliente' : '');
  const orders = useMemo(() => groupOrders(sales), [sales]);
  const shown = orders.filter((o) => inRange(dayOf(o.soldAt), range));
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? 'Producto';

  return (
    <>
      <PageHead
        eyebrow="Ventas"
        title="Registrar venta"
        sub="Agrega todos los productos del pedido y guárdalo una sola vez. El domicilio se registra aparte del precio de los alfajores."
      />

      {!reservationsReady && (
        <div className="notice">Para asignar ventas a clientes y registrar pedidos con varios productos, ejecuta el archivo <code>supabase/clientes_reservas.sql</code> en Supabase (SQL Editor).</div>
      )}

      <section className="panel">
        {products.length === 0 ? (
          <Empty>Primero crea al menos un producto en Inventario.</Empty>
        ) : sellable.length === 0 && cart.length === 0 ? (
          <Empty>No hay unidades disponibles (agotadas o reservadas). Ajusta el stock en Inventario o revisa las reservas.</Empty>
        ) : (
          <form onSubmit={onSubmit}>
            {reservationsReady && (
              <div className="formgrid">
                <Field label="Cliente (opcional)" full={customerId !== NEW_CUSTOMER}>
                  <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">Sin cliente</option>
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
            )}

            <div className="addline">
              <Field label="Producto y sabor">
                <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                  {sellable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.size} · disponibles {leftFor(p.id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad">
                <input type="number" inputMode="numeric" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
              </Field>
              <Field label="Precio (c/u)">
                <input type="number" inputMode="decimal" min="0" step="100" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
              <button className="btn secondary" type="button" onClick={addLine} disabled={sellable.length === 0}>
                + Agregar al pedido
              </button>
            </div>
            <ErrorNote message={lineError} />

            {cart.length > 0 && (
              <ul className="linelist" aria-label="Productos del pedido">
                {cart.map((l, i) => (
                  <li key={`${l.productId}-${l.price}-${i}`}>
                    <span className="grow">
                      <b>{l.quantity} × {nameOf(l.productId)}</b> <span className="muted">a {money(l.price)} c/u</span>
                    </span>
                    <b>{money(l.quantity * l.price)}</b>
                    <button className="btn secondary small" type="button" onClick={() => setCart((c) => c.filter((_, k) => k !== i))}>
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="formgrid">
              <Field label="Domicilio cobrado al cliente">
                <input type="number" inputMode="decimal" min="0" step="100" value={delCharged} onChange={(e) => setDelCharged(e.target.value)} required />
              </Field>
              <Field label="Domicilio pagado al domiciliario">
                <input type="number" inputMode="decimal" min="0" step="100" value={delPaid} onChange={(e) => setDelPaid(e.target.value)} required />
              </Field>
              <Field label="Fecha de venta">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
              <Field label="Método de pago">
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Estado del pago">
                <select value={String(isPaid)} onChange={(e) => setIsPaid(e.target.value === 'true')}>
                  <option value="true">Pagado</option>
                  <option value="false">Pendiente</option>
                </select>
              </Field>
              <Field label="Notas (opcional)" full>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Promoción, observaciones…" />
              </Field>
            </div>

            <dl className="calc">
              <div><dt>Unidades del pedido</dt><dd>{calc.units}</dd></div>
              <div><dt>Subtotal alfajores</dt><dd>{money(calc.subtotal)}</dd></div>
              <div><dt>Domicilio cobrado</dt><dd>{money(calc.delCharged)}</dd></div>
              <div className="strong"><dt>Total del cliente</dt><dd>{money(calc.total)}</dd></div>
              <div><dt>Domicilio pagado</dt><dd>{money(calc.delPaid)}</dd></div>
              <div><dt>Diferencia domicilio</dt><dd>{money(calc.delDiff)}</dd></div>
              <div><dt>Costo de productos</dt><dd>{money(calc.cost)}</dd></div>
              <div className="strong"><dt>Ganancia bruta del pedido</dt><dd>{money(calc.gross)}</dd></div>
            </dl>

            <ErrorNote message={error} />
            <div className="actions">
              <button className="btn" type="submit" disabled={busy || cart.length === 0}>
                {busy ? 'Guardando…' : cart.length > 1 ? 'Guardar pedido' : 'Guardar venta'}
              </button>
            </div>
          </form>
        )}
      </section>

      <div className="section-head">
        <h3>Historial de ventas</h3>
      </div>
      <DateRange value={range} onChange={setRange} />
      <div className="stats three">
        <Stat label="Pedidos en el período" value={shown.length} note={`${sum(shown.map((o) => o.units))} unidades`} />
        <Stat label="Alfajores vendidos" value={money(sum(shown.map((o) => o.productTotal)))} note="Sin domicilios" />
        <Stat label="Ganancia bruta" value={money(sum(shown.map((o) => o.gross)))} />
      </div>
      <section className="panel">
        {shown.length === 0 ? (
          <Empty>No hay ventas en este período.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Productos</th>
                  <th className="num">Cant.</th>
                  <th className="num">Alfajores</th>
                  <th className="num">Dom. cobrado</th>
                  <th className="num">Dom. pagado</th>
                  <th>Pago</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.key}>
                    <td>{fmtDay(dayOf(o.soldAt))}</td>
                    <td>{customerName(o.customerId) || <span className="muted">—</span>}</td>
                    <td>
                      {o.lines.map((l) => (
                        <div key={l.id}>
                          {l.quantity} × {l.products?.name ?? 'Producto'}
                        </div>
                      ))}
                      {o.notes && <div className="muted">{o.notes}</div>}
                    </td>
                    <td className="num">{o.units}</td>
                    <td className="num">{money(o.productTotal)}</td>
                    <td className="num">{money(o.deliveryCharged)}</td>
                    <td className="num">{money(o.deliveryPaid)}</td>
                    <td>{o.paymentMethod}</td>
                    <td>
                      {o.isPaid ? (
                        <span className="pill ok">Pagado</span>
                      ) : (
                        <button className="btn secondary small" onClick={() => payNow(o)}>
                          Pendiente · marcar pagada
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
