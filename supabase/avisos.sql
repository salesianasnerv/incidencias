-- ─── Incidencias · avisos por correo ─────────────────────────────────────────
-- Se ejecuta en el Supabase común «Acceso Microsoft 365», en SQL Editor, DESPUÉS de schema.sql.
-- Cada vez que se apunta algo en el historial (inc_eventos), la base de datos decide a quién avisar
-- y llama a la función «api/aviso-incidencia.js» del Portal del profesorado (claustro-utilidades.vercel.app),
-- que envía el correo con la misma cuenta de Resend que las propuestas del portal:
--   · incidencia nueva       → administración y los técnicos de esa categoría (permisos web = 'incidencias')
--   · cambio de estado        → quien la creó
--   · comentario              → quien la creó
-- A quien hace el cambio no se le avisa de lo suyo. Si el aviso falla, la incidencia se guarda igual.
-- Mientras Resend no tenga dominio verificado, todos los avisos llegan a web@nervion.salesianas.org
-- (con «Avisar a» dentro) y desde ese buzón se reenvían con reglas de Outlook (ver README.md).
-- La dirección de la función (y, si algún día hace falta, la clave secreta) están en inc_avisos_ajustes.
-- Se puede volver a ejecutar sin perder datos.

begin;

-- 1. pg_net: permite a la base de datos llamar a una dirección web (se envía al terminar la operación)
create extension if not exists pg_net with schema extensions;

-- 2. Ajustes de los avisos. Nadie los ve desde la web (ni siquiera administración).
create table if not exists inc_avisos_ajustes (
  clave  text primary key check (clave in ('url', 'secreto', 'activo')),
  valor  text not null default ''
);
alter table inc_avisos_ajustes enable row level security;
revoke all on inc_avisos_ajustes from anon, authenticated;
insert into inc_avisos_ajustes (clave, valor) values ('url', ''), ('secreto', ''), ('activo', 'si')
on conflict (clave) do nothing;
-- Función de envío del Portal del profesorado (si no hay otra puesta)
update inc_avisos_ajustes set valor = 'https://claustro-utilidades.vercel.app/api/aviso-incidencia' where clave = 'url' and valor = '';

-- 3. Quién recibe el aviso de cada apunte del historial (sirve también para comprobarlo a mano)
create or replace function inc_avisos_destinatarios(ev inc_eventos) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct d.email order by d.email), '{}') from (
    -- Incidencia nueva: administración y los técnicos de esa categoría (o los que no tienen categorías: atienden todas)
    select lower(p.email) as email from permisos p, inc_incidencias i
     where ev.tipo = 'creada' and i.id = ev.incidencia_id and p.web = 'incidencias'
       and (p.rol = 'admin'
            or (p.rol = 'tecnico' and (not exists (select 1 from inc_tecnico_categorias c where c.email = p.email)
                                       or exists (select 1 from inc_tecnico_categorias c where c.email = p.email and c.categoria = i.categoria))))
    union
    select lower(i.creado_por) from inc_incidencias i
     where ev.tipo in ('estado', 'comentario') and i.id = ev.incidencia_id
  ) d
  where d.email <> lower(coalesce(ev.autor, '')) and d.email like '%@%'
$$;
revoke all on function inc_avisos_destinatarios(inc_eventos) from public, anon, authenticated;

-- 4. Al apuntar algo en el historial, se manda el aviso
create or replace function inc_avisar() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  url text; secreto text; activo text; para text[]; inc inc_incidencias;
begin
  if new.tipo not in ('creada', 'estado', 'comentario') then return new; end if;
  select valor into url     from inc_avisos_ajustes where clave = 'url';
  select valor into secreto from inc_avisos_ajustes where clave = 'secreto';
  select valor into activo  from inc_avisos_ajustes where clave = 'activo';
  if coalesce(url, '') = '' or coalesce(activo, 'si') <> 'si' then return new; end if;

  para := inc_avisos_destinatarios(new);
  if cardinality(para) = 0 then return new; end if;
  select * into inc from inc_incidencias where id = new.incidencia_id;

  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-avisos-secreto', coalesce(secreto, '')),
    body := jsonb_build_object(
      'para', to_jsonb(para),
      'evento', jsonb_build_object('tipo', new.tipo, 'texto', new.texto, 'de', new.de, 'a', new.a,
                                   'autor', new.autor, 'autor_nombre', new.autor_nombre, 'creado', new.creado),
      'incidencia', jsonb_build_object('id', inc.id, 'categoria', inc.categoria, 'subcategoria', inc.subcategoria,
                                       'elementos', to_jsonb(inc.elementos), 'ubicacion', inc.ubicacion,
                                       'persona', inc.persona, 'titulo', inc.titulo, 'descripcion', inc.descripcion,
                                       'prioridad', inc.prioridad, 'urgencia', inc.urgencia, 'estado', inc.estado,
                                       'asignado_nombre', inc.asignado_nombre,
                                       'creado_por', inc.creado_por, 'creado_nombre', inc.creado_nombre)
    ),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  raise warning 'Aviso de incidencias no enviado: %', sqlerrm;  -- la incidencia se guarda igual
  return new;
end $$;

drop trigger if exists inc_eventos_avisar on inc_eventos;
create trigger inc_eventos_avisar after insert on inc_eventos
  for each row execute function inc_avisar();

commit;

-- Comprobación: la dirección de la función debe estar puesta y los avisos, activos («si»).
-- El secreto no se muestra; solo si está puesto o no.
select clave, case when clave = 'secreto' then (case when valor = '' then '(sin poner)' else '(puesto)' end)
                   else coalesce(nullif(valor, ''), '(sin poner)') end as valor
from inc_avisos_ajustes order by clave;
