-- ─── Incidencias · avisos por correo con Microsoft 365 ─────────────────────────
-- Se ejecuta en el Supabase común «Acceso Microsoft 365», en SQL Editor, DESPUÉS de schema.sql.
-- Cada vez que se apunta algo en el historial (inc_eventos), la base de datos decide a quién avisar, escribe el
-- correo (asunto y texto) y se lo pasa a un flujo de Power Automate de una cuenta del colegio. El flujo lo envía
-- desde esa cuenta de Microsoft 365 con «Enviar un correo electrónico (V2)» (ver README.md):
--   · incidencia nueva                                      → administración (con todos los datos)
--   · cambio de estado, prioridad, responsable, comentario  → quien la creó (qué ha cambiado)
--   · técnico asignado                                      → el técnico (con la descripción completa)
-- A quien hace el cambio no se le avisa de lo suyo. Si el aviso falla, la incidencia se guarda igual.
-- La dirección del flujo se guarda en inc_avisos_ajustes ('url'); sin ella no se envía nada.
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
-- La versión anterior enviaba por el Portal del profesorado (Resend → buzón web@ de Google): se deja de usar
update inc_avisos_ajustes set valor = '' where clave = 'url' and valor like '%claustro-utilidades.vercel.app%';

-- 3. A quién se avisa de cada apunte del historial (a quien hace el cambio no se le avisa de lo suyo):
--    · creada                                       → administración («nueva», con todos los datos)
--    · estado, prioridad, responsable o comentario  → quien la creó («actualizacion»)
--    · responsable nuevo                            → además, el técnico asignado («asignada», con la descripción)
drop function if exists inc_avisos_destinatarios(inc_eventos);
create or replace function inc_avisos_envios(ev inc_eventos) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  inc inc_incidencias; autor text := lower(coalesce(ev.autor, '')); admins text[]; envios jsonb := '[]';
begin
  select * into inc from inc_incidencias where id = ev.incidencia_id;
  if not found then return envios; end if;
  if ev.tipo = 'creada' then
    select array_agg(distinct lower(email) order by lower(email)) into admins
      from permisos where web = 'incidencias' and rol = 'admin' and lower(email) <> autor;
    if coalesce(cardinality(admins), 0) > 0 then
      envios := envios || jsonb_build_object('modo', 'nueva', 'para', to_jsonb(admins));
    end if;
  elsif ev.tipo in ('estado', 'prioridad', 'asignacion', 'comentario') then
    if lower(inc.creado_por) <> autor then
      envios := envios || jsonb_build_object('modo', 'actualizacion', 'para', jsonb_build_array(lower(inc.creado_por)));
    end if;
    if ev.tipo = 'asignacion' and inc.asignado_email is not null and lower(inc.asignado_email) <> autor then
      envios := envios || jsonb_build_object('modo', 'asignada', 'para', jsonb_build_array(lower(inc.asignado_email)));
    end if;
  end if;
  return envios;
end $$;
revoke all on function inc_avisos_envios(inc_eventos) from public, anon, authenticated;

-- 4. El correo: asunto y texto (HTML sencillo con los colores del colegio)
create or replace function inc_html(t text) returns text
language sql immutable as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

create or replace function inc_aviso_correo(modo text, ev inc_eventos, inc inc_incidencias) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  estados jsonb := '{"abierta":"Abierta","en_proceso":"En proceso","pausada":"Pausada (piezas)","cerrada":"Cerrada"}';
  prios   jsonb := '{"baja":"Baja","media":"Media","alta":"Alta / crítica"}';
  cats    jsonb := '{"informatica":"Informática y tecnología","mobiliario":"Mobiliario y equipamiento","infraestructura":"Infraestructura y mantenimiento","fungibles":"Fungibles"}';
  num text := '#' || lpad(inc.id::text, 4, '0');
  categoria text := coalesce(cats ->> inc.categoria, inc.categoria);
  quien text := coalesce(nullif(ev.autor_nombre, ''), ev.autor, 'Alguien');
  enlace text := 'https://incidencias-nervion.vercel.app/#inc-' || inc.id;
  etiqueta text; frase text; extra text := ''; datos text[][]; filas text := ''; i int;
begin
  if modo = 'nueva' then
    etiqueta := 'Nueva'; frase := quien || ' ha creado una incidencia nueva.';
  elsif modo = 'asignada' then
    etiqueta := 'Asignada'; frase := quien || ' te ha asignado esta incidencia.';
  elsif ev.tipo = 'estado' then
    etiqueta := 'Estado: ' || coalesce(estados ->> ev.a, ev.a);
    frase := quien || ' ha cambiado el estado de tu incidencia: ' || coalesce(estados ->> ev.de, ev.de) || ' → ' || coalesce(estados ->> ev.a, ev.a) || '.';
  elsif ev.tipo = 'prioridad' then
    etiqueta := 'Prioridad';
    frase := quien || ' ha cambiado la prioridad asignada a tu incidencia: ' || coalesce(prios ->> ev.de, ev.de) || ' → ' || coalesce(prios ->> ev.a, ev.a) || '.';
  elsif ev.tipo = 'asignacion' then
    etiqueta := 'Responsable';
    frase := case when ev.a is null then quien || ' ha quitado el responsable de tu incidencia.'
                  else quien || ' ha asignado tu incidencia a ' || ev.a || '.' end;
  else
    etiqueta := 'Comentario'; frase := quien || ' ha comentado en tu incidencia:'; extra := coalesce(ev.texto, '');
  end if;

  datos := array[
    array['Incidencia', num || ' · ' || inc.titulo],
    array['Estado', coalesce(estados ->> inc.estado, inc.estado)],
    array['Prioridad asignada', coalesce(prios ->> inc.prioridad, inc.prioridad)],
    array['Urgencia indicada', coalesce(prios ->> inc.urgencia, inc.urgencia)],
    array['Tipo', concat_ws(' › ', categoria, inc.subcategoria, nullif(array_to_string(inc.elementos, ', '), ''))],
    array['Dónde', coalesce(nullif(inc.ubicacion, ''), '—')],
    array['Persona', inc.persona],
    array['Creada por', coalesce(nullif(inc.creado_nombre, ''), inc.creado_por)],
    array['Responsable', coalesce(inc.asignado_nombre, 'Sin asignar')]];
  if modo <> 'actualizacion' then datos := datos || array[array['Descripción', inc.descripcion]]; end if;
  for i in 1 .. array_length(datos, 1) loop
    filas := filas || '<tr><th align="left" valign="top" style="border:1px solid #dde4e7;background:#f3f7f9;width:150px">'
      || datos[i][1] || '</th><td style="border:1px solid #dde4e7;white-space:pre-wrap">' || inc_html(datos[i][2]) || '</td></tr>';
  end loop;

  return jsonb_build_object(
    'asunto', left('Incidencias | [' || categoria || '] [' || etiqueta || '] ' || num || ' · ' || inc.titulo, 250),
    'html', '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1d2a30;max-width:620px">'
      || '<p style="font-size:15px;margin:0 0 12px">' || inc_html(frase) || '</p>'
      || case when extra <> '' then '<blockquote style="margin:0 0 16px;padding:10px 14px;border-left:4px solid #009abb;background:#f3f7f9;white-space:pre-wrap">' || inc_html(extra) || '</blockquote>' else '' end
      || '<table cellpadding="7" style="border-collapse:collapse;font-size:14px;width:100%">' || filas || '</table>'
      || '<p style="margin:18px 0"><a href="' || enlace || '" style="background:#009abb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">Abrir la incidencia</a></p>'
      || '<p style="color:#6b7b82;font-size:12px;margin:0">Aviso automático de la web de Incidencias · Escuelas Salesianas María Auxiliadora · Nervión.</p></div>');
end $$;
revoke all on function inc_aviso_correo(text, inc_eventos, inc_incidencias) from public, anon, authenticated;

-- 5. Al apuntar algo en el historial, se manda un correo por cada destinatario de la lista del paso 3.
--    El flujo recibe: para (direcciones separadas por «;»), asunto, html y responder_a (quien hizo el cambio).
create or replace function inc_avisar() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  url text; activo text; inc inc_incidencias; x jsonb; correo jsonb;
begin
  if new.tipo not in ('creada', 'estado', 'prioridad', 'asignacion', 'comentario') then return new; end if;
  select valor into url    from inc_avisos_ajustes where clave = 'url';
  select valor into activo from inc_avisos_ajustes where clave = 'activo';
  if coalesce(url, '') = '' or coalesce(activo, 'si') <> 'si' then return new; end if;
  select * into inc from inc_incidencias where id = new.incidencia_id;

  for x in select * from jsonb_array_elements(inc_avisos_envios(new)) loop
    correo := inc_aviso_correo(x ->> 'modo', new, inc);
    perform net.http_post(
      url := url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'para', (select string_agg(value, ';') from jsonb_array_elements_text(x -> 'para')),
        'asunto', correo ->> 'asunto',
        'html', correo ->> 'html',
        'responder_a', lower(coalesce(new.autor, '')),
        'modo', x ->> 'modo',
        'incidencia', inc.id),
      timeout_milliseconds := 10000
    );
  end loop;
  return new;
exception when others then
  raise warning 'Aviso de incidencias no enviado: %', sqlerrm;  -- la incidencia se guarda igual
  return new;
end $$;

drop trigger if exists inc_eventos_avisar on inc_eventos;
create trigger inc_eventos_avisar after insert on inc_eventos
  for each row execute function inc_avisar();

commit;

-- Comprobación: los avisos deben estar activos («si»). La dirección del flujo no se muestra entera.
select clave, case when clave = 'url' then (case when valor = '' then '(sin poner)' else left(valor, 40) || '…' end)
                   else coalesce(nullif(valor, ''), '(sin poner)') end as valor
from inc_avisos_ajustes order by clave;
