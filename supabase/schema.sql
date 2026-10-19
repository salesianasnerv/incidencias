-- ─── Incidencias · estructura de la base de datos ───────────────────────────
-- Se ejecuta en el Supabase común «Acceso Microsoft 365» (el del Control de baños), en SQL Editor.
-- Todas las tablas empiezan por inc_ y no tocan las de las demás webs.
-- Los permisos van a la lista común «permisos» (web = 'incidencias') con uno de estos roles:
--   coordinador = crea incidencias · tecnico = además las atiende (estado, prioridad, responsable)
--   admin       = además gestiona aulas y zonas y da o quita permisos.
-- El resto del profesorado (cualquier cuenta del colegio) solo las ve.
-- Se puede volver a ejecutar sin perder datos.

begin;

-- 1. 'incidencias' como web válida en «permisos» (se añade a la lista que haya, sin tocar las demás)
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'permisos'::regclass and conname = 'permisos_web_check';
  if def is not null and def not like '%''incidencias''%' then
    execute 'alter table permisos drop constraint permisos_web_check';
    execute 'alter table permisos add constraint permisos_web_check ' || replace(def, 'ARRAY[', 'ARRAY[''incidencias''::text, ');
  end if;
end $$;

-- 2. Roles
create or replace function inc_rol() returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from permisos where email = email_jwt() and web = 'todas') then 'admin'
    else (select rol from permisos where email = email_jwt() and web = 'incidencias' limit 1)
  end
$$;
create or replace function inc_es_admin() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(inc_rol() = 'admin', false) $$;
create or replace function inc_es_gestor() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(inc_rol() in ('admin', 'tecnico'), false) $$;
create or replace function inc_puede_crear() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(inc_rol() in ('admin', 'tecnico', 'coordinador'), false) $$;
create or replace function inc_nombre_jwt() returns text
language sql stable as $$
  select coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''), email_jwt())
$$;
grant execute on function inc_rol(), inc_es_admin(), inc_es_gestor(), inc_puede_crear(), inc_nombre_jwt() to authenticated;

-- Categorías que atiende cada técnico (informática, mantenimiento…). Un técnico sin ninguna atiende todas.
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

-- 3. Reglas de «permisos» para las filas de incidencias (se suman a las que ya hay)
drop policy if exists "incidencias: ver permisos"     on permisos;
drop policy if exists "incidencias: dar permiso"      on permisos;
drop policy if exists "incidencias: cambiar permiso"  on permisos;
drop policy if exists "incidencias: quitar permiso"   on permisos;
create policy "incidencias: ver permisos" on permisos for select to authenticated
  using (web = 'incidencias' and inc_es_admin());
create policy "incidencias: dar permiso" on permisos for insert to authenticated
  with check (web = 'incidencias' and inc_es_admin() and es_cuenta_colegio(email) and rol in ('coordinador', 'tecnico', 'admin'));
create policy "incidencias: cambiar permiso" on permisos for update to authenticated
  using (web = 'incidencias' and inc_es_admin() and email <> email_jwt())
  with check (web = 'incidencias' and inc_es_admin() and rol in ('coordinador', 'tecnico', 'admin'));
create policy "incidencias: quitar permiso" on permisos for delete to authenticated
  using (web = 'incidencias' and inc_es_admin() and email <> email_jwt());

-- 4. Aulas y zonas (las elige quien crea la incidencia; administración las cambia desde la web)
create table if not exists inc_ubicaciones (
  id      serial primary key,
  tipo    text not null default 'aula' check (tipo in ('aula', 'zona')),
  grupo   text not null default '',            -- "ESO", "Primaria", "Aulas específicas", "Zonas comunes"…
  nombre  text not null unique check (length(trim(nombre)) > 0),
  orden   int  not null default 0,
  activo  boolean not null default true
);

-- 5. Incidencias (tickets)
create table if not exists inc_incidencias (
  id              bigint generated always as identity primary key,
  categoria       text not null check (categoria in ('informatica', 'mobiliario', 'infraestructura', 'fungibles')),
  subcategoria    text not null check (length(trim(subcategoria)) > 0),
  elementos       text[] not null default '{}',    -- proyector, pantalla… / contraseña, licencia…
  ubicacion       text not null default '',
  persona         text not null check (length(trim(persona)) > 0),   -- persona afectada o de contacto
  titulo          text not null check (length(trim(titulo)) between 3 and 120),
  descripcion     text not null check (length(trim(descripcion)) >= 10),
  prioridad       text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  estado          text not null default 'abierta' check (estado in ('abierta', 'en_proceso', 'pausada', 'cerrada')),
  asignado_email  text,
  asignado_nombre text,
  creado_por      text not null default email_jwt(),
  creado_nombre   text not null default '',
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now(),
  cerrado         timestamptz
);
create index if not exists inc_incidencias_estado_idx on inc_incidencias (estado, creado desc);
create index if not exists inc_incidencias_creador_idx on inc_incidencias (creado_por);

-- 6. Historial de cada incidencia: comentarios y cambios (estado, prioridad, responsable)
create table if not exists inc_eventos (
  id             bigint generated always as identity primary key,
  incidencia_id  bigint not null references inc_incidencias(id) on delete cascade,
  tipo           text not null default 'comentario' check (tipo in ('creada', 'comentario', 'estado', 'prioridad', 'asignacion')),
  texto          text not null default '',
  de             text,
  a              text,
  autor          text not null default email_jwt(),
  autor_nombre   text not null default inc_nombre_jwt(),
  creado         timestamptz not null default now()
);
create index if not exists inc_eventos_inc_idx on inc_eventos (incidencia_id, creado);

-- 7. Adjuntos (fotos, PDF…). El archivo está en Storage («inc-adjuntos»); aquí, sus datos.
create table if not exists inc_adjuntos (
  id             bigint generated always as identity primary key,
  incidencia_id  bigint not null references inc_incidencias(id) on delete cascade,
  evento_id      bigint references inc_eventos(id) on delete set null,
  ruta           text not null unique,
  nombre         text not null,
  tipo           text not null default '',
  tamano         int  not null default 0,
  creado_por     text not null default email_jwt(),
  creado         timestamptz not null default now()
);
create index if not exists inc_adjuntos_inc_idx on inc_adjuntos (incidencia_id);

-- 8. Comprobaciones al crear o cambiar una incidencia (no se pueden saltar desde la web)
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

drop trigger if exists inc_incidencias_antes on inc_incidencias;
create trigger inc_incidencias_antes before insert or update on inc_incidencias
  for each row execute function inc_antes();

-- Cada cambio queda apuntado en el historial con quién y cuándo
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
  if new.asignado_email is distinct from old.asignado_email then
    insert into inc_eventos (incidencia_id, tipo, de, a, autor, autor_nombre)
    values (new.id, 'asignacion', old.asignado_nombre, new.asignado_nombre, email_jwt(), inc_nombre_jwt());
  end if;
  return new;
end $$;

drop trigger if exists inc_incidencias_despues on inc_incidencias;
create trigger inc_incidencias_despues after insert or update on inc_incidencias
  for each row execute function inc_despues();

-- Personas para el responsable (técnicos y administración) y para «persona afectada» (lista del claustro)
drop function if exists inc_gestores();
create function inc_gestores() returns table (email text, nombre text, rol text, categorias text[])
language sql stable security definer set search_path = public as $$
  select p.email, coalesce(pe.nombre, ''), p.rol,
         coalesce((select array_agg(c.categoria order by c.categoria) from inc_tecnico_categorias c where c.email = p.email), '{}')
  from permisos p left join personal pe on pe.email = p.email
  where p.web = 'incidencias' and p.rol in ('admin', 'tecnico') and es_profesorado()
  order by 2, 1
$$;
create or replace function inc_personal() returns table (email text, nombre text)
language sql stable security definer set search_path = public as $$
  select pe.email, pe.nombre from personal pe where es_profesorado() and coalesce(pe.activo, true) and coalesce(pe.nombre, '') <> '' order by pe.nombre
$$;
grant execute on function inc_gestores(), inc_personal() to authenticated;

-- 9. Seguridad: todo el profesorado (cuentas del colegio) ve; cada rol hace lo suyo
alter table inc_ubicaciones enable row level security;
alter table inc_incidencias enable row level security;
alter table inc_eventos     enable row level security;
alter table inc_adjuntos    enable row level security;
alter table inc_tecnico_categorias enable row level security;

drop policy if exists "ver categorias de tecnicos"       on inc_tecnico_categorias;
drop policy if exists "gestionar categorias de tecnicos" on inc_tecnico_categorias;
create policy "ver categorias de tecnicos" on inc_tecnico_categorias for select to authenticated using (es_profesorado());
create policy "gestionar categorias de tecnicos" on inc_tecnico_categorias for all to authenticated
  using (inc_es_admin()) with check (inc_es_admin() and es_cuenta_colegio(email));
grant select, insert, delete on inc_tecnico_categorias to authenticated;
revoke all on inc_tecnico_categorias from anon;

drop policy if exists "ver ubicaciones"       on inc_ubicaciones;
drop policy if exists "gestionar ubicaciones" on inc_ubicaciones;
create policy "ver ubicaciones" on inc_ubicaciones for select to authenticated using (es_profesorado());
create policy "gestionar ubicaciones" on inc_ubicaciones for all to authenticated
  using (inc_es_admin()) with check (inc_es_admin());

drop policy if exists "ver incidencias"    on inc_incidencias;
drop policy if exists "crear incidencia"   on inc_incidencias;
drop policy if exists "cambiar incidencia" on inc_incidencias;
drop policy if exists "borrar incidencia"  on inc_incidencias;
create policy "ver incidencias" on inc_incidencias for select to authenticated using (es_profesorado());
create policy "crear incidencia" on inc_incidencias for insert to authenticated
  with check (inc_puede_crear() and creado_por = email_jwt());
create policy "cambiar incidencia" on inc_incidencias for update to authenticated
  using (inc_gestiona(categoria) or (creado_por = email_jwt() and estado = 'abierta'))
  with check (inc_gestiona(categoria) or creado_por = email_jwt());
create policy "borrar incidencia" on inc_incidencias for delete to authenticated using (inc_es_admin());

drop policy if exists "ver historial"     on inc_eventos;
drop policy if exists "comentar"          on inc_eventos;
drop policy if exists "borrar comentario" on inc_eventos;
create policy "ver historial" on inc_eventos for select to authenticated using (es_profesorado());
create policy "comentar" on inc_eventos for insert to authenticated
  with check (tipo = 'comentario' and autor = email_jwt() and length(trim(texto)) > 0
    and exists (select 1 from inc_incidencias i where i.id = incidencia_id and (inc_gestiona(i.categoria) or i.creado_por = email_jwt())));
create policy "borrar comentario" on inc_eventos for delete to authenticated
  using (tipo = 'comentario' and (inc_es_admin() or autor = email_jwt()));

drop policy if exists "ver adjuntos"    on inc_adjuntos;
drop policy if exists "subir adjunto"   on inc_adjuntos;
drop policy if exists "borrar adjunto"  on inc_adjuntos;
create policy "ver adjuntos" on inc_adjuntos for select to authenticated using (es_profesorado());
create policy "subir adjunto" on inc_adjuntos for insert to authenticated
  with check (creado_por = email_jwt()
    and exists (select 1 from inc_incidencias i where i.id = incidencia_id and (inc_gestiona(i.categoria) or i.creado_por = email_jwt())));
create policy "borrar adjunto" on inc_adjuntos for delete to authenticated
  using (inc_es_admin() or creado_por = email_jwt());

grant select on inc_ubicaciones, inc_incidencias, inc_eventos, inc_adjuntos to authenticated;
grant insert, update, delete on inc_ubicaciones, inc_incidencias, inc_eventos, inc_adjuntos to authenticated;
grant usage on sequence inc_ubicaciones_id_seq to authenticated;
revoke all on inc_ubicaciones, inc_incidencias, inc_eventos, inc_adjuntos from anon;

-- 10. Carpeta privada de adjuntos (10 MB por archivo). Solo se abren con sesión iniciada.
insert into storage.buckets (id, name, public, file_size_limit)
values ('inc-adjuntos', 'inc-adjuntos', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;
drop policy if exists inc_adjuntos_ver    on storage.objects;
drop policy if exists inc_adjuntos_subir  on storage.objects;
drop policy if exists inc_adjuntos_borrar on storage.objects;
create policy inc_adjuntos_ver on storage.objects for select to authenticated
  using (bucket_id = 'inc-adjuntos' and es_profesorado());
create policy inc_adjuntos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'inc-adjuntos' and inc_puede_crear());
create policy inc_adjuntos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'inc-adjuntos' and (inc_es_admin() or owner = auth.uid()));

-- 11. Cuentas de administración de partida (las demás se dan desde la web).
--     mangeles.chavez es provisional, mientras se pone en marcha: se quita después desde la web.
insert into permisos (email, web, rol) values
  ('administracionnervion@salesianas.org', 'incidencias', 'admin'),
  ('laura.ramos@salesianas.org',           'incidencias', 'admin'),
  ('mangeles.chavez@salesianas.org',       'incidencias', 'admin')
on conflict do nothing;

-- 12. Aulas y zonas de partida (se editan desde Administración → Aulas y zonas)
insert into inc_ubicaciones (tipo, grupo, nombre, orden)
select v.tipo, v.grupo, v.nombre, v.orden from (values
  ('aula', 'Infantil', 'Infantil 3 años A', 101), ('aula', 'Infantil', 'Infantil 3 años B', 102),
  ('aula', 'Infantil', 'Infantil 4 años A', 103), ('aula', 'Infantil', 'Infantil 4 años B', 104),
  ('aula', 'Infantil', 'Infantil 5 años A', 105), ('aula', 'Infantil', 'Infantil 5 años B', 106),
  ('aula', 'Primaria', '1º Primaria A', 201), ('aula', 'Primaria', '1º Primaria B', 202),
  ('aula', 'Primaria', '2º Primaria A', 203), ('aula', 'Primaria', '2º Primaria B', 204),
  ('aula', 'Primaria', '3º Primaria A', 205), ('aula', 'Primaria', '3º Primaria B', 206),
  ('aula', 'Primaria', '4º Primaria A', 207), ('aula', 'Primaria', '4º Primaria B', 208),
  ('aula', 'Primaria', '5º Primaria A', 209), ('aula', 'Primaria', '5º Primaria B', 210),
  ('aula', 'Primaria', '6º Primaria A', 211), ('aula', 'Primaria', '6º Primaria B', 212),
  ('aula', 'ESO', '1º ESO A', 301), ('aula', 'ESO', '1º ESO B', 302),
  ('aula', 'ESO', '2º ESO A', 303), ('aula', 'ESO', '2º ESO B', 304),
  ('aula', 'ESO', '3º ESO A', 305), ('aula', 'ESO', '3º ESO B', 306),
  ('aula', 'ESO', '4º ESO A', 307), ('aula', 'ESO', '4º ESO B', 308),
  ('aula', 'Bachillerato', '1º Bach. A', 401), ('aula', 'Bachillerato', '1º Bach. B', 402),
  ('aula', 'Bachillerato', '2º Bach. A', 403), ('aula', 'Bachillerato', '2º Bach. B', 404),
  ('aula', 'Aulas específicas', 'Aula de Informática', 501), ('aula', 'Aulas específicas', 'Laboratorio', 502),
  ('aula', 'Aulas específicas', 'Aula de Música', 503), ('aula', 'Aulas específicas', 'Aula de PT / AL', 504),
  ('zona', 'Zonas comunes', 'Salón de Actos', 601), ('zona', 'Zonas comunes', 'Biblioteca', 602),
  ('zona', 'Zonas comunes', 'Capilla', 603), ('zona', 'Zonas comunes', 'Gimnasio', 604),
  ('zona', 'Zonas comunes', 'Patio azul (ESO)', 605), ('zona', 'Zonas comunes', 'Patio gris (Bach.)', 606),
  ('zona', 'Zonas comunes', 'Patio de Infantil y Primaria', 607), ('zona', 'Zonas comunes', 'Pasillos y escaleras', 608),
  ('zona', 'Zonas comunes', 'Baños', 609), ('zona', 'Zonas comunes', 'Comedor', 610),
  ('zona', 'Despachos y servicios', 'Recibidor', 701), ('zona', 'Despachos y servicios', 'Portería', 702),
  ('zona', 'Despachos y servicios', 'Secretaría', 703), ('zona', 'Despachos y servicios', 'Administración', 704),
  ('zona', 'Despachos y servicios', 'Despacho de Dirección', 705), ('zona', 'Despachos y servicios', 'Sala de profesores', 706),
  ('zona', 'Despachos y servicios', 'Departamento de Orientación', 707), ('zona', 'Despachos y servicios', 'Reprografía', 708)
) as v(tipo, grupo, nombre, orden)
where not exists (select 1 from inc_ubicaciones)
on conflict (nombre) do nothing;

commit;

notify pgrst, 'reload schema';

-- Comprobación: deben salir 3 permisos y 52 aulas y zonas
select 'permisos incidencias' as que, count(*)::text as n from permisos where web = 'incidencias'
union all select 'aulas y zonas', count(*)::text from inc_ubicaciones;
