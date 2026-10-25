-- Incidencias · coordinación desde los grupos de Microsoft 365 (25-10-2026). PEDIR VISTO BUENO A MARIÁN ANTES.
-- Ejecutar en Supabase → SQL Editor, proyecto «Acceso Microsoft 365». Se puede volver a ejecutar.
--
-- Qué cambia
--   El rol «Coordinador/a» (crear incidencias y seguir las suyas) lo tienen solas las personas del Equipo Directivo
--   y de la Comisión Pedagógica (grupos e-ner-equipodirectivo y e-ner-comisionpedagogica, sincronizados cada noche).
--   Al salir del grupo, lo pierden.
--   Técnicos y Administración se siguen dando a mano en Administración → Coordinación, técnicos y administración.
--   Si alguien tiene un rol dado a mano, vale ese (por ejemplo, alguien del Equipo Directivo con «Administración»).

begin;

create or replace function inc_rol() returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from permisos where email = email_jwt() and web = 'todas') then 'admin'
    else coalesce(
      (select rol from permisos where email = email_jwt() and web = 'incidencias' limit 1),
      (select 'coordinador' from personal where email = email_actual() and activo
         and grupos_entra && array['equipo_directivo', 'comision_pedagogica'] limit 1))
  end
$$;

-- Lista para la pantalla de Administración: quién es coordinador/a por su grupo (y no tiene rol a mano)
create or replace function inc_coordinacion_m365() returns table (email text, nombre text)
language sql stable security definer set search_path = public as $$
  select lower(p.email::text), p.nombre::text from personal p
  where inc_es_admin() and p.activo and p.grupos_entra && array['equipo_directivo', 'comision_pedagogica']
    and not exists (select 1 from permisos x where lower(x.email) = lower(p.email::text) and x.web = 'incidencias')
  order by p.nombre
$$;
revoke execute on function inc_coordinacion_m365() from public, anon;
grant execute on function inc_rol(), inc_coordinacion_m365() to authenticated;

commit;

-- Comprobación: quién entra ahora en Incidencias y con qué rol
select p.nombre, p.email,
       coalesce((select rol from permisos x where lower(x.email) = lower(p.email::text) and x.web = 'incidencias'), 'coordinador (grupo)') as rol
from personal p
where p.activo and (p.grupos_entra && array['equipo_directivo', 'comision_pedagogica']
      or exists (select 1 from permisos x where lower(x.email) = lower(p.email::text) and x.web = 'incidencias'))
order by 3, 1;
