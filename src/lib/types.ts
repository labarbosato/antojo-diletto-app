export type Size = 'Pequeño' | 'Grande';

export interface Product {
  id: string;
  name: string;
  size: Size;
  unit_cost: number;
  sale_price: number;
  stock: number;
  created_at: string;
}

export interface Sale {
  id: string;
  product_id: string;
  quantity: number;
  sale_price: number;
  unit_cost: number;
  product_total: number;
  delivery_charged: number;
  delivery_paid: number;
  payment_method: string;
  is_paid: boolean;
  notes: string;
  sold_at: string;
  created_at: string;
  customer_id?: string | null;
  order_id?: string | null;
  reservation_id?: string | null;
  products: { name: string; size: Size } | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string;
  created_at: string;
}

export type ReservationStatus = 'active' | 'delivered' | 'cancelled';

export interface ReservationItem {
  id: string;
  reservation_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  created_at: string;
  products: { name: string; size: Size } | null;
}

export interface ReservationPayment {
  id: string;
  reservation_id: string;
  amount: number;
  method: string;
  paid_at: string; // YYYY-MM-DD
  notes: string;
  created_at: string;
}

export interface Reservation {
  id: string;
  customer_id: string;
  status: ReservationStatus;
  pickup_date: string | null;
  notes: string;
  created_at: string;
  closed_at: string | null;
  customers: { name: string } | null;
  reservation_items: ReservationItem[];
  reservation_payments: ReservationPayment[];
}

export interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  spent_at: string; // YYYY-MM-DD
  notes: string;
  created_at: string;
}

export const EXPENSE_CATEGORIES = ['Publicidad', 'Transporte', 'Empaques', 'Insumos', 'Comisiones', 'Otros'] as const;
export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Otro'] as const;
