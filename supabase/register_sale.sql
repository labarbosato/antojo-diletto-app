create or replace function public.register_sale(
  p_product_id       uuid,
  p_quantity         integer,
  p_sale_price       numeric,
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
  prod   public.products;
  new_id uuid;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'La cantidad debe ser al menos 1';
  end if;
  if p_sale_price is null or p_sale_price < 0 then
    raise exception 'Precio de venta inválido';
  end if;
  if coalesce(p_delivery_charged, 0) < 0 or coalesce(p_delivery_paid, 0) < 0 then
    raise exception 'Los domicilios no pueden ser negativos';
  end if;

  -- Bloquea la fila del producto hasta terminar: evita doble descuento si hay
  -- dos ventas simultáneas (por ejemplo, desde el celular y el computador).
  select * into prod
    from public.products
   where id = p_product_id
     and user_id = auth.uid()
   for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;
  if prod.stock < p_quantity then
    raise exception 'Stock insuficiente (quedan %)', prod.stock;
  end if;

  insert into public.sales(
    product_id, quantity, sale_price, unit_cost, product_total,
    delivery_charged, delivery_paid, payment_method, is_paid, notes, sold_at
  ) values (
    prod.id, p_quantity, p_sale_price, prod.unit_cost, p_sale_price * p_quantity,
    coalesce(p_delivery_charged, 0), coalesce(p_delivery_paid, 0),
    coalesce(nullif(p_payment_method, ''), 'Efectivo'), coalesce(p_is_paid, true),
    coalesce(p_notes, ''), coalesce(p_sold_at, now())
  ) returning id into new_id;

  update public.products
     set stock = stock - p_quantity
   where id = prod.id;

  return new_id;
end
$$;

-- Solo usuarios con sesión iniciada pueden llamarla (no el rol anónimo).
revoke all on function public.register_sale(uuid, integer, numeric, numeric, numeric, text, boolean, text, timestamptz) from public, anon;
grant execute on function public.register_sale(uuid, integer, numeric, numeric, numeric, text, boolean, text, timestamptz) to authenticated;