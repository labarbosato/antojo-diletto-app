import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { Empty, PageHead, Stat } from '../components/ui';
import type { PageId } from '../components/Layout';
import { INITIAL_INVESTMENT, LOW_STOCK, sum, summarize } from '../lib/finance';
import { dayOf, fmtDay, money } from '../lib/format';

export default function Summary({ go }: { go: (p: PageId) => void }) {
  const { products, sales, expenses } = useData();
  const s = useMemo(() => summarize(sales, expenses), [sales, expenses]);
  const units = sum(products.map((p) => p.stock));
  const low = products.filter((p) => p.stock <= LOW_STOCK);

  return (
    <>
      <PageHead
        eyebrow="Resumen"
        title="Hola, Antojo Diletto Buga ✦"
        sub="Un vistazo claro a las cuentas de tu emprendimiento."
        action={
          <button className="btn" onClick={() => go('sales')}>
            + Nueva venta
          </button>
        }
      />

      <div className="stats">
        <Stat label="Ventas acumuladas" value={money(s.revenue)} note={`${s.units} unidades · sin domicilios`} />
        <Stat label="Gastos acumulados" value={money(s.expenses)} note="Gastos registrados" />
        <Stat label="Ganancia bruta estimada" value={money(s.gross)} note="Ventas − costo de productos" />
        <Stat label="Unidades disponibles" value={units} note={`${products.length} productos registrados`} />
        <Stat label="Domicilios cobrados" value={money(s.deliveryIn)} note="Al cliente" />
        <Stat label="Domicilios pagados" value={money(s.deliveryOut)} note="Al domiciliario" />
        <Stat label="Diferencia de domicilios" value={money(s.deliveryDiff)} tone={s.deliveryDiff < 0 ? 'bad' : undefined} note="Cobrado − pagado" />
        <Stat label="Por cobrar" value={money(s.revenuePending)} note="Ventas marcadas como pendientes" />
      </div>

      <div className="stats three">
        <Stat label="Resultado operativo estimado" value={money(s.operating)} tone={s.operating < 0 ? 'bad' : 'good'} note="Ganancia bruta + domicilios − gastos" />
        <Stat
          label="Flujo de caja neto"
          value={money(s.netCash)}
          tone={s.netCash < 0 ? 'bad' : undefined}
          note={`Inversión inicial ${money(INITIAL_INVESTMENT)} · por recuperar ${money(Math.max(0, INITIAL_INVESTMENT - s.netCash))}`}
        />
        <Stat label="Costo de productos vendidos" value={money(s.cogs)} note="Costo unitario × unidades vendidas" />
      </div>

      <details className="panel explain">
        <summary>¿Cómo se calculan estas cifras?</summary>
        <ul>
          <li>
            <b>Ventas acumuladas:</b> valor de los alfajores vendidos. El domicilio nunca se mezcla aquí.
          </li>
          <li>
            <b>Ganancia bruta:</b> ventas menos el costo unitario de lo vendido. No es utilidad neta: aún no descuenta gastos.
          </li>
          <li>
            <b>Resultado operativo:</b> ganancia bruta + (domicilio cobrado − pagado) − gastos. Es una estimación antes de impuestos.
          </li>
          <li>
            <b>Flujo de caja:</b> lo realmente cobrado (ventas pagadas y sus domicilios) menos domicilios pagados y gastos.
          </li>
          <li>
            <b>Inversión inicial:</b> los {money(INITIAL_INVESTMENT)} no se restan como gasto porque ya están dentro del costo unitario de cada producto (incluye el envío del proveedor). Así no se cuentan dos veces.
          </li>
        </ul>
      </details>

      <div className="grid2">
        <section className="panel">
          <div className="section-head">
            <h3>Stock bajo</h3>
            <button className="btn secondary small" onClick={() => go('inventory')}>
              Ver inventario
            </button>
          </div>
          {low.length === 0 ? (
            <Empty>{products.length === 0 ? 'Aún no hay productos registrados.' : `Ningún producto con ${LOW_STOCK} unidades o menos.`}</Empty>
          ) : (
            <ul className="plain">
              {low.map((p) => (
                <li key={p.id}>
                  <span>
                    <b>{p.name}</b> <span className="muted">· {p.size}</span>
                  </span>
                  <span className={p.stock === 0 ? 'pill bad' : 'pill'}>{p.stock === 0 ? 'Agotado' : `${p.stock} u.`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="section-head">
            <h3>Últimos gastos</h3>
            <button className="btn secondary small" onClick={() => go('expenses')}>
              Ver gastos
            </button>
          </div>
          {expenses.length === 0 ? (
            <Empty>Todavía no hay gastos registrados.</Empty>
          ) : (
            <ul className="plain">
              {expenses.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <span>
                    <b>{e.description}</b>
                    <span className="muted"> · {e.category} · {fmtDay(e.spent_at)}</span>
                  </span>
                  <span>{money(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="section-head">
          <h3>Ventas recientes</h3>
          <button className="btn secondary small" onClick={() => go('sales')}>
            Ver ventas
          </button>
        </div>
        {sales.length === 0 ? (
          <Empty>Aún no hay ventas registradas.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th className="num">Cant.</th>
                  <th className="num">Alfajores</th>
                  <th className="num">Domicilio cobrado</th>
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 5).map((x) => (
                  <tr key={x.id}>
                    <td>{fmtDay(dayOf(x.sold_at))}</td>
                    <td>{x.products?.name ?? 'Producto'}</td>
                    <td className="num">{x.quantity}</td>
                    <td className="num">{money(x.product_total)}</td>
                    <td className="num">{money(x.delivery_charged)}</td>
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
