# Incidencias

Web de incidencias con tickets para el colegio. Se entra con la cuenta de Microsoft 365 del colegio.

## Quién hace qué

| Rol | Qué puede hacer |
|---|---|
| **Profesorado** (cualquier cuenta @salesianas.org) | Ver todas las incidencias, su estado y su historial. |
| **Coordinador/a** | Además, crear incidencias. En las suyas puede añadir comentarios y fotos, y corregir los datos mientras siguen abiertas. |
| **Técnico/a** | Además, atender cualquier incidencia: estado, prioridad, responsable («Asignármela»), comentarios y fotos. |
| **Administración** | Además, el menú *Administración*: resumen y descarga para Excel, aulas y zonas, y quién tiene cada rol. Puede borrar incidencias. |

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

1. **Base de datos.** En https://supabase.com, abre el proyecto «Acceso Microsoft 365» → *SQL Editor*. Pega y ejecuta `supabase/schema.sql`. Al final deben salir 3 permisos y 52 aulas y zonas. También crea la carpeta privada de adjuntos (`inc-adjuntos`, en *Storage*). Se puede volver a ejecutar sin perder datos.
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

La web avisa por correo de esto:

| Qué pasa | A quién le llega |
|---|---|
| Se crea una incidencia | A **técnicos y administración** de Incidencias (los de *Administración → Coordinación, técnicos y administración*). |
| Una incidencia cambia de estado | A **quien la creó**. |
| Alguien comenta en una incidencia | A **quien la creó**. |

A quien hace el cambio no le llega aviso de lo suyo. Los cambios de prioridad o de responsable no avisan. El correo lleva los datos de la incidencia y el botón **Abrir la incidencia**. Si se responde al correo, la respuesta le llega a quien hizo el cambio.

**Cómo funciona.** Al apuntarse algo en el historial, la base de datos (`supabase/avisos.sql`) decide a quién avisar y llama a la función `api/notificar.js` de esta misma web en Vercel. Esa función envía el correo con **Resend** (resend.com), el mismo servicio que usa el formulario del Portal del profesorado. Si el correo falla, la incidencia se guarda igual.

### Ponerlos en marcha (una sola vez)

1. **Dominio en Resend.** Entra en https://resend.com con la cuenta que ya existe (la de `web@nervion.salesianas.org`, la del Portal del profesorado). Sin un dominio verificado, Resend solo envía a esa dirección, así que hay que verificarlo:
   - *Domains → Add Domain* → escribe `nervion.salesianas.org` y elige la región *Ireland (eu-west-1)*.
   - Resend muestra unos registros DNS (normalmente 3: uno `MX` y uno `TXT` en `send.nervion…` y uno `TXT` en `resend._domainkey.nervion…`). Pídele a quien gestiona el DNS de `salesianas.org` que los añada tal cual.
   - Cuando estén, pulsa *Verify DNS Records*. En unos minutos (a veces unas horas) debe salir **Verified**.
2. **Clave de Resend.** En Resend → *API Keys → Create API Key*: nombre «Incidencias», permiso **Sending access** y el dominio `nervion.salesianas.org`. Copia la clave (empieza por `re_`), porque solo se ve una vez.
3. **Clave secreta de los avisos.** Inventa una contraseña larga, de 30 caracteres o más, sin espacios ni comillas. Sirve para que nadie más pueda usar la función para enviar correos. Se usa en los pasos 4 y 5.
4. **Variables en Vercel.** En Vercel → proyecto de Incidencias → *Settings → Environment Variables*, crea:
   - `RESEND_API_KEY`: la clave del paso 2.
   - `AVISOS_SECRETO`: la clave secreta del paso 3.
   - `AVISOS_DE`: `Incidencias <incidencias@nervion.salesianas.org>` (el remitente; tiene que ser del dominio verificado y no hace falta que el buzón exista).
   - `AVISOS_WEB`: la dirección de la web, por ejemplo `https://incidencias-nervion.vercel.app` (para el botón *Abrir la incidencia*).

   Después, en *Deployments*, pulsa los tres puntos del último despliegue → **Redeploy**, para que se apliquen.
5. **Base de datos.** En Supabase → *SQL Editor*, pega y ejecuta `supabase/avisos.sql`. Después, en una consulta nueva, pon tu dirección y la clave secreta del paso 3 y ejecútalo. **No lo guardes en ningún archivo ni lo subas a GitHub.**
   ```sql
   update inc_avisos_ajustes set valor = 'https://incidencias-nervion.vercel.app/api/notificar' where clave = 'url';
   update inc_avisos_ajustes set valor = 'LA-CLAVE-SECRETA-DEL-PASO-3' where clave = 'secreto';
   ```
6. **Probar.** Pide a un técnico que cambie el estado de una incidencia tuya, o crea una con una cuenta de coordinación: el correo llega en unos segundos (mira también en *Correo no deseado* la primera vez).

### Si no llega el correo

- En Supabase → *SQL Editor*, esta consulta muestra las últimas llamadas a la función y su respuesta:
  ```sql
  select created, status_code, content from net._http_response order by created desc limit 5;
  ```
  - `401 Clave secreta incorrecta`: la clave de `inc_avisos_ajustes` no es igual que `AVISOS_SECRETO` en Vercel (o falta el *Redeploy*).
  - `502 El servicio de correo no ha aceptado el envío`: el dominio no está verificado en Resend, o `AVISOS_DE` no es de ese dominio. En Vercel → *Logs* sale el motivo exacto.
  - Sin filas: falta la dirección (`url`) en `inc_avisos_ajustes`.
- En Resend → *Emails* se ve cada correo enviado y si se ha entregado.
- **Probar sin enviar:** con la variable `AVISOS_PRUEBA` = `si` en Vercel (y *Redeploy*), la función no envía nada y devuelve el correo que habría mandado. Ese correo se ve con la consulta de arriba.
- **Pararlos un tiempo:** `update inc_avisos_ajustes set valor = 'no' where clave = 'activo';` (y `'si'` para volver a activarlos).

## Seguridad

- Solo pueden entrar cuentas **@salesianas.org** (y @salesianes.org). Las reglas están en la base de datos (`supabase/schema.sql`), así que no se pueden saltar desde la web.
- Solo coordinación, técnicos y administración crean incidencias, y cada una queda a nombre de quien la crea. Solo técnicos y administración cambian el estado o el responsable; el historial lo escribe la propia base de datos.
- Las fotos y archivos están en una carpeta **privada** de Supabase: solo se ven con sesión iniciada y mediante enlaces que caducan en una hora.
- Los avisos por correo solo los manda la base de datos: la función `api/notificar.js` rechaza cualquier llamada sin la clave secreta, y la dirección y la clave guardadas en Supabase no se pueden leer desde la web.
- Al borrar una incidencia (solo Administración) se borran también su historial y sus archivos. Si está resuelta, mejor cerrarla.
