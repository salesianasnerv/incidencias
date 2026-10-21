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

## Avisos por correo (Microsoft 365)

Son automáticos, sin botones:

- **Incidencia nueva** → administración, con todos los datos.
- **Cambio de estado, prioridad, responsable o comentario** → quien la creó.
- **Técnico asignado** → el técnico, con la descripción completa.

A quien hace el cambio no le llega aviso de lo suyo. El correo lleva los datos y el botón **Abrir la incidencia**; si se responde, la respuesta le llega a quien hizo el cambio.

**Cómo funciona.** La base de datos (`supabase/avisos.sql`) decide a quién avisar, escribe el correo y se lo pasa a un **flujo de Power Automate** de una cuenta del colegio (mejor `administracionnervion@salesianas.org`). El flujo lo envía desde esa cuenta con Outlook. Si el correo falla, la incidencia se guarda igual. No se usa Resend ni ningún buzón de Google.

### Crear el flujo (una sola vez, con la cuenta que enviará los correos)

1. Entra en https://make.powerautomate.com con esa cuenta → **Crear** → **Flujo de nube automatizado** → **Omitir**.
2. Disparador: busca **«Cuando se recibe una solicitud de webhook de Teams»** (*When a Teams webhook request is received*). En **Quién puede desencadenar el flujo** elige **Cualquiera**.
3. **+ Nuevo paso** → **Office 365 Outlook** → **Enviar un correo electrónico (V2)**. En cada campo, pestaña **Expresión** (o el botón *fx*):
   - **Para:** `triggerBody()?['para']`
   - **Asunto:** `triggerBody()?['asunto']`
   - **Cuerpo:** `triggerBody()?['html']`
   - En **Mostrar opciones avanzadas** → **Responder a:** `triggerBody()?['responder_a']`
4. Nombre: «Avisos de Incidencias» → **Guardar**. Vuelve a abrir el disparador y **copia la dirección HTTP** que aparece.
5. En Supabase → *SQL Editor*, pega esa dirección entre las comillas y ejecútalo (**no la guardes en ningún archivo ni la subas a GitHub**: quien la tenga puede enviar correos con ese flujo):
   ```sql
   update inc_avisos_ajustes set valor = 'PEGA-AQUÍ-LA-DIRECCIÓN-DEL-FLUJO' where clave = 'url';
   ```

**Ponerlo en marcha:** ejecutar `supabase/avisos.sql` (una vez) y hacer los pasos de arriba.

**Comprobar.** En Power Automate → *Mis flujos* → «Avisos de Incidencias» se ve cada ejecución. En Supabase: `select created, status_code, left(content, 200) from net._http_response order by created desc limit 10;` (202 = el flujo lo ha recibido).
**Pausar los avisos:** `update inc_avisos_ajustes set valor = 'no' where clave = 'activo';` (y `'si'` para volver a activarlos).

## Seguridad

- Solo pueden entrar cuentas **@salesianas.org** (y @salesianes.org). Las reglas están en la base de datos (`supabase/schema.sql`), así que no se pueden saltar desde la web.
- Solo coordinación, técnicos y administración crean incidencias, y cada una queda a nombre de quien la crea. Solo técnicos y administración cambian el estado o el responsable; el historial lo escribe la propia base de datos.
- Las fotos y archivos están en una carpeta **privada** de Supabase: solo se ven con sesión iniciada y mediante enlaces que caducan en una hora.
- Los avisos por correo los manda la base de datos al flujo de Power Automate. La dirección del flujo solo está en Supabase (tabla `inc_avisos_ajustes`), que no se puede leer desde la web.
- Al borrar una incidencia (solo Administración) se borran también su historial y sus archivos. Si está resuelta, mejor cerrarla.
