-- ─── Incidencias · cambios del 19-10-2026 ────────────────────────────────────
-- Se ejecuta UNA vez en el Supabase común «Acceso Microsoft 365» (la base ya tiene schema.sql).
--   · Técnicos por categoría: cada técnico atiende solo las categorías que se le marquen en
--     Administración (sin ninguna marcada, todas).
--   · Urgencia y prioridad por separado: la urgencia la indica quien crea la incidencia; la prioridad
--     asignada la ponen técnicos o administración.
-- Solo cambia objetos inc_*: no toca nada de las demás webs. Se puede volver a ejecutar sin perder datos.

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

-- 2. Urgencia indicada al crear
-- Por si la tabla ya existía: urgencia indicada al crear (las que ya había toman su prioridad)
alter table inc_incidencias add column if not exists urgencia text;
update inc_incidencias set urgencia = prioridad where urgencia is null;
alter table inc_incidencias alter column urgencia set default 'media', alter column urgencia set not null;
do $$ begin
  alter table inc_incidencias add constraint inc_incidencias_urgencia_check check (urgencia in ('baja', 'media', 'alta'));
exception when duplicate_object then null; end $$;

-- Por si la tabla ya existía: se admite el apunte «urgencia»
alter table inc_eventos drop constraint if exists inc_eventos_tipo_check;
alter table inc_eventos add constraint inc_eventos_tipo_check check (tipo in ('creada', 'comentario', 'estado', 'prioridad', 'urgencia', 'asignacion'));


-- 3. Comprobaciones al crear o cambiar una incidencia, e historial
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
    -- La prioridad asignada empieza siendo la urgencia que indica quien la crea
    new.prioridad := new.urgencia;
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
    -- Urgencia: solo la corrige quien la creó (y, si nadie ha reasignado la prioridad, la prioridad la sigue).
    -- Prioridad asignada: solo técnicos de la categoría y administración.
    if gestor then new.urgencia := old.urgencia;
    else new.prioridad := case when old.prioridad = old.urgencia then new.urgencia else old.prioridad end;
    end if;
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

create or replace function inc_despues() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into inc_eventos (incidencia_id, tipo, autor, autor_nombre) values (new.id, 'creada', email_jwt(), inc_nombre_jwt());
    return new;
  end if;
  if new.estado <> old.estado then
    insert into inc_eventos (incidencia_id, tipo, de, a, autor, autor_nombre) values (new.id, 'estado', old.estado, new.estado, email_jwt(), inc_nombre_jwt());
  end if;
  if new.prioridad <> old.prioridad then
    insert into inc_eventos (incidencia_id, tipo, de, a, autor, autor_nombre) values (new.id, 'prioridad', old.prioridad, new.prioridad, email_jwt(), inc_nombre_jwt());
  end if;
  if new.urgencia <> old.urgencia then
    insert into inc_eventos (incidencia_id, tipo, de, a, autor, autor_nombre) values (new.id, 'urgencia', old.urgencia, new.urgencia, email_jwt(), inc_nombre_jwt());
  end if;
  if new.asignado_email is distinct from old.asignado_email then
    insert into inc_eventos (incidencia_id, tipo, de, a, autor, autor_nombre)
    values (new.id, 'asignacion', old.asignado_nombre, new.asignado_nombre, email_jwt(), inc_nombre_jwt());
  end if;
  return new;
end $$;

-- 4. Lista de responsables, con las categorías de cada técnico
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

-- 5. Solo cambian estas tres reglas; las demás quedan como estaban
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

-- Comprobación: debe salir ok = true, 0 categorías asignadas y tantas urgencias como incidencias
select exists (select 1 from pg_proc where proname = 'inc_gestiona') as ok,
       (select count(*) from inc_tecnico_categorias) as categorias_asignadas,
       (select count(*) from inc_incidencias where urgencia is not null) || ' de ' || (select count(*) from inc_incidencias) as urgencias;
