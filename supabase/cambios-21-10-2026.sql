-- ─── Incidencias · cambios del 21-10-2026: solo cuentas autorizadas ──────────
-- Se ejecuta UNA vez en el Supabase común «Acceso Microsoft 365».
-- Hasta ahora cualquier cuenta del colegio podía ver las incidencias. Desde aquí solo las ven las cuentas
-- con rol en Incidencias (coordinación, técnicos y administración, tabla común «permisos»).
-- Solo cambia reglas y funciones inc_*: no toca nada de las demás webs. Se puede volver a ejecutar.

begin;

-- 1. Listas de responsables y del claustro: solo para cuentas con rol
drop function if exists inc_gestores();
create function inc_gestores() returns table (email text, nombre text, rol text, categorias text[])
language sql stable security definer set search_path = public as $$
  select p.email, coalesce(pe.nombre, ''), p.rol,
         coalesce((select array_agg(c.categoria order by c.categoria) from inc_tecnico_categorias c where c.email = p.email), '{}')
  from permisos p left join personal pe on pe.email = p.email
  where p.web = 'incidencias' and p.rol in ('admin', 'tecnico') and inc_puede_crear()
  order by 2, 1
$$;
create or replace function inc_personal() returns table (email text, nombre text)
language sql stable security definer set search_path = public as $$
  select pe.email, pe.nombre from personal pe where inc_puede_crear() and coalesce(pe.activo, true) and coalesce(pe.nombre, '') <> '' order by pe.nombre
$$;
grant execute on function inc_gestores(), inc_personal() to authenticated;

-- 2. Reglas de lectura
drop policy if exists "ver categorias de tecnicos" on inc_tecnico_categorias;
create policy "ver categorias de tecnicos" on inc_tecnico_categorias for select to authenticated using (inc_puede_crear());
drop policy if exists "ver ubicaciones" on inc_ubicaciones;
create policy "ver ubicaciones" on inc_ubicaciones for select to authenticated using (inc_puede_crear());
drop policy if exists "ver incidencias" on inc_incidencias;
create policy "ver incidencias" on inc_incidencias for select to authenticated using (inc_puede_crear());
drop policy if exists "ver historial" on inc_eventos;
create policy "ver historial" on inc_eventos for select to authenticated using (inc_puede_crear());
drop policy if exists "ver adjuntos" on inc_adjuntos;
create policy "ver adjuntos" on inc_adjuntos for select to authenticated using (inc_puede_crear());

-- 3. Fotos y archivos
drop policy if exists inc_adjuntos_ver on storage.objects;
create policy inc_adjuntos_ver on storage.objects for select to authenticated
  using (bucket_id = 'inc-adjuntos' and inc_puede_crear());

commit;

notify pgrst, 'reload schema';

-- Comprobación: deben salir 6 reglas de lectura con inc_puede_crear y ninguna con es_profesorado
select count(*) filter (where qual like '%inc_puede_crear%') as solo_autorizadas,
       count(*) filter (where qual like '%es_profesorado%') as abiertas_al_claustro
from pg_policies where (tablename like 'inc\_%' or policyname = 'inc_adjuntos_ver') and cmd = 'SELECT';
