import { useState, type FormEvent } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { adjustStock, createProduct, updateProduct } from '../lib/api';
import { money, num, percent } from '../lib/format';
import { sum } from '../lib/finance';
import type { Product, Size } from '../lib/types';
import { Empty, ErrorNote, Field, PageHead, Stat } from '../components/ui';

type Mode = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; id: string } | { kind: 'stock'; id: string };

export default function Inventory() {
  const { products, reserved, reservationsReady, refresh } = useData();
  const [mode, setMode] = useState<Mode>({ kind: 'none' });
  const close = () => setMode({ kind: 'none' });
  const target = mode.kind === 'edit' || mode.kind === 'stock' ? products.find((p) => p.id === mode.id) : undefined;

  return (
    <>
      <PageHead
        eyebrow="Inventario"
        title="Productos y existencias"
        sub="Los precios se editan aparte de las existencias para evitar errores."
        action={
          <button className="btn" onClick={() => setMode({ kind: 'new' })}>
            + Nuevo producto
          </button>
        }
      />

      <div className="stats three">
        <Stat label="Productos" value={products.length} />
        <Stat label="Unidades en stock" value={sum(products.map((p) => p.stock))} note={reservationsReady ? `${sum([...reserved.values()])} reservadas · ${sum(products.map((p) => p.stock)) - sum([...reserved.values()])} disponibles` : undefined} />
        <Stat label="Valor del inventario a costo" value={money(sum(products.map((p) => p.stock * p.unit_cost)))} note="Costo unitario × stock" />
      </div>

      {mode.kind === 'new' && <ProductForm onDone={async () => { await refresh(); close(); }} onCancel={close} />}
      {mode.kind === 'edit' && target && <ProductForm product={target} onDone={async () => { await refresh(); close(); }} onCancel={close} />}
      {mode.kind === 'stock' && target && <StockForm product={target} onDone={async () => { await refresh(); close(); }} onCancel={close} />}

      <section className="panel">
        {products.length === 0 ? (
          <Empty>No hay productos registrados. Crea el primero con “Nuevo producto”.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sabor</th>
                  <th>Tamaño</th>
                  <th className="num">Costo unitario</th>
                  <th className="num">Precio venta</th>
                  <th className="num">Margen / u.</th>
                  <th className="num">Stock</th>
                  {reservationsReady && <th className="num">Reservados</th>}
                  {reservationsReady && <th className="num">Disponibles</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const margin = p.sale_price - p.unit_cost;
                  return (
                    <tr key={p.id}>
                      <td>
                        <b>{p.name}</b>
                      </td>
                      <td>{p.size}</td>
                      <td className="num">{money(p.unit_cost, true)}</td>
                      <td className="num">{money(p.sale_price)}</td>
                      <td className="num">
                        {money(margin)} <span className="muted">({percent(p.sale_price > 0 ? (margin / p.sale_price) * 100 : 0)})</span>
                      </td>
                      <td className="num">
                        <span className={p.stock === 0 ? 'pill bad' : 'pill'}>{p.stock}</span>
                      </td>
                      {reservationsReady && <td className="num">{(reserved.get(p.id) ?? 0) > 0 ? <span className="pill">{reserved.get(p.id)}</span> : '—'}</td>}
                      {reservationsReady && (
                        <td className="num">
                          <span className={p.stock - (reserved.get(p.id) ?? 0) <= 0 ? 'pill bad' : 'pill ok'}>{p.stock - (reserved.get(p.id) ?? 0)}</span>
                        </td>
                      )}
                      <td className="row-actions">
                        <button className="btn secondary small" onClick={() => setMode({ kind: 'edit', id: p.id })}>
                          Editar precios
                        </button>
                        <button className="btn secondary small" onClick={() => setMode({ kind: 'stock', id: p.id })}>
                          Ajustar stock
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
    </>
  );
}

function ProductForm({ product, onDone, onCancel }: { product?: Product; onDone: () => Promise<void>; onCancel: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(product?.name ?? '');
  const [size, setSize] = useState<Size>(product?.size ?? 'Pequeño');
  const [cost, setCost] = useState(product ? String(product.unit_cost) : '');
  const [price, setPrice] = useState(product ? String(product.sale_price) : '');
  const [stock, setStock] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const c = num(cost);
    const p = num(price);
    const st = num(stock);
    if (!name.trim()) return setError('Escribe el nombre o sabor.');
    if (!Number.isFinite(c) || c < 0) return setError('El costo unitario debe ser un número igual o mayor que 0.');
    if (!Number.isFinite(p) || p < 0) return setError('El precio de venta debe ser un número igual o mayor que 0.');
    if (!product && (!Number.isInteger(st) || st < 0)) return setError('El stock inicial debe ser un entero igual o mayor que 0.');
    setBusy(true);
    try {
      if (product) await updateProduct(product.id, { name: name.trim(), size, unitCost: c, salePrice: p });
      else await createProduct({ name: name.trim(), size, unitCost: c, salePrice: p, stock: st });
      toast(product ? 'Producto actualizado.' : 'Producto creado.');
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3>{product ? `Editar precios · ${product.name}` : 'Nuevo producto'}</h3>
      <form onSubmit={onSubmit}>
        <div className="formgrid">
          <Field label="Nombre / sabor">
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Tamaño">
            <select value={size} onChange={(e) => setSize(e.target.value as Size)}>
              <option>Pequeño</option>
              <option>Grande</option>
            </select>
          </Field>
          <Field label="Costo unitario (COP)">
            <input type="number" inputMode="decimal" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
          </Field>
          <Field label="Precio de venta (COP)">
            <input type="number" inputMode="decimal" min="0" step="100" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </Field>
          {!product && (
            <Field label="Stock inicial">
              <input type="number" inputMode="numeric" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} required />
            </Field>
          )}
        </div>
        {product && <div className="notice">Cambiar el costo o el precio solo afecta ventas futuras. Las ventas ya registradas conservan el costo y el precio de ese momento. Las existencias se ajustan con “Ajustar stock”.</div>}
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

function StockForm({ product, onDone, onCancel }: { product: Product; onDone: () => Promise<void>; onCancel: () => void }) {
  const toast = useToast();
  const [delta, setDelta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = num(delta);
  const valid = Number.isInteger(d) && d !== 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!valid) return setError('Escribe un número entero distinto de 0 (positivo suma, negativo resta).');
    if (product.stock + d < 0) return setError(`Solo hay ${product.stock} unidades; no puedes restar más.`);
    if (!window.confirm(`${product.name}: el stock pasará de ${product.stock} a ${product.stock + d}. ¿Confirmas el ajuste?`)) return;
    setBusy(true);
    try {
      await adjustStock(product.id, product.stock, d);
      toast('Stock ajustado.');
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo ajustar el stock.');
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3>Ajustar stock · {product.name}</h3>
      <p className="sub">Stock actual: <b>{product.stock}</b>. Las ventas descuentan el stock solas; usa esto solo para reposiciones, daños o conteos.</p>
      <form onSubmit={onSubmit}>
        <div className="formgrid">
          <Field label="Unidades a sumar (+) o restar (−)">
            <input type="number" inputMode="numeric" step="1" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="Ej. 10 o -2" required />
          </Field>
          <Field label="Stock resultante">
            <input value={valid ? String(product.stock + d) : '—'} readOnly />
          </Field>
        </div>
        <ErrorNote message={error} />
        <div className="actions">
          <button className="btn" type="submit" disabled={busy || !valid}>
            {busy ? 'Aplicando…' : 'Aplicar ajuste'}
          </button>
          <button className="btn secondary" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
