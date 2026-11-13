const TZ = 'America/Bogota';

function group(n: number, decimals: number): string {
  const [int, dec] = Math.abs(n).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec ? `${grouped},${dec}` : grouped;
}

/** Formato COP local: $316.000 (o $3.172,22 con decimales). */
export function money(n: number, decimals = false): string {
  const v = Number.isFinite(n) ? n : 0;
  const shown = decimals ? v : Math.round(v);
  const sign = shown < 0 ? '-' : '';
  return `${sign}$${group(shown, decimals ? 2 : 0)}`;
}

export function percent(n: number): string {
  return `${group(Number.isFinite(n) ? n : 0, 1)}%`;
}

/** Convierte texto de un input a número; vacío => NaN (para poder validarlo). */
export const num = (s: string): number => (s.trim() === '' ? NaN : Number(s));

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const todayISO = (): string => ymdFmt.format(new Date());
/** Fecha (YYYY-MM-DD) en hora de Colombia de un timestamp. */
export const dayOf = (iso: string): string => ymdFmt.format(new Date(iso));

export function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/** Fecha elegida => timestamp al mediodía de Colombia (UTC-5, sin horario de verano). */
export const toTimestamp = (ymd: string): string => new Date(`${ymd}T12:00:00-05:00`).toISOString();

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
