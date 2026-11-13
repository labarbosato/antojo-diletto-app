import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { byMonth, summarize, topProducts } from '../lib/finance';
import { dayOf, money, monthLabel } from '../lib/format';
import { ALL, DateRange, inRange, type Range } from '../components/DateRange';
import { Empty, PageHead, Stat } from '../components/ui';

export default function Reports() {
  const { products, sales, expenses } = useData();
  const [range, setRange] = useState<Range>(ALL);

  const fSales = useMemo(() => sales.filter((s) => inRange(dayOf(s.sold_at), range)), [sales, range]);
  const fExpenses = useMemo(() => expenses.filter((e) => inRange(e.spent_at, range)), [expenses, range]);
  const s = useMemo(() => summarize(fSales, fExpenses), [fSales, fExpenses]);
  const top = useMemo(() => topProducts(fSales), [fSales]);
  const months = useMemo(() => byMonth(fSales, fExpenses), [fSales, fExpenses]);
  const maxUnits = Math.max(1, ...top.map((t) => t.units));
  const noData = fSales.length === 0 && fExpenses.length === 0;

  return (
    <>
      <PageHead eyebrow="Reportes" title="Reportes del negocio" sub="Calculados con tus ventas y gastos guardados en Supabase." />
      <DateRange value={range} onChange={setRange} />

      {noData && <div className="notice">Aún no hay registros en este período, por eso todo aparece en cero.</div>}

      <div className="stats">
        <Stat label="Ventas (alfajores)" value={money(s.revenue)} note={`${s.units} unidades`} />
        <Stat label="Costo de productos" value={money(s.cogs)} />
        <Stat label="Ganancia bruta" value={money(s.gross)} note="Ventas − costo de productos" />
        <Stat label="Gastos" value={money(s.expenses)} />
        <Stat label="Domicilios cobrados" value={money(s.deliveryIn)} />
        <Stat label="Domicilios pagados" value={money(s.deliveryOut)} />
        <Stat label="Resultado operativo" value={money(s.operating)} tone={s.operating < 0 ? 'bad' : 'good'} note="Bruta + domicilios − gastos" />
        <Stat label="Flujo de caja neto" value={money(s.netCash)} tone={s.netCash < 0 ? 'bad' : undefined} note="Solo ventas ya cobradas" />
      </div>

      <div className="grid2">
        <section className="panel">
          <h3>Productos más vendidos</h3>
          {top.length === 0 ? (
            <Empty>Sin ventas en este período.</Empty>
          ) : (
            <ul className="bars">
              {top.map((t) => (
                <li key={t.id}>
                  <div className="bar-head">
                    <span>
                      <b>{t.name}</b> <span className="muted">{t.size}</span>
                    </span>
                    <span>{t.units} u. · {money(t.revenue)}</span>
                  </div>
                  <div className="bar">
                    <div style={{ width: `${(t.units / maxUnits) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h3>Inventario actual</h3>
          {products.length === 0 ? (
            <Empty>No hay productos registrados.</Empty>
          ) : (
            <ul className="plain">
              {products.map((p) => (
                <li key={p.id}>
                  <span>
                    <b>{p.name}</b> <span className="muted">· {p.size}</span>
                  </span>
                  <span className={p.stock === 0 ? 'pill bad' : 'pill'}>{p.stock} u.</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <h3>Resultado por mes</h3>
        {months.length === 0 ? (
          <Empty>Sin movimientos en este período.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th className="num">Ventas</th>
                  <th className="num">Ganancia bruta</th>
                  <th className="num">Dom. cobrado</th>
                  <th className="num">Dom. pagado</th>
                  <th className="num">Gastos</th>
                  <th className="num">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month)}</td>
                    <td className="num">{money(m.revenue)}</td>
                    <td className="num">{money(m.gross)}</td>
                    <td className="num">{money(m.deliveryIn)}</td>
                    <td className="num">{money(m.deliveryOut)}</td>
                    <td className="num">{money(m.expenses)}</td>
                    <td className={`num${m.operating < 0 ? ' neg' : ''}`}>{money(m.operating)}</td>
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
