-- Antojo Diletto Buga: ejecutar en Supabase > SQL Editor.
-- Las tablas aíslan datos por usuario. No publiques nunca la service_role key.
create extension if not exists pgcrypto;
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null, size text not null check(size in ('Pequeño','Grande')), unit_cost numeric(12,2) not null default 0 check(unit_cost>=0),
 sale_price numeric(12,2) not null default 0 check(sale_price>=0), stock integer not null default 0 check(stock>=0), created_at timestamptz not null default now()
);
create table if not exists public.sales (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 product_id uuid not null references public.products(id), quantity integer not null check(quantity>0), sale_price numeric(12,2) not null check(sale_price>=0),
 unit_cost numeric(12,2) not null check(unit_cost>=0), product_total numeric(12,2) not null check(product_total>=0),
 delivery_charged numeric(12,2) not null default 0 check(delivery_charged>=0), delivery_paid numeric(12,2) not null default 0 check(delivery_paid>=0),
 payment_method text not null default 'Efectivo', is_paid boolean not null default true, notes text not null default '', sold_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 description text not null, category text not null default 'Otros', amount numeric(12,2) not null check(amount>0),
 spent_at date not null default current_date, notes text not null default '', created_at timestamptz not null default now()
);
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
drop policy if exists "Private products per user" on public.products;
create policy "Private products per user" on public.products for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "Private sales per user" on public.sales;
create policy "Private sales per user" on public.sales for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "Private expenses per user" on public.expenses;
create policy "Private expenses per user" on public.expenses for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
-- No se insertan productos automáticamente aquí: inicia sesión y ejecuta la semilla de abajo
-- después de reemplazar USER_UUID con el UUID de tu usuario de Authentication > Users.
-- Costo unitario incluye envío proveedor prorrateado: pequeño 3172.22; grande 4188.89 COP.
-- Seed inicial (ejecutar una sola vez, reemplazando USER_UUID por tu UUID):
-- insert into public.products(user_id,name,size,unit_cost,sale_price,stock) values
-- ('USER_UUID','Dulce de leche','Pequeño',3172.22,5000,10),
-- ('USER_UUID','Cheesecake de limón','Pequeño',3172.22,5000,10),
-- ('USER_UUID','Cheesecake de maracuyá','Pequeño',3172.22,5000,10),
-- ('USER_UUID','Chocolatoso','Pequeño',3172.22,5000,10),
-- ('USER_UUID','Red velvet','Pequeño',3172.22,5000,10),
-- ('USER_UUID','Snickers','Pequeño',3172.22,5000,10),
-- ('USER_UUID','Brownie','Grande',4188.89,6500,15),
-- ('USER_UUID','Milo Crunch','Grande',4188.89,6500,10),
-- ('USER_UUID','Snowreo','Grande',4188.89,6500,5);
