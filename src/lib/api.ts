import { supabase } from './supabase';
import type { Size } from './types';
import type { Order } from './finance';

function fail(message: string): never {
  throw new Error(message);
}

export interface SaleInput {
  productId: string;
  quantity: number;
  salePrice: number;
  deliveryCharged: number;
  deliveryPaid: number;
  paymentMethod: string;
  isPaid: boolean;
  notes: string;
  soldAt: string; // ISO timestamp
}

/** Registra la venta y descuenta el stock en una sola transacción (función SQL register_sale). */
export async function registerSale(input: SaleInput): Promise<void> {
  const { error } = await supabase.rpc('register_sale', {
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_sale_price: input.salePrice,
    p_delivery_charged: input.deliveryCharged,
    p_delivery_paid: input.deliveryPaid,
    p_payment_method: input.paymentMethod,
    p_is_paid: input.isPaid,
    p_notes: input.notes,
    p_sold_at: input.soldAt,
  });
  if (error) {
    if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) {
      fail('Falta instalar la función register_sale en Supabase. Ejecuta el archivo supabase/register_sale.sql en el SQL Editor.');
    }
    fail(error.message);
  }
}

export async function markSalePaid(id: string): Promise<void> {
  const { error } = await supabase.from('sales').update({ is_paid: true }).eq('id', id);
  if (error) fail(error.message);
}

/** Marca como pagado un pedido completo (todas sus líneas). */
export async function markOrderPaid(order: Order): Promise<void> {
  const q = supabase.from('sales').update({ is_paid: true });
  const { error } = order.orderId ? await q.eq('order_id', order.orderId) : await q.eq('id', order.lines[0].id);
  if (error) fail(error.message);
}

const MISSING_SQL = 'Falta instalar la actualización de clientes y reservas en Supabase. Ejecuta el archivo supabase/clientes_reservas.sql en el SQL Editor.';

function rpcError(error: { code?: string; message: string }): never {
  if (error.code === 'PGRST202' || error.code === '42P01' || error.code === 'PGRST205' || /could not find|schema cache|does not exist/i.test(error.message)) fail(MISSING_SQL);
  fail(error.message);
}

export interface OrderLineInput {
  productId: string;
  quantity: number;
  salePrice: number;
}

export interface OrderInput {
  customerId: string | null;
  lines: OrderLineInput[];
  deliveryCharged: number;
  deliveryPaid: number;
  paymentMethod: string;
  isPaid: boolean;
  notes: string;
  soldAt: string;
}

/** Registra un pedido con varios productos y descuenta el stock en una sola transacción. */
export async function registerOrder(input: OrderInput): Promise<void> {
  const { error } = await supabase.rpc('register_order', {
    p_customer_id: input.customerId,
    p_items: input.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, sale_price: l.salePrice })),
    p_delivery_charged: input.deliveryCharged,
    p_delivery_paid: input.deliveryPaid,
    p_payment_method: input.paymentMethod,
    p_is_paid: input.isPaid,
    p_notes: input.notes,
    p_sold_at: input.soldAt,
  });
  if (error) rpcError(error);
}

export interface CustomerInput {
  name: string;
  phone: string;
  notes: string;
}

export async function createCustomer(input: CustomerInput): Promise<string> {
  const { data, error } = await supabase.from('customers').insert({ name: input.name, phone: input.phone, notes: input.notes }).select('id').single();
  if (error) rpcError(error);
  return (data as { id: string }).id;
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<void> {
  const { error } = await supabase.from('customers').update({ name: input.name, phone: input.phone, notes: input.notes }).eq('id', id);
  if (error) rpcError(error);
}

export interface ReservationLineInput {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export async function createReservation(input: { customerId: string; pickupDate: string | null; notes: string; lines: ReservationLineInput[] }): Promise<string> {
  const { data, error } = await supabase.rpc('create_reservation', {
    p_customer_id: input.customerId,
    p_pickup_date: input.pickupDate,
    p_notes: input.notes,
    p_items: input.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, unit_price: l.unitPrice })),
  });
  if (error) rpcError(error);
  return data as string;
}

export async function addReservationItem(reservationId: string, line: ReservationLineInput): Promise<void> {
  const { error } = await supabase.rpc('add_reservation_item', {
    p_reservation_id: reservationId,
    p_product_id: line.productId,
    p_quantity: line.quantity,
    p_unit_price: line.unitPrice,
  });
  if (error) rpcError(error);
}

export async function removeReservationItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('reservation_items').delete().eq('id', itemId);
  if (error) rpcError(error);
}

export async function addReservationPayment(input: { reservationId: string; amount: number; method: string; paidAt: string; notes: string }): Promise<void> {
  const { error } = await supabase.from('reservation_payments').insert({
    reservation_id: input.reservationId,
    amount: input.amount,
    method: input.method,
    paid_at: input.paidAt,
    notes: input.notes,
  });
  if (error) rpcError(error);
}

export async function cancelReservation(id: string): Promise<void> {
  const { data, error } = await supabase.from('reservations').update({ status: 'cancelled', closed_at: new Date().toISOString() }).eq('id', id).eq('status', 'active').select('id');
  if (error) rpcError(error);
  if (!data || data.length === 0) fail('La reserva ya no estaba activa. Actualiza la pantalla.');
}

export async function fulfillReservation(input: {
  reservationId: string;
  deliveryCharged: number;
  deliveryPaid: number;
  paymentMethod: string;
  isPaid: boolean;
  notes: string;
  soldAt: string;
}): Promise<void> {
  const { error } = await supabase.rpc('fulfill_reservation', {
    p_reservation_id: input.reservationId,
    p_delivery_charged: input.deliveryCharged,
    p_delivery_paid: input.deliveryPaid,
    p_payment_method: input.paymentMethod,
    p_is_paid: input.isPaid,
    p_notes: input.notes,
    p_sold_at: input.soldAt,
  });
  if (error) rpcError(error);
}

export interface ExpenseInput {
  description: string;
  category: string;
  amount: number;
  spentAt: string; // YYYY-MM-DD
  notes: string;
}

export async function createExpense(input: ExpenseInput): Promise<void> {
  const { error } = await supabase.from('expenses').insert({
    description: input.description,
    category: input.category,
    amount: input.amount,
    spent_at: input.spentAt,
    notes: input.notes,
  });
  if (error) fail(error.message);
}

export interface ProductInput {
  name: string;
  size: Size;
  unitCost: number;
  salePrice: number;
}

export async function createProduct(input: ProductInput & { stock: number }): Promise<void> {
  const { error } = await supabase.from('products').insert({
    name: input.name,
    size: input.size,
    unit_cost: input.unitCost,
    sale_price: input.salePrice,
    stock: input.stock,
  });
  if (error) fail(error.message);
}

/** Edita datos y precios. NUNCA toca el stock. */
export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ name: input.name, size: input.size, unit_cost: input.unitCost, sale_price: input.salePrice })
    .eq('id', id);
  if (error) fail(error.message);
}

/**
 * Ajusta existencias sumando o restando. Solo aplica si el stock no cambió desde que lo viste
 * (control de concurrencia), y nunca deja el stock en negativo.
 */
export async function adjustStock(id: string, currentStock: number, delta: number): Promise<void> {
  const next = currentStock + delta;
  if (next < 0) fail('El ajuste dejaría el stock en negativo.');
  const { data, error } = await supabase.from('products').update({ stock: next }).eq('id', id).eq('stock', currentStock).select('id');
  if (error) fail(error.message);
  if (!data || data.length === 0) fail('El stock cambió mientras lo ajustabas. Actualiza la pantalla e inténtalo de nuevo.');
}
