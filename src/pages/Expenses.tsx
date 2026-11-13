import { useState, type FormEvent } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { createExpense } from '../lib/api';
import { fmtDay, money, num, todayISO } from '../lib/format';
import { sum } from '../lib/finance';
import { EXPENSE_CATEGORIES } from '../lib/types';
import { ALL, DateRange, inRange, type Range } from '../components/DateRange';
import { Empty, ErrorNote, Field, PageHead, Stat } from '../components/ui';

export default function Expenses() {
  const { expenses, refresh } = useData();
  const toast = useToast();
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<Range>(ALL);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const a = num(amount);
    if (!description.trim()) return setError('Escribe una descripción del gasto.');
    if (!Number.isFinite(a) || a <= 0) return setError('El valor debe ser mayor que 0.');
    if (!date) return setError('Elige la fecha del gasto.');
    setBusy(true);
    try {
      await createExpense({ description: description.trim(), category, amount: a, spentAt: date, notes: notes.trim() });
      toast('Gasto guardado.');
      setDescription('');
      setAmount('');
      setNotes('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el gasto.');
    } finally {
      setBusy(false);
    }
  }

  const shown = expenses.filter((x) => inRange(x.spent_at, range));
  const byCategory = [...shown.reduce((m, x) => m.set(x.category, (m.get(x.category) ?? 0) + x.amount), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHead eyebrow="Gastos" title="Registrar gasto" sub="Publicidad, transporte, empaques y cualquier gasto adicional." />

      <section className="panel">
        <form onSubmit={onSubmit}>
          <div className="formgrid">
            <Field label="Categoría">
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Descripción">
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Publicidad en redes" required />
            </Field>
            <Field label="Valor (COP)">
              <input type="number" inputMode="decimal" min="1" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
            <Field label="Fecha">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Notas (opcional)" full>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <div className="notice">
            No registres aquí la compra inicial de alfajores ni su envío ($316.000): ya están dentro del costo unitario de los productos y se contarían dos veces.
          </div>
          <ErrorNote message={error} />
          <div className="actions">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar gasto'}
            </button>
          </div>
        </form>
      </section>

      <div className="section-head">
        <h3>Historial de gastos</h3>
      </div>
      <DateRange value={range} onChange={setRange} />
      <div className="stats three">
        <Stat label="Gastos en el período" value={money(sum(shown.map((x) => x.amount)))} note={`${shown.length} registros`} />
        {byCategory.slice(0, 2).map(([cat, total]) => (
          <Stat key={cat} label={cat} value={money(total)} note="Mayor gasto por categoría" />
        ))}
      </div>
      <section className="panel">
        {shown.length === 0 ? (
          <Empty>No hay gastos en este período.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => (
                  <tr key={x.id}>
                    <td>{fmtDay(x.spent_at)}</td>
                    <td>
                      {x.description}
                      {x.notes && <div className="muted">{x.notes}</div>}
                    </td>
                    <td>{x.category}</td>
                    <td className="num">{money(x.amount)}</td>
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
