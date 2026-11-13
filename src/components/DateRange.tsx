import { addDays, todayISO } from '../lib/format';

export interface Range {
  from: string; // '' = sin límite
  to: string;
}

export const ALL: Range = { from: '', to: '' };

export const inRange = (ymd: string, r: Range): boolean => (!r.from || ymd >= r.from) && (!r.to || ymd <= r.to);

export function DateRange({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const today = todayISO();
  const presets: { label: string; range: Range }[] = [
    { label: 'Todo', range: ALL },
    { label: 'Este mes', range: { from: `${today.slice(0, 8)}01`, to: '' } },
    { label: 'Últimos 30 días', range: { from: addDays(today, -29), to: '' } },
  ];
  const same = (a: Range, b: Range) => a.from === b.from && a.to === b.to;

  return (
    <div className="range">
      <div className="chips">
        {presets.map((p) => (
          <button key={p.label} type="button" className={`chip${same(value, p.range) ? ' on' : ''}`} onClick={() => onChange(p.range)}>
            {p.label}
          </button>
        ))}
      </div>
      <label>
        Desde
        <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </label>
      <label>
        Hasta
        <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </label>
    </div>
  );
}
