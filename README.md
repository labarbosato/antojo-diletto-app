# Antojo Diletto Buga — app web privada

Aplicación web para la gestión de un negocio de alfajores. Permite controlar el inventario, registrar ventas con varios productos por pedido, administrar clientes y reservas con abonos, y consultar reportes y un resumen general. Cada usuario ve únicamente sus propios datos.

## Funcionalidades

- **Inventario:** control de productos y existencias.
- **Ventas:** pedidos con varios productos en una sola venta, asignados a un cliente, con domicilio y método de pago.
- **Clientes:** registro de clientes con teléfono y notas.
- **Reservas:** apartado de productos para un cliente, con fecha de entrega y abonos.
- **Gastos:** registro de los gastos del negocio.
- **Reportes y resumen:** consulta de ventas y del estado general del negocio.
- **Autenticación:** acceso con usuario y contraseña mediante Supabase Auth.

## Tecnologías

- React
- TypeScript
- Vite
- Supabase (PostgreSQL, Auth y Row Level Security)

## Decisiones técnicas

- **Seguridad por usuario:** todas las tablas tienen Row Level Security activado, con políticas basadas en `user_id = auth.uid()`. Aunque la clave pública de Supabase viaje en el frontend, cada usuario solo accede a sus filas.
- **Lógica de negocio en la base de datos:** el registro de pedidos, la creación de reservas y la entrega de reservas son funciones SQL transaccionales. Si algo falla, no se guarda nada.
- **Sin doble descuento de stock:** las funciones bloquean la fila del producto (`for update`) mientras se procesa la operación, para evitar errores cuando hay ventas simultáneas, por ejemplo desde el celular y el computador.
- **Disponibilidad real:** al vender o reservar se valida el stock menos lo ya reservado, de modo que no se vendan unidades apartadas para otro cliente.
- **Totales sin duplicados:** en un pedido con varios productos, el domicilio se guarda una sola vez.
- **Permisos explícitos:** las funciones usan `security invoker`, así que respetan RLS, y su ejecución está revocada para el rol anónimo.


## Cómo ejecutarlo localmente

1. Clona el repositorio e instala las dependencias:

   ```bash
   git clone https://github.com/labarbosato/antojo-diletto-app.git
   cd diletto-app
   npm install
   ```

2. Crea tu archivo de variables de entorno a partir del ejemplo:

   ```bash
   cp .env.example .env
   ```

   Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los datos de tu proyecto de Supabase (Project Settings → API).

3. Inicia el servidor de desarrollo:

   ```bash
   npm run dev
   ```

## Configuración de Supabase

1. Crea un proyecto en [Supabase](https://supabase.com).
2. En el **SQL Editor**, ejecuta en este orden:
   1. `schema.sql`
   2. `supabase/clientes_reservas.sql`
   3. `supabase/register_sale.sql`
3. En **Authentication → Users**, crea tu usuario. Si la app es de uso personal, puedes desactivar los registros nuevos en **Authentication → Sign In / Providers**.

## Estado del proyecto

La aplicación está desplegada en Netlify: [antojo-diletto-buga.netlify.app](https://antojo-diletto-buga.netlify.app)

El acceso requiere iniciar sesión.

## Autora

**Laura Barbosa Torres** · [LinkedIn](https://www.linkedin.com/in/laura-barbosa-torres-99b2a31a7/)