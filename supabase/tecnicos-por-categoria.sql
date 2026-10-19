-- ─── Incidencias · técnicos por categoría (cambio del 19-10-2026) ─────────────
-- Se ejecuta UNA vez en el Supabase común «Acceso Microsoft 365», después de schema.sql.
-- Cada técnico atiende solo las categorías que se le marquen en Administración (informática, mobiliario,
-- infraestructura, fungibles). Un técnico sin categorías atiende todas. Solo cambia objetos inc_*:
-- no toca nada de las demás webs. Se puede volver a ejecutar sin perder datos.

begin;

-- 1. Categorías que atiende cada técnico (informática, mantenimiento…). Un técnico sin ninguna atiende todas.
create table if not exists inc_tecnico_categorias (
  email      text not null check (email = lower(email)),
  categoria  text not null check (categoria in ('informatica', 'mobiliario', 'infraestructura', 'fungibles')),
  primary key (email, categoria)
);
-- ¿Atiende esta cuenta las incidencias de esta categoría? (administración, siempre)
create or replace function inc_gestiona(p_categoria text) returns boolean
language sql stable security definer set search_path = public as $$
  select case inc_rol()
    when 'admin' then true
    when 'tecnico' then not exists (select 1 from inc_tecnico_categorias where email = email_jwt())
                     or exists (select 1 from inc_tecnico_categorias where email = email_jwt() and categoria = p_categoria)
    else false end
$$;
grant execute on function inc_gestiona(text) to authenticated;

alter table inc_tecnico_categorias enable row level security;

drop policy if exists "ver categorias de tecnicos"       on inc_tecnico_categorias;
drop policy if exists "gestionar categorias de tecnicos" on inc_tecnico_categorias;
create policy "ver categorias de tecnicos" on inc_tecnico_categorias for select to authenticated using (es_profesorado());
create policy "gestionar categorias de tecnicos" on inc_tecnico_categorias for all to authenticated
  using (inc_es_admin()) with check (inc_es_admin() and es_cuenta_colegio(email));
grant select, insert, delete on inc_tecnico_categorias to authenticated;
revoke all on inc_tecnico_categorias from anon;

-- 2. Comprobaciones al crear o cambiar una incidencia: el técnico solo puede con las de sus categorías
create or replace function inc_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare gestor boolean;
begin
  -- Técnicos: solo las incidencias de sus categorías
  gestor := inc_gestiona(case when tg_op = 'UPDATE' then old.categoria else new.categoria end);
  new.titulo := trim(new.titulo); new.descripcion := trim(new.descripcion);
  new.persona := trim(new.persona); new.ubicacion := trim(coalesce(new.ubicacion, ''));

  if tg_op = 'INSERT' then
    if not inc_puede_crear() then raise exception 'Solo coordinación, técnicos y administración pueden crear incidencias'; end if;
    new.creado_por := email_jwt();
    new.creado_nombre := inc_nombre_jwt();
    new.creado := now();
    new.estado := 'abierta';
    new.cerrado := null;
    if not gestor then new.asignado_email := null; new.asignado_nombre := null; end if;
  else
    if not gestor then
      if old.creado_por <> email_jwt() or old.estado <> 'abierta' then
        raise exception 'Solo quien la creó puede cambiarla, y solo mientras está abierta';
      end if;
      if new.estado <> old.estado or new.asignado_email is distinct from old.asignado_email then
        raise exception 'Solo los técnicos de esta categoría y administración cambian el estado o el responsable';
      end if;
    end if;
    new.creado_por := old.creado_por; new.creado_nombre := old.creado_nombre; new.creado := old.creado;
    -- El tipo de incidencia solo lo cambia administración
    if not inc_es_admin() then new.categoria := old.categoria; new.subcategoria := old.subcategoria; end if;
    if new.estado = 'cerrada' and old.estado <> 'cerrada' then new.cerrado := now();
    elsif new.estado <> 'cerrada' then new.cerrado := null;
    else new.cerrado := old.cerrado; end if;
  end if;

  -- La ubicación es obligatoria salvo en las cuentas de Microsoft 365 y Google Workspace
  if new.ubicacion = '' and not (new.categoria = 'informatica' and new.subcategoria in ('Microsoft 365', 'Google Workspace')) then
    raise exception 'Indica el aula o la zona de la incidencia';
  end if;
  new.asignado_email := nullif(lower(trim(coalesce(new.asignado_email, ''))), '');
  if new.asignado_email is null then new.asignado_nombre := null; end if;
  new.actualizado := now();
  return new;
end $$;

-- 3. Lista de responsables, con las categorías de cada técnico
drop function if exists inc_gestores();
create function inc_gestores() returns table (email text, nombre text, rol text, categorias text[])
language sql stable security definer set search_path = public as $$
  select p.email, coalesce(pe.nombre, ''), p.rol,
         coalesce((select array_agg(c.categoria order by c.categoria) from inc_tecnico_categorias c where c.email = p.email), '{}')
  from permisos p left join personal pe on pe.email = p.email
  where p.web = 'incidencias' and p.rol in ('admin', 'tecnico') and es_profesorado()
  order by 2, 1
$$;
grant execute on function inc_gestores() to authenticated;

-- 4. Solo cambian estas tres reglas; las demás quedan como estaban
drop policy if exists "cambiar incidencia" on inc_incidencias;
create policy "cambiar incidencia" on inc_incidencias for update to authenticated
  using (inc_gestiona(categoria) or (creado_por = email_jwt() and estado = 'abierta'))
  with check (inc_gestiona(categoria) or creado_por = email_jwt());

drop policy if exists "comentar" on inc_eventos;
create policy "comentar" on inc_eventos for insert to authenticated
  with check (tipo = 'comentario' and autor = email_jwt() and length(trim(texto)) > 0
    and exists (select 1 from inc_incidencias i where i.id = incidencia_id and (inc_gestiona(i.categoria) or i.creado_por = email_jwt())));

drop policy if exists "subir adjunto" on inc_adjuntos;
create policy "subir adjunto" on inc_adjuntos for insert to authenticated
  with check (creado_por = email_jwt()
    and exists (select 1 from inc_incidencias i where i.id = incidencia_id and (inc_gestiona(i.categoria) or i.creado_por = email_jwt())));

commit;

notify pgrst, 'reload schema';

-- Comprobación: debe salir ok = true y 0 categorías asignadas (se asignan desde la web)
select exists (select 1 from pg_proc where proname = 'inc_gestiona') as ok, (select count(*) from inc_tecnico_categorias) as categorias_asignadas;
