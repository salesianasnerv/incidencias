# Incidencias

Web de incidencias con tickets para el colegio. Se entra con la cuenta de Microsoft 365 del colegio.

## Quién hace qué

| Rol | Qué puede hacer |
|---|---|
| **Profesorado** (resto de cuentas del colegio) | **Sin acceso** desde el 21-10-2026: al entrar ven «No tienes acceso». Si necesitan avisar de algo, se lo dicen a su coordinador/a. |
| **Coordinador/a** | Además, crear incidencias. En las suyas puede añadir comentarios y fotos, y corregir los datos mientras siguen abiertas. |
| **Técnico/a** | Además, atender las incidencias **de sus categorías** (informática, mobiliario, infraestructura, fungibles): estado, prioridad, responsable («Asignármela»), comentarios y fotos. Las categorías se marcan en cada técnico; sin ninguna marcada, atiende todas. |
| **Administración** | Atiende todas las incidencias y tiene el menú *Administración*: **panel de control** (cada cifra se pulsa y lista sus incidencias, que se abren para gestionarlas), descarga para Excel, aulas y zonas, y quién tiene cada rol y qué categorías atiende cada técnico. Puede borrar incidencias. |

Los roles se dan en *Administración → Coordinación, técnicos y administración*. Al empezar tienen Administración administracionnervion@salesianas.org y laura.ramos@salesianas.org, y de forma provisional mangeles.chavez@salesianas.org (se quita desde esa misma pantalla cuando todo funcione).

## Cómo es una incidencia

- **¿Qué ocurre?** Categoría (Informática y tecnología, Mobiliario y equipamiento, Infraestructura y mantenimiento, Fungibles), subcategoría y qué falla exactamente (proyector, pantalla, contraseña olvidada, folios…). Las listas están en `config.js` y se pueden ampliar sin tocar nada más.
- **¿Dónde?** El aula o la zona exacta, de la lista de *Aulas y zonas* (o «Otra», escrita a mano). Es **obligatorio**, salvo en las cuentas de Microsoft 365 y Google Workspace, donde es opcional.
- **Persona** afectada o de contacto (con sugerencias de la lista del claustro), **resumen**, **descripción detallada** y **prioridad**: Baja, Media o Alta/crítica. Todo obligatorio.
- **Foto o archivo** (opcional, hasta 5): desde el móvil se puede hacer la foto en el momento. Las fotos se reducen solas (unos 300 KB) antes de subirse.
- **Estados:** Abierta → En proceso → Pausada (piezas) → Cerrada. Cada cambio de estado, prioridad o responsable queda en el **historial**, con quién y cuándo, junto a los comentarios.
- Cada incidencia tiene un número (#0012) y un enlace propio (*Copiar enlace*), para pasarlo por Teams o por correo.

## Probarla ahora (modo prueba)

Con `supabaseUrl` vacío en `config.js` (como está ahora), la web funciona sin servidor y guarda los datos solo en tu navegador. En la franja naranja de arriba se elige **«Entrar como»** (Profesor/a, Coordinador/a, Técnico/a, Administración) para ver la web con cada rol, y **«Generar incidencias de ejemplo»**.

## Ponerla en marcha (reutiliza el Supabase del Control de baños)

Las tablas de esta web empiezan por `inc_` y no tocan las de las demás webs. Los roles van a la lista común `permisos` (web `incidencias`). Como ese proyecto ya tiene el acceso con Microsoft 365, **no hace falta pedir nada a informática**.

1. **Base de datos.** En https://supabase.com, abre el proyecto «Acceso Microsoft 365» → *SQL Editor*. Pega y ejecuta `supabase/schema.sql` (en una base de datos que ya tenía la primera versión, basta con `supabase/cambios-19-10-2026.sql` y `supabase/cambios-21-10-2026.sql`). Al final deben salir 3 permisos y 52 aulas y zonas. También crea la carpeta privada de adjuntos (`inc-adjuntos`, en *Storage*). Se puede volver a ejecutar sin perder datos.
2. **Publicar.** Sube esta carpeta a un repositorio nuevo de GitHub (por ejemplo, `incidencias-nervion`). En https://vercel.com → *Add New → Project*, impórtalo. *Framework Preset*: **Other**, sin comando de compilación.
3. **Permitir la vuelta tras el login.** En Supabase → *Authentication → URL Configuration → Redirect URLs*, añade `https://incidencias-nervion.vercel.app/**` (con tu dirección). **No cambies la *Site URL***, porque es la del Control de baños.
4. **Modo real.** `config.js` ya apunta al Supabase común. Para volver al modo prueba, deja vacíos `supabaseUrl` y `supabaseAnonKey`.
5. Entra con tu cuenta y, en *Administración*:
   - revisa **Aulas y zonas** (la lista de partida incluye Infantil, Primaria, ESO, Bachillerato, aulas específicas y zonas comunes; desactiva las que no existan y añade las que falten, por ejemplo las de FP);
   - da los roles de **coordinación**, **técnicos** y **administración**.
6. Si la dirección final no es `incidencias-nervion.vercel.app`, cámbiala en las etiquetas `og:` de `index.html`.
7. Añádela a https://claustro-utilidades.vercel.app/ (apartado General) y, si se quiere, como app de Teams («0 - Apps de Teams»).
8. Si se quieren avisos por correo, sigue el apartado siguiente.

## Avisos por correo

**Desde la cuenta de cada persona (Outlook).** Al crear una incidencia sale **Avisar a administración**, y al asignar un técnico, **Avisar al técnico**. Abren Outlook en la web con el correo ya escrito (para administración o el técnico, con copia a quien la creó); solo hay que pulsar *Enviar*. Los mismos botones están en la ficha de cada incidencia. Si alguien usa el programa de correo del ordenador, hay un enlace para abrirlo con él.

**Aviso automático de respaldo.** Además, la base de datos manda siempre un aviso al buzón `web@` (abajo), por si no se envía el de Outlook.

Avisan de lo que pasa con cada incidencia:

- **Incidencia nueva** → administración y los técnicos de esa categoría.
- **Cambio de estado** y **comentario** → quien la creó.

A quien hace el cambio no le llega aviso de lo suyo. Los cambios de prioridad o de responsable no avisan. El correo lleva los datos de la incidencia y el botón **Abrir la incidencia**.

**Cómo funciona.** Al apuntarse algo en el historial, la base de datos (`supabase/avisos.sql`) decide a quién avisar y llama a la función `api/aviso-incidencia.js` del **Portal del profesorado** (claustro-utilidades.vercel.app). Esa función usa la misma cuenta de Resend que las propuestas del portal, así que no hay claves que configurar. Si el correo falla, la incidencia se guarda igual.

**Buzón central.** Resend no tiene dominio verificado, así que solo puede enviar a `web@nervion.salesianas.org`: **todos los avisos llegan ahí**, con el asunto `Incidencias | [Categoría] [Nueva/Estado/Comentario] #0012 · Título` y, dentro, la fila **«Avisar a»**. Desde ese buzón se reenvían con reglas de Outlook:

- Todos a administración: *Configuración → Correo → Reglas → Agregar regla*. Condición: **El asunto incluye** `Incidencias |`. Acción: **Reenviar a** `administracionnervion@salesianas.org`.
- A cada técnico, si se quiere: otra regla con **El asunto incluye** `[Informática y tecnología]` (o `[Mobiliario y equipamiento]`, `[Infraestructura y mantenimiento]`, `[Fungibles]`) y **Reenviar a** su correo.

**Ponerlo en marcha.** En Supabase → *SQL Editor*, ejecutar `supabase/avisos.sql` (una vez). Ya deja puesta la dirección de la función del portal.

**Si algún día se verifica un dominio en Resend** (registros DNS de `nervion.salesianas.org`): en el proyecto de Vercel del portal, poner `PROPUESTAS_DE` (o `AVISOS_DE`) con un remitente de ese dominio y `AVISOS_SECRETO` con una clave larga, y la misma clave en Supabase: `update inc_avisos_ajustes set valor = '…' where clave = 'secreto';` (no guardarla en ningún archivo). Desde ese momento cada aviso va directamente a cada persona.

**Comprobar.** Para ver las últimas llamadas y su respuesta: `select created, status_code, content from net._http_response order by created desc limit 10;` En Resend → *Emails* se ve cada correo enviado.

## Seguridad

- Solo pueden entrar cuentas **@salesianas.org** (y @salesianes.org). Las reglas están en la base de datos (`supabase/schema.sql`), así que no se pueden saltar desde la web.
- Solo coordinación, técnicos y administración crean incidencias, y cada una queda a nombre de quien la crea. Solo técnicos y administración cambian el estado o el responsable; el historial lo escribe la propia base de datos.
- Las fotos y archivos están en una carpeta **privada** de Supabase: solo se ven con sesión iniciada y mediante enlaces que caducan en una hora.
- Los avisos por correo los manda la base de datos a través del portal. Mientras solo puedan ir a `web@nervion.salesianas.org`, la función del portal no necesita clave (lo peor que se podría hacer es mandar correos a ese buzón, como con el formulario de propuestas); cuando envíe a cada persona, exige la clave secreta.
- Al borrar una incidencia (solo Administración) se borran también su historial y sus archivos. Si está resuelta, mejor cerrarla.
