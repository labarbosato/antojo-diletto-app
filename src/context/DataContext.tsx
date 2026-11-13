import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { reservedByProduct } from '../lib/finance';
import type { Customer, Expense, Product, Reservation, Sale } from '../lib/types';

const ROW_LIMIT = 1000; // límite por defecto de Supabase por consulta

interface DataState {
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  customers: Customer[];
  reservations: Reservation[];
  /** false si aún no se ejecutó supabase/clientes_reservas.sql (clientes y reservas no disponibles). */
  reservationsReady: boolean;
  /** Unidades reservadas (reservas activas) por id de producto. */
  reserved: Map<string, number>;
  loading: boolean;
  error: string | null;
  /** true si alguna tabla alcanzó el límite de filas y los totales podrían estar incompletos. */
  truncated: boolean;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

type Raw = Record<string, unknown>;
const n = (v: unknown): number => Number(v ?? 0);
const isMissingTable = (e: { code?: string; message: string } | null): boolean =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST200' || /does not exist|schema cache|Could not find/i.test(e.message));

export function DataProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsReady, setReservationsReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const refresh = useCallback(async () => {
    const [p, s, e, c, r] = await Promise.all([
      supabase.from('products').select('*').order('size').order('name'),
      supabase.from('sales').select('*, products(name,size)').order('sold_at', { ascending: false }).limit(ROW_LIMIT),
      supabase.from('expenses').select('*').order('spent_at', { ascending: false }).limit(ROW_LIMIT),
      supabase.from('customers').select('*').order('name'),
      supabase
        .from('reservations')
        .select('*, customers(name), reservation_items(*, products(name,size)), reservation_payments(*)')
        .order('created_at', { ascending: false })
        .limit(ROW_LIMIT),
    ]);
    const failure = p.error ?? s.error ?? e.error;
    if (failure) {
      setError(`No se pudieron cargar los datos: ${failure.message}`);
      return;
    }
    setError(null);
    setProducts(
      (p.data as Raw[]).map((r) => ({ ...(r as unknown as Product), unit_cost: n(r.unit_cost), sale_price: n(r.sale_price), stock: n(r.stock) })),
    );
    setSales(
      (s.data as Raw[]).map((r) => ({
        ...(r as unknown as Sale),
        quantity: n(r.quantity),
        sale_price: n(r.sale_price),
        unit_cost: n(r.unit_cost),
        product_total: n(r.product_total),
        delivery_charged: n(r.delivery_charged),
        delivery_paid: n(r.delivery_paid),
      })),
    );
    setExpenses((e.data as Raw[]).map((r) => ({ ...(r as unknown as Expense), amount: n(r.amount) })));
    // Clientes y reservas son opcionales: si aún no se instaló el SQL, el resto de la app sigue funcionando.
    const cFail = c.error ?? r.error;
    if (cFail && !isMissingTable(cFail)) {
      setError(`No se pudieron cargar los clientes y reservas: ${cFail.message}`);
    }
    setReservationsReady(!cFail);
    setCustomers(cFail ? [] : (c.data as Customer[]));
    setReservations(
      cFail
        ? []
        : (r.data as unknown as Reservation[]).map((res) => ({
            ...res,
            reservation_items: (res.reservation_items ?? []).map((i) => ({ ...i, quantity: n(i.quantity), unit_price: n(i.unit_price) })),
            reservation_payments: (res.reservation_payments ?? []).map((pay) => ({ ...pay, amount: n(pay.amount) })),
          })),
    );
    setTruncated((s.data?.length ?? 0) >= ROW_LIMIT || (e.data?.length ?? 0) >= ROW_LIMIT);
  }, []);

  useEffect(() => {
    let alive = true;
    refresh().finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refresh]);

  const reserved = useMemo(() => reservedByProduct(reservations), [reservations]);

  return (
    <DataContext.Provider value={{ products, sales, expenses, customers, reservations, reservationsReady, reserved, loading, error, truncated, refresh }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de DataProvider');
  return ctx;
}
