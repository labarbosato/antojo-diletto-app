create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  phone      text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  status      text not null default 'active' check (status in ('active', 'delivered', 'cancelled')),
  pickup_date date,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

create table if not exists public.reservation_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  product_id     uuid not null references public.products(id),
  quantity       integer not null check (quantity > 0),
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  created_at     timestamptz not null default now()
);

create table if not exists public.reservation_payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  amount         numeric(12,2) not null check (amount > 0),
  method         text not null default 'Efectivo',
  paid_at        date not null default current_date,
  notes          text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists reservations_customer_idx on public.reservations(customer_id);
create index if not exists reservation_items_res_idx on public.reservation_items(reservation_id);
create index if not exists reservation_items_prod_idx on public.reservation_items(product_id);
create index if not exists reservation_payments_res_idx on public.reservation_payments(reservation_id);

-- Columnas opcionales en sales (las filas existentes quedan en NULL).
alter table public.sales add column if not exists customer_id    uuid references public.customers(id) on delete set null;
alter table public.sales add column if not exists order_id       uuid;
alter table public.sales add column if not exists reservation_id uuid references public.reservations(id) on delete set null;
create index if not exists sales_order_idx on public.sales(order_id);
create index if not exists sales_customer_idx on public.sales(customer_id);

-- ───────────────────────── Privacidad (RLS) ─────────────────────────

alter table public.customers            enable row level security;
alter table public.reservations         enable row level security;
alter table public.reservation_items    enable row level security;
alter table public.reservation_payments enable row level security;

drop policy if exists "Private customers per user" on public.customers;
create policy "Private customers per user" on public.customers
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Private reservations per user" on public.reservations;
create policy "Private reservations per user" on public.reservations
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Private reservation items per user" on public.reservation_items;
create policy "Private reservation items per user" on public.reservation_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Private reservation payments per user" on public.reservation_payments;
create policy "Private reservation payments per user" on public.reservation_payments
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── Funciones ─────────────────────────
-- Todas son `security invoker`: se ejecutan con tus permisos y tus políticas RLS siguen aplicando.
-- Todas son transaccionales: si algo falla, no se guarda nada.

-- 1) Registrar un pedido con varios productos (una sola venta lógica, varias líneas) y descontar stock.
--    p_items: [{"product_id":"...","quantity":2,"sale_price":5000}, ...]
--    No permite vender unidades que están reservadas para otra persona (stock - reservados).
--    El domicilio se guarda UNA sola vez (en la primera línea) para no duplicarlo en los totales.
create or replace function public.register_order(
  p_customer_id      uuid,
  p_items            jsonb,
  p_delivery_charged numeric,
  p_delivery_paid    numeric,
  p_payment_method   text,
  p_is_paid          boolean,
  p_notes            text,
  p_sold_at          timestamptz
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order   uuid := gen_random_uuid();
  v_sold_at timestamptz := coalesce(p_sold_at, now());
  e         jsonb;
  rec       record;
  prod      public.products;
  v_reserved integer;
  v_pid     uuid;
  v_qty     integer;
  v_price   numeric;
  v_first   boolean := true;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;
  if coalesce(p_delivery_charged, 0) < 0 or coalesce(p_delivery_paid, 0) < 0 then
    raise exception 'Los domicilios no pueden ser negativos';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id and user_id = auth.uid()
  ) then
    raise exception 'Cliente no encontrado';
  end if;

  -- Valida cada línea.
  for e in select * from jsonb_array_elements(p_items) loop
    v_qty   := (e->>'quantity')::integer;
    v_price := (e->>'sale_price')::numeric;
    if (e->>'product_id') is null or v_qty is null or v_qty < 1 then
      raise exception 'Cada producto necesita una cantidad de al menos 1';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'Precio de venta inválido';
    end if;
  end loop;

  -- Bloquea y descuenta por producto (en orden de id, para evitar bloqueos cruzados).
  for rec in
    select (x->>'product_id')::uuid as pid, sum((x->>'quantity')::integer)::integer as qty
      from jsonb_array_elements(p_items) x
     group by 1
     order by 1
  loop
    select * into prod from public.products
     where id = rec.pid and user_id = auth.uid()
       for update;
    if not found then
      raise exception 'Producto no encontrado';
    end if;

    select coalesce(sum(ri.quantity), 0) into v_reserved
      from public.reservation_items ri
      join public.reservations r on r.id = ri.reservation_id
     where ri.product_id = prod.id and r.status = 'active' and r.user_id = auth.uid();

    if prod.stock - v_reserved < rec.qty then
      raise exception 'No hay suficiente disponible de % (stock %, reservados %, pedidos %)',
        prod.name, prod.stock, v_reserved, rec.qty;
    end if;

    update public.products set stock = stock - rec.qty where id = prod.id;
  end loop;

  -- Inserta las líneas.
  for e in select * from jsonb_array_elements(p_items) loop
    v_pid   := (e->>'product_id')::uuid;
    v_qty   := (e->>'quantity')::integer;
    v_price := (e->>'sale_price')::numeric;
    select * into prod from public.products where id = v_pid and user_id = auth.uid();

    insert into public.sales(
      product_id, quantity, sale_price, unit_cost, product_total,
      delivery_charged, delivery_paid, payment_method, is_paid, notes, sold_at,
      customer_id, order_id
    ) values (
      prod.id, v_qty, v_price, prod.unit_cost, v_price * v_qty,
      case when v_first then coalesce(p_delivery_charged, 0) else 0 end,
      case when v_first then coalesce(p_delivery_paid, 0) else 0 end,
      coalesce(nullif(p_payment_method, ''), 'Efectivo'), coalesce(p_is_paid, true),
      coalesce(p_notes, ''), v_sold_at,
      p_customer_id, v_order
    );
    v_first := false;
  end loop;

  return v_order;
end
$$;

-- 2) Crear una reserva (sin descontar stock). Exige que haya unidades disponibles (stock - reservadas).
--    p_items: [{"product_id":"...","quantity":4,"unit_price":5000}, ...]
create or replace function public.create_reservation(
  p_customer_id uuid,
  p_pickup_date date,
  p_notes       text,
  p_items       jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_res      uuid;
  e          jsonb;
  rec        record;
  prod       public.products;
  v_reserved integer;
  v_qty      integer;
  v_price    numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La reserva no tiene productos';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and user_id = auth.uid()) then
    raise exception 'Cliente no encontrado';
  end if;

  for e in select * from jsonb_array_elements(p_items) loop
    v_qty   := (e->>'quantity')::integer;
    v_price := (e->>'unit_price')::numeric;
    if (e->>'product_id') is null or v_qty is null or v_qty < 1 then
      raise exception 'Cada producto necesita una cantidad de al menos 1';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'Precio inválido';
    end if;
  end loop;

  for rec in
    select (x->>'product_id')::uuid as pid, sum((x->>'quantity')::integer)::integer as qty
      from jsonb_array_elements(p_items) x
     group by 1
     order by 1
  loop
    select * into prod from public.products
     where id = rec.pid and user_id = auth.uid()
       for update;
    if not found then
      raise exception 'Producto no encontrado';
    end if;
    select coalesce(sum(ri.quantity), 0) into v_reserved
      from public.reservation_items ri
      join public.reservations r on r.id = ri.reservation_id
     where ri.product_id = prod.id and r.status = 'active' and r.user_id = auth.uid();
    if prod.stock - v_reserved < rec.qty then
      raise exception 'No hay suficiente disponible de % (stock %, ya reservados %, pedidas %)',
        prod.name, prod.stock, v_reserved, rec.qty;
    end if;
  end loop;

  insert into public.reservations(customer_id, pickup_date, notes)
  values (p_customer_id, p_pickup_date, coalesce(p_notes, ''))
  returning id into v_res;

  insert into public.reservation_items(reservation_id, product_id, quantity, unit_price)
  select v_res, (x->>'product_id')::uuid, (x->>'quantity')::integer, (x->>'unit_price')::numeric
    from jsonb_array_elements(p_items) x;

  return v_res;
end
$$;

-- 3) Agregar un producto más a una reserva activa (verificando disponibilidad).
create or replace function public.add_reservation_item(
  p_reservation_id uuid,
  p_product_id     uuid,
  p_quantity       integer,
  p_unit_price     numeric
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  res        public.reservations;
  prod       public.products;
  v_reserved integer;
  new_id     uuid;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'La cantidad debe ser al menos 1';
  end if;
  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'Precio inválido';
  end if;

  select * into prod from public.products
   where id = p_product_id and user_id = auth.uid()
     for update;
  if not found then
    raise exception 'Producto no encontrado';
  end if;

  select * into res from public.reservations
   where id = p_reservation_id and user_id = auth.uid()
     for update;
  if not found then
    raise exception 'Reserva no encontrada';
  end if;
  if res.status <> 'active' then
    raise exception 'La reserva ya está cerrada';
  end if;

  select coalesce(sum(ri.quantity), 0) into v_reserved
    from public.reservation_items ri
    join public.reservations r on r.id = ri.reservation_id
   where ri.product_id = prod.id and r.status = 'active' and r.user_id = auth.uid();

  if prod.stock - v_reserved < p_quantity then
    raise exception 'No hay suficiente disponible de % (stock %, ya reservados %)', prod.name, prod.stock, v_reserved;
  end if;

  insert into public.reservation_items(reservation_id, product_id, quantity, unit_price)
  values (res.id, prod.id, p_quantity, p_unit_price)
  returning id into new_id;

  return new_id;
end
$$;

-- 4) Entregar una reserva: crea las ventas (una por sabor, mismo order_id), descuenta el stock
--    y marca la reserva como entregada, todo en una sola operación.
--    Si p_is_paid es NULL, queda pagada cuando los abonos cubren el total.
create or replace function public.fulfill_reservation(
  p_reservation_id   uuid,
  p_delivery_charged numeric,
  p_delivery_paid    numeric,
  p_payment_method   text,
  p_is_paid          boolean,
  p_notes            text,
  p_sold_at          timestamptz
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  res        public.reservations;
  rec        record;
  it         record;
  prod       public.products;
  v_order    uuid := gen_random_uuid();
  v_sold_at  timestamptz := coalesce(p_sold_at, now());
  v_total    numeric;
  v_paid_in  numeric;
  v_is_paid  boolean;
  v_first    boolean := true;
begin
  if coalesce(p_delivery_charged, 0) < 0 or coalesce(p_delivery_paid, 0) < 0 then
    raise exception 'Los domicilios no pueden ser negativos';
  end if;

  select * into res from public.reservations
   where id = p_reservation_id and user_id = auth.uid()
     for update;
  if not found then
    raise exception 'Reserva no encontrada';
  end if;
  if res.status <> 'active' then
    raise exception 'La reserva ya fue entregada o cancelada';
  end if;

  select coalesce(sum(quantity * unit_price), 0) into v_total
    from public.reservation_items where reservation_id = res.id;
  if v_total = 0 and not exists (select 1 from public.reservation_items where reservation_id = res.id) then
    raise exception 'La reserva no tiene productos';
  end if;
  select coalesce(sum(amount), 0) into v_paid_in
    from public.reservation_payments where reservation_id = res.id;
  v_is_paid := coalesce(p_is_paid, v_paid_in >= v_total);

  -- Bloquea y descuenta stock por producto.
  for rec in
    select product_id as pid, sum(quantity)::integer as qty
      from public.reservation_items
     where reservation_id = res.id
     group by 1
     order by 1
  loop
    select * into prod from public.products
     where id = rec.pid and user_id = auth.uid()
       for update;
    if not found then
      raise exception 'Producto no encontrado';
    end if;
    if prod.stock < rec.qty then
      raise exception 'Stock insuficiente de % (hay %, la reserva pide %)', prod.name, prod.stock, rec.qty;
    end if;
    update public.products set stock = stock - rec.qty where id = prod.id;
  end loop;

  -- Una línea de venta por cada ítem de la reserva.
  for it in
    select * from public.reservation_items where reservation_id = res.id order by created_at, id
  loop
    select * into prod from public.products where id = it.product_id and user_id = auth.uid();
    insert into public.sales(
      product_id, quantity, sale_price, unit_cost, product_total,
      delivery_charged, delivery_paid, payment_method, is_paid, notes, sold_at,
      customer_id, order_id, reservation_id
    ) values (
      prod.id, it.quantity, it.unit_price, prod.unit_cost, it.unit_price * it.quantity,
      case when v_first then coalesce(p_delivery_charged, 0) else 0 end,
      case when v_first then coalesce(p_delivery_paid, 0) else 0 end,
      coalesce(nullif(p_payment_method, ''), 'Efectivo'), v_is_paid,
      coalesce(nullif(p_notes, ''), res.notes, ''), v_sold_at,
      res.customer_id, v_order, res.id
    );
    v_first := false;
  end loop;

  update public.reservations set status = 'delivered', closed_at = now() where id = res.id;

  return v_order;
end
$$;

-- Solo usuarios con sesión iniciada pueden llamarlas (no el rol anónimo).
revoke all on function public.register_order(uuid, jsonb, numeric, numeric, text, boolean, text, timestamptz) from public, anon;
grant execute on function public.register_order(uuid, jsonb, numeric, numeric, text, boolean, text, timestamptz) to authenticated;

revoke all on function public.create_reservation(uuid, date, text, jsonb) from public, anon;
grant execute on function public.create_reservation(uuid, date, text, jsonb) to authenticated;

revoke all on function public.add_reservation_item(uuid, uuid, integer, numeric) from public, anon;
grant execute on function public.add_reservation_item(uuid, uuid, integer, numeric) to authenticated;

revoke all on function public.fulfill_reservation(uuid, numeric, numeric, text, boolean, text, timestamptz) from public, anon;
grant execute on function public.fulfill_reservation(uuid, numeric, numeric, text, boolean, text, timestamptz) to authenticated;


notify pgrst, 'reload schema';
