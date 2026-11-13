import { dayOf } from './format';
import type { Expense, Reservation, Sale } from './types';

/** Referencia informativa. NO se resta como gasto: ya está dentro del costo unitario de los productos. */
export const INITIAL_INVESTMENT = 316000;
export const LOW_STOCK = 3;

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const saleCost = (s: Sale): number => s.unit_cost * s.quantity;
export const saleGross = (s: Sale): number => s.product_total - saleCost(s);

export interface Summary {
  units: number;
  revenue: number; // alfajores vendidos, sin domicilio
  revenuePending: number; // parte de revenue aún no cobrada
  cogs: number; // costo de los productos vendidos
  gross: number; // ganancia bruta
  deliveryIn: number;
  deliveryOut: number;
  deliveryDiff: number;
  expenses: number;
  operating: number; // gross + deliveryDiff - expenses
  cashIn: number;
  cashOut: number;
  netCash: number;
}

export function summarize(sales: Sale[], expenses: Expense[]): Summary {
  const revenue = sum(sales.map((s) => s.product_total));
  const cogs = sum(sales.map(saleCost));
  const deliveryIn = sum(sales.map((s) => s.delivery_charged));
  const deliveryOut = sum(sales.map((s) => s.delivery_paid));
  const exp = sum(expenses.map((e) => e.amount));
  const paid = sales.filter((s) => s.is_paid);
  const cashIn = sum(paid.map((s) => s.product_total + s.delivery_charged));
  const cashOut = deliveryOut + exp;
  return {
    units: sum(sales.map((s) => s.quantity)),
    revenue,
    revenuePending: sum(sales.filter((s) => !s.is_paid).map((s) => s.product_total)),
    cogs,
    gross: revenue - cogs,
    deliveryIn,
    deliveryOut,
    deliveryDiff: deliveryIn - deliveryOut,
    expenses: exp,
    operating: revenue - cogs + (deliveryIn - deliveryOut) - exp,
    cashIn,
    cashOut,
    netCash: cashIn - cashOut,
  };
}

export interface TopProduct {
  id: string;
  name: string;
  size: string;
  units: number;
  revenue: number;
  gross: number;
}

export function topProducts(sales: Sale[]): TopProduct[] {
  const map = new Map<string, TopProduct>();
  for (const s of sales) {
    const row = map.get(s.product_id) ?? {
      id: s.product_id,
      name: s.products?.name ?? 'Producto eliminado',
      size: s.products?.size ?? '',
      units: 0,
      revenue: 0,
      gross: 0,
    };
    row.units += s.quantity;
    row.revenue += s.product_total;
    row.gross += saleGross(s);
    map.set(s.product_id, row);
  }
  return [...map.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue);
}

export interface MonthRow {
  month: string; // YYYY-MM
  revenue: number;
  gross: number;
  deliveryIn: number;
  deliveryOut: number;
  expenses: number;
  operating: number;
}

export function byMonth(sales: Sale[], expenses: Expense[]): MonthRow[] {
  const map = new Map<string, MonthRow>();
  const get = (month: string): MonthRow => {
    const row = map.get(month) ?? { month, revenue: 0, gross: 0, deliveryIn: 0, deliveryOut: 0, expenses: 0, operating: 0 };
    map.set(month, row);
    return row;
  };
  for (const s of sales) {
    const r = get(dayOf(s.sold_at).slice(0, 7));
    r.revenue += s.product_total;
    r.gross += saleGross(s);
    r.deliveryIn += s.delivery_charged;
    r.deliveryOut += s.delivery_paid;
  }
  for (const e of expenses) get(e.spent_at.slice(0, 7)).expenses += e.amount;
  const rows = [...map.values()];
  for (const r of rows) r.operating = r.gross + (r.deliveryIn - r.deliveryOut) - r.expenses;
  return rows.sort((a, b) => b.month.localeCompare(a.month));
}

/** Un pedido = una o varias líneas de venta con el mismo order_id (las ventas antiguas son un pedido de una línea). */
export interface Order {
  key: string;
  orderId: string | null;
  soldAt: string;
  customerId: string | null;
  lines: Sale[];
  units: number;
  productTotal: number;
  deliveryCharged: number;
  deliveryPaid: number;
  paymentMethod: string;
  isPaid: boolean;
  notes: string;
  gross: number;
}

export function groupOrders(sales: Sale[]): Order[] {
  const map = new Map<string, Sale[]>();
  for (const s of sales) {
    const key = s.order_id ?? s.id;
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  const orders: Order[] = [];
  for (const [key, lines] of map) {
    const sorted = [...lines].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    orders.push({
      key,
      orderId: sorted[0].order_id ?? null,
      soldAt: sorted[0].sold_at,
      customerId: sorted[0].customer_id ?? null,
      lines: sorted,
      units: sum(sorted.map((l) => l.quantity)),
      productTotal: sum(sorted.map((l) => l.product_total)),
      deliveryCharged: sum(sorted.map((l) => l.delivery_charged)),
      deliveryPaid: sum(sorted.map((l) => l.delivery_paid)),
      paymentMethod: sorted[0].payment_method,
      isPaid: sorted.every((l) => l.is_paid),
      notes: sorted.map((l) => l.notes).find((x) => x) ?? '',
      gross: sum(sorted.map(saleGross)),
    });
  }
  return orders.sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

export const reservationTotal = (r: Reservation): number => sum(r.reservation_items.map((i) => i.quantity * i.unit_price));
export const reservationPaid = (r: Reservation): number => sum(r.reservation_payments.map((p) => p.amount));
export const reservationUnits = (r: Reservation): number => sum(r.reservation_items.map((i) => i.quantity));

/** Unidades reservadas (reservas activas) por producto. */
export function reservedByProduct(reservations: Reservation[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of reservations) {
    if (r.status !== 'active') continue;
    for (const i of r.reservation_items) map.set(i.product_id, (map.get(i.product_id) ?? 0) + i.quantity);
  }
  return map;
}

export const itemsText = (items: { quantity: number; products: { name: string } | null }[]): string =>
  items.map((i) => `${i.quantity} × ${i.products?.name ?? 'Producto'}`).join(', ');
