import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { dayOf, fmtDay, money } from '../lib/format';
import { groupOrders, itemsText, sum } from '../lib/finance';
import { ALL, DateRange, inRange, type Range } from '../components/DateRange';
import { Empty, PageHead, Stat } from '../components/ui';

export default function Deliveries() {
  const { sales } = useData();
  const [range, setRange] = useState<Range>(ALL);

  const orders = useMemo(() => groupOrders(sales), [sales]);
  const rows = orders.filter((o) => (o.deliveryCharged > 0 || o.deliveryPaid > 0) && inRange(dayOf(o.soldAt), range));
  const charged = sum(rows.map((o) => o.deliveryCharged));
  const paid = sum(rows.map((o) => o.deliveryPaid));
  const diff = charged - paid;

  return (
    <>
      <PageHead eyebrow="Domicilios" title="Control de domicilios" sub="Lo que cobras al cliente frente a lo que pagas al domiciliario, separado del precio de los alfajores." />
      <DateRange value={range} onChange={setRange} />

      <div className="stats three">
        <Stat label="Domicilios cobrados" value={money(charged)} note="Pagado por el cliente" />
        <Stat label="Domicilios pagados" value={money(paid)} note="Pagado al domiciliario" />
        <Stat label="Diferencia" value={money(diff)} tone={diff < 0 ? 'bad' : 'good'} note={diff < 0 ? 'Estás asumiendo parte del domicilio' : 'Cobrado − pagado'} />
      </div>

      <section className="panel">
        {rows.length === 0 ? (
          <Empty>No hay domicilios registrados en este período.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Venta</th>
                  <th className="num">Cobrado</th>
                  <th className="num">Pagado</th>
                  <th className="num">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const d = o.deliveryCharged - o.deliveryPaid;
                  return (
                    <tr key={o.key}>
                      <td>{fmtDay(dayOf(o.soldAt))}</td>
                      <td>{itemsText(o.lines)}</td>
                      <td className="num">{money(o.deliveryCharged)}</td>
                      <td className="num">{money(o.deliveryPaid)}</td>
                      <td className={`num${d < 0 ? ' neg' : ''}`}>{money(d)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="num">{money(charged)}</td>
                  <td className="num">{money(paid)}</td>
                  <td className={`num${diff < 0 ? ' neg' : ''}`}>{money(diff)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
