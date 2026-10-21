(() => {
  "use strict";
  const CFG = window.APP_CONFIG;
  // Modo prueba: sin Supabase en config.js, o con «?prueba» en la dirección (los datos se quedan en este navegador)
  const DEMO = !CFG.supabaseUrl || new URLSearchParams(location.search).has("prueba");

  // ─── Utilidades ────────────────────────────────────────────────────────────
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const isoDia = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const hoyIso = () => isoDia(new Date());
  const inicioCursoIso = () => { const d = new Date(), y = d.getFullYear() - (d.getMonth() < 8 ? 1 : 0); return y + "-09-01"; };
  const fecha = (ts) => { const d = new Date(ts); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); };
  const fechaHora = (ts) => { const d = new Date(ts); return fecha(ts) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const hace = (ts) => {
    const m = Math.round((Date.now() - new Date(ts)) / 60000);
    if (m < 1) return "ahora mismo";
    if (m < 60) return `hace ${m} min`;
    if (m < 60 * 24 && new Date(ts).getDate() === new Date().getDate()) return `hoy, ${fechaHora(ts).slice(11)}`;
    if (m < 60 * 48 && isoDia(new Date(ts)) === isoDia(new Date(Date.now() - 864e5))) return `ayer, ${fechaHora(ts).slice(11)}`;
    return fecha(ts);
  };
  const nombreDeEmail = (e) => String(e || "").split("@")[0].split(/[._-]/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
  const codigo = (id) => "#" + String(id).padStart(4, "0");
  const uuid = () => crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const cuentaColegio = (e) => [CFG.dominio, ...(CFG.dominiosExtra || [])].some((d) => String(e).toLowerCase().endsWith("@" + d));
  const tamano = (b) => (b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // El aviso se mete dentro del diálogo abierto (si lo hay); si no, quedaría tapado por él
  function toast(msg, ms = 3500) {
    const t = $("#toast"), abiertos = $$("dialog[open]");
    (abiertos[abiertos.length - 1] || document.body).appendChild(t);
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
  }
  function fallo(e) { console.error(e); toast("Error: " + (e?.message || e?.error_description || e), 9000); }
  window.addEventListener("unhandledrejection", (e) => fallo(e.reason));
  window.addEventListener("error", (e) => fallo(e.error || e.message));

  // ─── Catálogo: categorías, estados, prioridades y roles ───────────────────
  const CATS = CFG.categorias;
  const cat = (id) => CATS.find((c) => c.id === id);
  const sub = (c, n) => cat(c)?.subs.find((s) => s.nombre === n);
  const ESTADOS = { abierta: "Abierta", en_proceso: "En proceso", pausada: "Pausada (piezas)", cerrada: "Cerrada" };
  const PENDIENTES = ["abierta", "en_proceso", "pausada"];
  const PRIOS = { alta: "Alta / crítica", media: "Media", baja: "Baja" };
  const PESO = { alta: 0, media: 1, baja: 2 };
  const ROLES = { coordinador: "Coordinador/a", tecnico: "Técnico/a", admin: "Administración" };

  const ICONOS = {
    pantalla: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    silla: '<path d="M7 3h10v8H7zM5 11h14v3H5zM7 14v7M17 14v7"/>',
    llave: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.5-.6-.6-2.5z"/>',
    caja: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    lugar: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    clip: '<path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>',
  };
  const icono = (n, tam = "") => `<svg class="ico ${tam}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONOS[n] || ICONOS.caja}</svg>`;
  const pillEstado = (e) => `<span class="est est-${e}">${ESTADOS[e] || e}</span>`;
  const pillPrio = (p) => `<span class="pri pri-${p}">${PRIOS[p] || p}</span>`;
  // Urgencia: la que indicó quien la creó. Prioridad: la asignada por técnicos o administración.
  const urg = (i) => i.urgencia || i.prioridad;
  const pillUrg = (i) => (urg(i) !== i.prioridad ? `<span class="t-urg" title="Urgencia que indicó quien la creó">indicó: ${PRIOS[urg(i)]}</span>` : "");

  // ─── Estado ──────────────────────────────────────────────────────────────
  const S = { user: null, ubis: [], incs: [], gestores: [], personal: [], estado: "pend", vista: null, admSec: null, nueva: null, ficha: null };
  const puedeCrear = () => ["coordinador", "tecnico", "admin"].includes(S.user?.rol);
  const esGestor = () => ["tecnico", "admin"].includes(S.user?.rol);
  // Técnicos: atienden solo sus categorías (sin ninguna marcada, todas). Administración, todo.
  const atiende = (g, c) => g.rol === "admin" || (g.rol === "tecnico" && (!g.categorias?.length || g.categorias.includes(c)));
  const gestiona = (i) => !!S.user && atiende(S.user, i.categoria);
  const nombresCats = (l) => (l?.length ? l.map((c) => cat(c)?.nombre || c).join(", ") : "todas las categorías");
  const esAdmin = () => S.user?.rol === "admin";
  const formNuevo = () => ({ cat: null, sub: null, elems: new Set(), archivos: [] });

  // ─── Fotos: se reducen antes de subirlas (las del móvil pasan de 4 MB a ~300 KB) ──
  async function prepararArchivo(f) {
    if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)) {
      try {
        const img = await createImageBitmap(f, { imageOrientation: "from-image" });
        const k = Math.min(1, 1920 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.82));
        if (blob && (blob.size < f.size || !/jpeg|png|webp/.test(f.type))) {
          return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
        }
      } catch (e) { console.warn("No se pudo reducir la foto", e); }
    }
    return f;
  }
  async function anadirArchivos(lista, files) {
    for (const f0 of files) {
      if (lista.length >= CFG.maxAdjuntos) { toast(`Como mucho ${CFG.maxAdjuntos} archivos`); break; }
      const f = await prepararArchivo(f0);
      if (f.size > CFG.maxMB * 1048576) { toast(`«${f0.name}» pasa de ${CFG.maxMB} MB`); continue; }
      lista.push({ file: f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null });
    }
  }
  const pintarPrevia = (cont, lista) => {
    cont.innerHTML = lista.map((a, i) => `<span class="adj-prev">${a.url ? `<img src="${a.url}" alt="">` : icono("clip")}
      <span>${esc(a.file.name)}<small>${tamano(a.file.size)}</small></span>
      <button type="button" class="adj-quitar" data-quitar-adj="${i}" aria-label="Quitar ${esc(a.file.name)}">×</button></span>`).join("");
  };

  // ─── Acceso a datos: modo prueba (navegador) ─────────────────────────────
  const CLAVE = "inc_demo_v1", CLAVE_ROL = "inc_demo_rol";
  const leerRolDemo = () => { try { return localStorage.getItem(CLAVE_ROL) ?? "admin"; } catch { return "admin"; } };
  const UBIS_DEMO = [
    ...["1º ESO A", "1º ESO B", "2º ESO A", "2º ESO B", "3º ESO A", "3º ESO B", "4º ESO A", "4º ESO B"].map((n) => ["aula", "ESO", n]),
    ...["1º Bach. A", "1º Bach. B", "2º Bach. A", "2º Bach. B"].map((n) => ["aula", "Bachillerato", n]),
    ...["1º Primaria A", "1º Primaria B", "2º Primaria A", "2º Primaria B"].map((n) => ["aula", "Primaria", n]),
    ["aula", "Aulas específicas", "Aula de Informática"], ["aula", "Aulas específicas", "Laboratorio"],
    ...["Salón de Actos", "Biblioteca", "Capilla", "Gimnasio", "Patio azul (ESO)", "Pasillos y escaleras", "Baños"].map((n) => ["zona", "Zonas comunes", n]),
    ...["Recibidor", "Secretaría", "Despacho de Dirección", "Sala de profesores"].map((n) => ["zona", "Despachos y servicios", n]),
  ].map(([tipo, grupo, nombre], i) => ({ id: i + 1, tipo, grupo, nombre, orden: i + 1, activo: true }));
  function demoLeer() {
    try { const d = JSON.parse(localStorage.getItem(CLAVE)); if (d) return d; } catch {}
    return { seq: 0, eseq: 0, aseq: 0, incs: [], eventos: [], adjuntos: [], ubis: UBIS_DEMO,
      permisos: [{ email: "demo.prueba@salesianas.org", rol: "admin", creado: new Date().toISOString() },
        { email: "tecnico.informatica@salesianas.org", rol: "tecnico", categorias: ["informatica"], creado: new Date().toISOString() },
        { email: "tecnico.mantenimiento@salesianas.org", rol: "tecnico", categorias: ["mobiliario", "infraestructura"], creado: new Date().toISOString() }] };
  }
  function demoGuardar(d) {
    try { localStorage.setItem(CLAVE, JSON.stringify(d)); }
    catch { throw new Error("No cabe más en el navegador (modo prueba). Borra datos o usa fotos más pequeñas."); }
  }
  const demoUser = () => { const [rol, cats] = leerRolDemo().split(":"); return { email: "demo.prueba@salesianas.org", nombre: "Persona de prueba", rol: rol || null, categorias: cats ? cats.split(",") : [] }; };
  function demoEvento(d, incId, tipo, extra = {}, cuando = new Date().toISOString(), autor = demoUser()) {
    const ev = { id: ++d.eseq, incidencia_id: incId, tipo, texto: "", de: null, a: null, autor: autor.email, autor_nombre: autor.nombre, creado: cuando, ...extra };
    d.eventos.push(ev); return ev;
  }
  const leerArchivo = (f) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(f); });
  const demoApi = {
    async sesion() { return demoUser(); },
    async login() {}, async logout() {},
    async ubis() { return demoLeer().ubis; },
    async incidencias() { return demoLeer().incs; },
    async detalle(id) { const d = demoLeer(); return { eventos: d.eventos.filter((e) => e.incidencia_id === id), adjuntos: d.adjuntos.filter((a) => a.incidencia_id === id) }; },
    async crear(f) {
      if (!puedeCrear()) throw new Error("Solo coordinación, técnicos y administración pueden crear incidencias");
      const d = demoLeer(), u = demoUser(), ahora = new Date().toISOString();
      const inc = { ...f, prioridad: f.urgencia, id: ++d.seq, estado: "abierta", creado_por: u.email, creado_nombre: u.nombre, creado: ahora, actualizado: ahora, cerrado: null,
        asignado_email: gestiona(f) ? f.asignado_email || null : null, asignado_nombre: gestiona(f) ? f.asignado_nombre || null : null };
      d.incs.push(inc); demoEvento(d, inc.id, "creada"); demoGuardar(d); return inc;
    },
    async actualizar(id, c) {
      const d = demoLeer(), i = d.incs.find((x) => x.id === id);
      if (!gestiona(i) && (i.creado_por !== S.user.email || i.estado !== "abierta")) throw new Error("Solo quien la creó puede cambiarla, y solo mientras está abierta");
      const antes = { ...i };
      c = { ...c };
      if (gestiona(i)) delete c.urgencia;
      else { delete c.prioridad; if (c.urgencia) c.prioridad = urg(antes) === antes.prioridad ? c.urgencia : antes.prioridad; }
      Object.assign(i, c, { actualizado: new Date().toISOString() });
      if (!i.urgencia) i.urgencia = antes.prioridad;
      if (i.estado === "cerrada" && antes.estado !== "cerrada") i.cerrado = i.actualizado;
      if (i.estado !== "cerrada") i.cerrado = null;
      if (!i.asignado_email) i.asignado_nombre = null;
      if (i.estado !== antes.estado) demoEvento(d, id, "estado", { de: antes.estado, a: i.estado });
      if (i.prioridad !== antes.prioridad) demoEvento(d, id, "prioridad", { de: antes.prioridad, a: i.prioridad });
      if (urg(i) !== urg(antes)) demoEvento(d, id, "urgencia", { de: urg(antes), a: urg(i) });
      if ((i.asignado_email || null) !== (antes.asignado_email || null)) demoEvento(d, id, "asignacion", { de: antes.asignado_nombre, a: i.asignado_nombre });
      demoGuardar(d); return i;
    },
    async borrar(id) {
      const d = demoLeer();
      d.incs = d.incs.filter((x) => x.id !== id); d.eventos = d.eventos.filter((x) => x.incidencia_id !== id); d.adjuntos = d.adjuntos.filter((x) => x.incidencia_id !== id);
      demoGuardar(d);
    },
    async comentar(id, texto) { const d = demoLeer(), ev = demoEvento(d, id, "comentario", { texto }); demoGuardar(d); return ev; },
    async subir(incId, file, eventoId = null) {
      const datos = await leerArchivo(file), d = demoLeer();
      const a = { id: ++d.aseq, incidencia_id: incId, evento_id: eventoId, ruta: uuid(), nombre: file.name, tipo: file.type, tamano: file.size, creado_por: S.user.email, creado: new Date().toISOString(), datos };
      d.adjuntos.push(a); demoGuardar(d); return a;
    },
    async urlAdjunto(a) { return a.datos; },
    async borrarAdjunto(a) { const d = demoLeer(); d.adjuntos = d.adjuntos.filter((x) => x.id !== a.id); demoGuardar(d); },
    async gestores() { return demoLeer().permisos.filter((p) => p.rol !== "coordinador").map((p) => ({ email: p.email, nombre: p.email === demoUser().email ? demoUser().nombre : nombreDeEmail(p.email), rol: p.rol, categorias: p.categorias || [] })); },
    async personal() { return ["Ana Felipe", "Ángela Rodríguez", "Laura Ramos", "Mario Espejo", "Rocío Cano"].map((n) => ({ nombre: n, email: "" })); },
    async guardarUbi(u) {
      const d = demoLeer();
      if (d.ubis.some((x) => x.nombre.toLowerCase() === u.nombre.toLowerCase() && x.id !== u.id)) throw new Error(`Ya existe «${u.nombre}»`);
      if (u.id) Object.assign(d.ubis.find((x) => x.id === u.id), u); else d.ubis.push({ ...u, id: Math.max(0, ...d.ubis.map((x) => x.id)) + 1 });
      demoGuardar(d);
    },
    async borrarUbi(id) { const d = demoLeer(); d.ubis = d.ubis.filter((x) => x.id !== id); demoGuardar(d); },
    async cuentas() { return demoLeer().permisos.sort((a, b) => a.email.localeCompare(b.email)); },
    async addCuenta(email, rol) {
      const d = demoLeer(); if (d.permisos.some((p) => p.email === email)) throw new Error("Esa cuenta ya tiene un rol");
      d.permisos.push({ email, rol, creado: new Date().toISOString() }); demoGuardar(d);
    },
    async cambiarRol(email, rol) { const d = demoLeer(), p = d.permisos.find((x) => x.email === email); p.rol = rol; if (rol !== "tecnico") p.categorias = []; demoGuardar(d); },
    async ponerCategorias(email, cats) { const d = demoLeer(); d.permisos.find((p) => p.email === email).categorias = cats; demoGuardar(d); },
    async delCuenta(email) { const d = demoLeer(); d.permisos = d.permisos.filter((p) => p.email !== email); demoGuardar(d); },
  };

  // ─── Acceso a datos: Supabase + Microsoft 365 ─────────────────────────────
  const sb = DEMO ? null : supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  const ok = (r) => { if (r.error) throw r.error; return r.data; };
  const BUCKET = "inc-adjuntos";
  const urls = new Map();
  const sbApi = {
    async sesion() {
      let { data: { session } } = await sb.auth.getSession();
      // Abierta desde la app de Teams: entra sola con la cuenta de Teams
      if (!session && await window.TeamsSSO?.entrar(sb)) ({ data: { session } } = await sb.auth.getSession());
      if (!session) return null;
      const u = session.user, email = (u.email || "").toLowerCase();
      if (!cuentaColegio(email)) { await sb.auth.signOut(); throw new Error(`Solo se permite el acceso con cuentas @${CFG.dominio}.`); }
      const r = await sb.rpc("inc_rol"), rol = r.error ? null : r.data;
      let categorias = [];
      if (rol === "tecnico") { const c = await sb.from("inc_tecnico_categorias").select("categoria").eq("email", email); categorias = c.error ? [] : c.data.map((x) => x.categoria); }
      return { email, nombre: u.user_metadata?.full_name || u.user_metadata?.name || nombreDeEmail(email), rol, categorias };
    },
    async login() {
      if (await window.TeamsSSO?.entrar(sb)) return location.reload();
      ok(await sb.auth.signInWithOAuth({ provider: "azure", options: { scopes: "email profile", redirectTo: location.origin + location.pathname } }));
    },
    async logout() { await sb.auth.signOut(); location.reload(); },
    async ubis() { return ok(await sb.from("inc_ubicaciones").select("*").order("orden").order("nombre")); },
    async incidencias() {
      const todo = [];
      for (let i = 0; ; i += 1000) {
        const d = ok(await sb.from("inc_incidencias").select("*").order("id", { ascending: false }).range(i, i + 999));
        todo.push(...d);
        if (d.length < 1000) return todo;
      }
    },
    async detalle(id) {
      const [e, a] = await Promise.all([
        sb.from("inc_eventos").select("*").eq("incidencia_id", id).order("creado").order("id"),
        sb.from("inc_adjuntos").select("*").eq("incidencia_id", id).order("id"),
      ]);
      return { eventos: ok(e), adjuntos: ok(a) };
    },
    async crear(f) { return ok(await sb.from("inc_incidencias").insert(f).select().single()); },
    async actualizar(id, c) { return ok(await sb.from("inc_incidencias").update(c).eq("id", id).select().single()); },
    async borrar(id) {
      const rutas = ok(await sb.from("inc_adjuntos").select("ruta").eq("incidencia_id", id)).map((a) => a.ruta);
      if (rutas.length) await sb.storage.from(BUCKET).remove(rutas);
      ok(await sb.from("inc_incidencias").delete().eq("id", id));
    },
    async comentar(id, texto) { return ok(await sb.from("inc_eventos").insert({ incidencia_id: id, texto }).select().single()); },
    async subir(incId, file, eventoId = null) {
      const ext = (file.name.match(/\.[a-z0-9]{1,5}$/i) || [""])[0].toLowerCase();
      const ruta = `${incId}/${uuid()}${ext}`;
      ok(await sb.storage.from(BUCKET).upload(ruta, file, { contentType: file.type || "application/octet-stream" }));
      return ok(await sb.from("inc_adjuntos").insert({ incidencia_id: incId, evento_id: eventoId, ruta, nombre: file.name, tipo: file.type || "", tamano: file.size }).select().single());
    },
    async urlAdjunto(a) {
      const c = urls.get(a.ruta); if (c && c.hasta > Date.now()) return c.url;
      const { signedUrl } = ok(await sb.storage.from(BUCKET).createSignedUrl(a.ruta, 3600));
      urls.set(a.ruta, { url: signedUrl, hasta: Date.now() + 3000e3 });
      return signedUrl;
    },
    async borrarAdjunto(a) { await sb.storage.from(BUCKET).remove([a.ruta]); ok(await sb.from("inc_adjuntos").delete().eq("id", a.id)); },
    async gestores() { const r = await sb.rpc("inc_gestores"); return r.error ? [] : r.data; },
    async personal() { const r = await sb.rpc("inc_personal"); return r.error ? [] : r.data; },
    async guardarUbi(u) {
      const { id, ...datos } = u;
      const r = id ? await sb.from("inc_ubicaciones").update(datos).eq("id", id) : await sb.from("inc_ubicaciones").insert(datos);
      if (r.error?.code === "23505") throw new Error(`Ya existe «${u.nombre}»`);
      ok(r);
    },
    async borrarUbi(id) { ok(await sb.from("inc_ubicaciones").delete().eq("id", id)); },
    async cuentas() {
      const [p, c] = await Promise.all([sb.from("permisos").select("email, rol, creado").eq("web", "incidencias").order("email"), sb.from("inc_tecnico_categorias").select("*")]);
      const cats = c.error ? [] : c.data;
      return ok(p).map((x) => ({ ...x, categorias: cats.filter((k) => k.email === x.email).map((k) => k.categoria) }));
    },
    async ponerCategorias(email, l) {
      ok(await sb.from("inc_tecnico_categorias").delete().eq("email", email));
      if (l.length) ok(await sb.from("inc_tecnico_categorias").insert(l.map((categoria) => ({ email, categoria }))));
    },
    async addCuenta(email, rol) {
      const r = await sb.from("permisos").insert({ email, web: "incidencias", rol });
      if (r.error?.code === "23505") throw new Error("Esa cuenta ya tiene un rol");
      ok(r);
    },
    async cambiarRol(email, rol) {
      ok(await sb.from("permisos").update({ rol }).eq("web", "incidencias").eq("email", email));
      if (rol !== "tecnico") ok(await sb.from("inc_tecnico_categorias").delete().eq("email", email));
    },
    async delCuenta(email) { ok(await sb.from("permisos").delete().eq("web", "incidencias").eq("email", email)); },
  };
  const api = DEMO ? demoApi : sbApi;

  // ─── Diálogo genérico ─────────────────────────────────────────────────────
  function dialogo(html, alAbrir) {
    const dlg = $("#dlg"), f = $("#dlgForm");
    f.innerHTML = html;
    return new Promise((res) => {
      dlg.onclose = () => res(dlg.returnValue);
      dlg.returnValue = "";
      f.onsubmit = () => (S.dlgDatos = Object.fromEntries(new FormData(f)));
      dlg.showModal();
      alAbrir?.(f, dlg);
    });
  }
  const confirmar = (titulo, texto, boton = "Sí", clase = "primario") => dialogo(`<h2>${titulo}</h2><div class="dlg-sub">${texto}</div>
    <div class="dlg-botones"><button class="btn" value="">Cancelar</button><button class="btn ${clase}" value="ok">${boton}</button></div>`).then((v) => v === "ok");

  // ─── Inicio ───────────────────────────────────────────────────────────────
  async function iniciar() {
    $("#demoAviso").hidden = !DEMO;
    if (DEMO) {
      $("#demoRol").value = leerRolDemo();
      $("#demoRol").onchange = (e) => { try { localStorage.setItem(CLAVE_ROL, e.target.value); } catch {} location.reload(); };
      $("#btnEjemplo").onclick = generarEjemplo;
      $("#btnVaciar").onclick = async () => { if (await confirmar("Borrar todo", "Se borrarán todas las incidencias y cambios de prueba.", "Borrar", "aviso")) { localStorage.removeItem(CLAVE); location.reload(); } };
    }
    $("#btnLogin").onclick = () => api.login().catch((e) => ($("#loginError").textContent = e.message));
    $("#btnAdminFranja").onclick = $("#btnLogin").onclick;
    try { S.user = await api.sesion(); } catch (e) { $("#loginError").textContent = e.message; }
    if (!S.user) { document.body.classList.add("sin-sesion"); $("#vLogin").hidden = false; return; }

    $("#usuario").textContent = S.user.nombre;
    $("#rolEtq").textContent = (ROLES[S.user.rol] || "Profesorado") + (S.user.rol === "tecnico" && S.user.categorias?.length ? " · " + nombresCats(S.user.categorias) : "");
    $("#sesion").hidden = false;
    $("#btnSalir").hidden = DEMO;
    $("#btnSalir").onclick = () => api.logout();
    pintarInstalar();
    // Solo entran las cuentas con rol en Incidencias (coordinación, técnicos y administración)
    if (!puedeCrear()) { $("#rolEtq").textContent = "Sin acceso"; $("#btnAdminFranja").hidden = true; $("#vSinAcceso").hidden = false; return; }
    $("#tabs").hidden = false;
    $("#tabNueva").hidden = !puedeCrear();
    $("#tabAdmin").hidden = !esAdmin();
    $("#btnAdminFranja").hidden = !esAdmin();
    $("#btnAdminFranja").onclick = () => mostrar("admin");
    $("#fMiasL").hidden = !puedeCrear();
    $("#fAsigL").hidden = !esGestor();
    $("#fCatsL").hidden = !(S.user.rol === "tecnico" && S.user.categorias?.length);

    $$("#tabs > button[data-vista]").forEach((b) => (b.onclick = () => mostrar(b.dataset.vista)));
    const menu = $("#tabAdmin");
    $("[data-menu]", menu).onclick = () => menu.classList.toggle("abierto");
    $$("[data-admin]", menu).forEach((b) => (b.onclick = () => { menu.classList.remove("abierto"); mostrar("admin", b.dataset.admin); }));
    document.addEventListener("click", (e) => { if (!e.target.closest("#tabAdmin")) menu.classList.remove("abierto"); });

    try {
      [S.ubis, S.incs] = await Promise.all([api.ubis(), api.incidencias()]);
      S.gestores = await api.gestores();
    } catch (e) { fallo(e); return; }
    prepararLista();
    prepararFicha();
    if (puedeCrear()) { S.nueva = formNuevo(); prepararNueva(); api.personal().then((l) => { S.personal = l; pintarPersonal(); }).catch(() => {}); }
    if (esAdmin()) prepararAdmin();
    mostrar("lista");

    // Enlace directo a una incidencia: …/#inc-12
    const abrirHash = () => { const m = location.hash.match(/^#inc-(\d+)$/); if (m) abrirFicha(+m[1]); };
    window.addEventListener("hashchange", abrirHash);
    abrirHash();

    // Al volver a la pestaña, se recarga por si alguien ha cambiado algo
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !$("#ficha").open && !$("#dlg").open) recargar(); });
  }

  async function recargar() {
    try {
      S.incs = await api.incidencias();
      if (S.vista === "lista") pintarLista();
      else if (S.vista === "admin") pintarAdmin();
      contarPendientes();
    } catch (e) { fallo(e); }
  }

  function mostrar(vista, apartado) {
    S.vista = vista;
    $$("#tabs > button[data-vista]").forEach((b) => b.classList.toggle("activa", b.dataset.vista === vista));
    $("#tabAdmin [data-menu]").classList.toggle("activa", vista === "admin");
    if (vista === "admin") {
      S.admSec = apartado || S.admSec || "resumen";
      $$("#vAdmin [data-sec]").forEach((el) => (el.hidden = el.dataset.sec !== S.admSec));
      $$("#tabAdmin [data-admin]").forEach((b) => b.classList.toggle("activo", b.dataset.admin === S.admSec));
    }
    $("#vLista").hidden = vista !== "lista";
    $("#vNueva").hidden = vista !== "nueva";
    $("#vAdmin").hidden = vista !== "admin";
    $("main").hidden = vista === "admin";
    if (vista === "lista") pintarLista();
    else if (vista === "nueva") pintarNueva();
    else if (vista === "admin") pintarAdmin();
    contarPendientes();
  }

  function contarPendientes() {
    const n = S.incs.filter((i) => PENDIENTES.includes(i.estado)).length;
    $("#nPend").textContent = n; $("#nPend").hidden = !n;
  }

  // ─── Lista de incidencias ─────────────────────────────────────────────────
  const opcionesUbi = (lista, conTodas) => {
    const grupos = [...new Set(lista.map((u) => u.grupo || (u.tipo === "aula" ? "Aulas" : "Zonas")))];
    return (conTodas ? `<option value="">${conTodas}</option>` : "") +
      grupos.map((g) => `<optgroup label="${esc(g)}">${lista.filter((u) => (u.grupo || (u.tipo === "aula" ? "Aulas" : "Zonas")) === g)
        .map((u) => `<option value="${esc(u.nombre)}">${esc(u.nombre)}</option>`).join("")}</optgroup>`).join("");
  };
  function prepararLista() {
    const F = $("#filtros");
    F.cat.innerHTML = `<option value="">Todas</option>` + CATS.map((c) => `<optgroup label="${esc(c.nombre)}"><option value="${c.id}">Toda la categoría</option>${c.subs.map((s) => `<option value="${c.id}|${esc(s.nombre)}">${esc(s.nombre)}</option>`).join("")}</optgroup>`).join("");
    F.addEventListener("input", () => { clearTimeout(S._f); S._f = setTimeout(pintarLista, 150); });
    $("#estados").addEventListener("click", (e) => { const b = e.target.closest("[data-est]"); if (b) { S.estado = b.dataset.est; pintarLista(); } });
    $("#lista").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) abrirFicha(+b.dataset.id); });
  }
  function filtrar() {
    const F = $("#filtros"), q = norm(F.q.value.trim()), [fc, fs] = F.cat.value.split("|");
    return S.incs.filter((i) =>
      (!fc || i.categoria === fc) && (!fs || i.subcategoria === fs) &&
      (!F.prio.value || i.prioridad === F.prio.value) && (!F.ubi.value || i.ubicacion === F.ubi.value) &&
      (!F.mias.checked || i.creado_por === S.user.email) && (!F.asig.checked || i.asignado_email === S.user.email) && (F.miscat.closest("label").hidden || !F.miscat.checked || gestiona(i)) &&
      (!q || norm([codigo(i.id), i.id, i.titulo, i.descripcion, i.ubicacion, i.persona, i.subcategoria, cat(i.categoria)?.nombre, i.creado_nombre, i.asignado_nombre, ...(i.elementos || [])].join(" ")).includes(q.replace(/^#0*/, ""))));
  }
  function pintarLista() {
    const F = $("#filtros");
    // Aulas y zonas: las de la lista y las escritas a mano que ya tienen incidencias
    const usadas = [...new Set(S.incs.map((i) => i.ubicacion).filter(Boolean))].filter((n) => !S.ubis.some((u) => u.nombre === n));
    const ubiSel = F.ubi.value;
    F.ubi.innerHTML = opcionesUbi(S.ubis, "Todas") + (usadas.length ? `<optgroup label="Otras">${usadas.sort().map((n) => `<option>${esc(n)}</option>`).join("")}</optgroup>` : "");
    F.ubi.value = ubiSel;

    const base = filtrar();
    const n = (f) => base.filter(f).length;
    const tabs = [["pend", "Pendientes", (i) => PENDIENTES.includes(i.estado)], ...Object.entries(ESTADOS).map(([k, v]) => [k, v, (i) => i.estado === k]), ["todas", "Todas", () => true]];
    $("#estados").innerHTML = tabs.map(([k, t, f]) => `<button type="button" role="tab" data-est="${k}" class="${S.estado === k ? "activo" : ""} ${k !== "pend" && k !== "todas" ? "e-" + k : ""}" aria-selected="${S.estado === k}">${t} <b>${n(f)}</b></button>`).join("");
    const filtro = tabs.find((t) => t[0] === S.estado)[2];
    const l = base.filter(filtro).sort((a, b) => PENDIENTES.includes(a.estado) && PENDIENTES.includes(b.estado)
      ? PESO[a.prioridad] - PESO[b.prioridad] || b.id - a.id : b.id - a.id);

    $("#lista").innerHTML = l.length ? l.map(tarjeta).join("") : `<p class="vacio">${S.incs.length ? "No hay incidencias con estos filtros." : "Todavía no hay incidencias."}${puedeCrear() && !S.incs.length ? " Pulsa «+ Nueva incidencia» para crear la primera." : ""}</p>`;
  }
  function tarjeta(i) {
    const c = cat(i.categoria) || { color: "#64748b", nombre: i.categoria, icono: "caja" };
    return `<button type="button" class="ticket ${i.estado === "cerrada" ? "cerrado" : ""}" data-id="${i.id}" style="--c:${c.color}">
      <span class="t-ico">${icono(c.icono)}</span>
      <span class="t-cuerpo">
        <span class="t-sup"><b class="t-cod">${codigo(i.id)}</b>${pillEstado(i.estado)}${pillPrio(i.prioridad)}${pillUrg(i)}<span class="t-fecha">${hace(i.creado)}</span></span>
        <span class="t-tit">${esc(i.titulo)}</span>
        <span class="t-meta"><span>${esc(i.subcategoria)}${i.elementos?.length ? " · " + esc(i.elementos.join(", ")) : ""}</span>
          ${i.ubicacion ? `<span>${icono("lugar")}${esc(i.ubicacion)}</span>` : ""}<span>${icono("persona")}${esc(i.persona)}</span></span>
        <span class="t-pie">Creada por ${esc(i.creado_nombre || nombreDeEmail(i.creado_por))}${i.asignado_nombre ? ` · Responsable: <b>${esc(i.asignado_nombre)}</b>` : ""}</span>
      </span></button>`;
  }

  // ─── Ficha de una incidencia ──────────────────────────────────────────────
  function prepararFicha() {
    const dlg = $("#ficha");
    dlg.addEventListener("close", () => { S.ficha = null; if (location.hash.startsWith("#inc-")) history.replaceState(null, "", location.pathname + location.search); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    $("#visor").addEventListener("click", () => $("#visor").close());
    dlg.addEventListener("click", fichaClick);
    dlg.addEventListener("change", async (e) => {
      if (e.target.id === "cArchivos") { await anadirArchivos(S.ficha.archivos, e.target.files); e.target.value = ""; pintarPrevia($("#cPrevia"), S.ficha.archivos); }
    });
    dlg.addEventListener("submit", (e) => { e.preventDefault(); guardarFicha(); });
  }
  async function abrirFicha(id) {
    let inc = S.incs.find((i) => i.id === id);
    if (!inc) { await recargar(); inc = S.incs.find((i) => i.id === id); }
    if (!inc) return toast(`No existe la incidencia ${codigo(id)}`);
    try {
      const det = await api.detalle(id);
      S.ficha = { inc, ...det, archivos: [] };
      pintarFicha();
      if (!$("#ficha").open) $("#ficha").showModal();
      if (location.hash !== "#inc-" + id) history.replaceState(null, "", "#inc-" + id);
    } catch (e) { fallo(e); }
  }
  const puedeComentar = (i) => gestiona(i) || i.creado_por === S.user.email;
  const puedeEditar = (i) => gestiona(i) || (i.creado_por === S.user.email && i.estado === "abierta");
  async function htmlAdjuntos(lista) {
    if (!lista.length) return "";
    const items = await Promise.all(lista.map(async (a) => {
      let url = ""; try { url = await api.urlAdjunto(a); } catch {}
      const borrar = esAdmin() || a.creado_por === S.user.email ? `<button type="button" class="adj-quitar" data-borrar-adj="${a.id}" aria-label="Borrar ${esc(a.nombre)}">×</button>` : "";
      return a.tipo.startsWith("image/") && url
        ? `<span class="adj foto"><button type="button" class="adj-ver" data-ver="${esc(url)}" aria-label="Ver ${esc(a.nombre)}"><img src="${esc(url)}" alt="${esc(a.nombre)}" loading="lazy"></button>${borrar}</span>`
        : `<span class="adj"><a href="${esc(url)}" target="_blank" rel="noopener" download="${esc(a.nombre)}">${icono("clip")}<span>${esc(a.nombre)}<small>${tamano(a.tamano)}</small></span></a>${borrar}</span>`;
    }));
    return `<div class="adjuntos">${items.join("")}</div>`;
  }
  function textoEvento(e) {
    if (e.tipo === "creada") return "creó la incidencia";
    if (e.tipo === "estado") return `cambió el estado: ${ESTADOS[e.de] || e.de} → <b>${ESTADOS[e.a] || e.a}</b>`;
    if (e.tipo === "prioridad") return `cambió la prioridad asignada: ${PRIOS[e.de] || e.de} → <b>${PRIOS[e.a] || e.a}</b>`;
    if (e.tipo === "urgencia") return `corrigió la urgencia: ${PRIOS[e.de] || e.de} → <b>${PRIOS[e.a] || e.a}</b>`;
    if (e.tipo === "asignacion") return e.a ? `asignó la incidencia a <b>${esc(e.a)}</b>` : `quitó el responsable${e.de ? ` (${esc(e.de)})` : ""}`;
    return "comentó";
  }
  async function pintarFicha() {
    const { inc: i, eventos, adjuntos } = S.ficha, c = cat(i.categoria) || { color: "#64748b", nombre: i.categoria, icono: "caja" };
    const iniciales = adjuntos.filter((a) => !a.evento_id);
    const hist = await Promise.all(eventos.map(async (e) => `<li class="ev ev-${e.tipo}">
      <span class="ev-cab"><b>${esc(e.autor_nombre || nombreDeEmail(e.autor))}</b> ${textoEvento(e)} <time title="${fechaHora(e.creado)}">${hace(e.creado)}</time>
      ${e.tipo === "comentario" && (esAdmin() || e.autor === S.user.email) ? `<button type="button" class="enlace mini-enl" data-borrar-ev="${e.id}">Borrar</button>` : ""}</span>
      ${e.texto ? `<p class="ev-txt">${esc(e.texto)}</p>` : ""}${await htmlAdjuntos(adjuntos.filter((a) => a.evento_id === e.id))}</li>`));
    const gest = gestiona(i) ? `<div class="gestion">
        <label class="campo">Estado <select name="estado">${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}" ${k === i.estado ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="campo">Prioridad asignada <select name="prioridad">${Object.entries(PRIOS).map(([k, v]) => `<option value="${k}" ${k === i.prioridad ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="campo crece">Responsable <select name="asignado">${opcionesGestores(i)}</select></label>
        ${i.asignado_email !== S.user.email ? `<button type="button" class="btn mini" data-asignarme>Asignármela</button>` : ""}
      </div>` : "";
    const comentar = puedeComentar(i) ? `<form class="comentar" id="fComentar">
        <h3 class="sub">${gestiona(i) ? "Atender la incidencia" : "Añadir información"}</h3>
        ${gest}
        <label class="campo">Comentario <textarea name="texto" rows="3" maxlength="4000" placeholder="${gestiona(i) ? "Qué se ha hecho, qué falta, piezas pedidas… (recomendable al cerrar)" : "Más detalles para quien la atiende"}"></textarea></label>
        <div class="comentar-pie">
          <label class="btn">${icono("clip")} Foto o archivo<input type="file" id="cArchivos" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" hidden></label>
          <span class="crece"></span>
          <button class="btn primario" id="cGuardar">${gestiona(i) ? "Guardar" : "Añadir comentario"}</button>
        </div>
        <div id="cPrevia" class="previa"></div>
      </form>` : "";

    $("#fichaCuerpo").innerHTML = `
      <div class="f-cab" style="--c:${c.color}">
        <span class="t-ico">${icono(c.icono)}</span>
        <div class="crece"><div class="t-sup"><b class="t-cod">${codigo(i.id)}</b>${pillEstado(i.estado)}${pillPrio(i.prioridad)}${pillUrg(i)}</div>
          <h2 id="fichaTit">${esc(i.titulo)}</h2></div>
        <button type="button" class="f-cerrar" data-cerrar aria-label="Cerrar">×</button>
      </div>
      <dl class="f-datos">
        <div><dt>Tipo</dt><dd>${esc(c.nombre)} › ${esc(i.subcategoria)}${i.elementos?.length ? `<br><small>${esc(i.elementos.join(", "))}</small>` : ""}</dd></div>
        <div><dt>Aula o zona</dt><dd>${esc(i.ubicacion) || "—"}</dd></div>
        <div><dt>Persona</dt><dd>${esc(i.persona)}</dd></div>
        <div><dt>Creada</dt><dd>${fechaHora(i.creado)}<br><small>por ${esc(i.creado_nombre || nombreDeEmail(i.creado_por))}</small></dd></div>
        <div><dt>Responsable</dt><dd>${esc(i.asignado_nombre) || "Sin asignar"}</dd></div>
        <div><dt>Urgencia indicada</dt><dd>${PRIOS[urg(i)]}<br><small>por quien la creó</small></dd></div>
        <div><dt>Prioridad asignada</dt><dd>${PRIOS[i.prioridad]}<br><small>${urg(i) !== i.prioridad ? "cambiada por técnicos o administración" : "la misma que la urgencia"}</small></dd></div>
        ${i.cerrado ? `<div><dt>Cerrada</dt><dd>${fechaHora(i.cerrado)}</dd></div>` : ""}
      </dl>
      <p class="f-desc">${esc(i.descripcion)}</p>
      ${await htmlAdjuntos(iniciales)}
      <div class="f-acc">
        <button type="button" class="btn mini" data-copiar>Copiar enlace</button>
        <button type="button" class="btn mini" data-descargar="pdf">Descargar PDF</button>
        <button type="button" class="btn mini" data-descargar="word">Descargar Word</button>
        ${puedeEditar(i) ? `<button type="button" class="btn mini" data-editar>Corregir datos</button>` : ""}
        ${esAdmin() ? `<button type="button" class="btn mini peligro" data-borrar>Borrar incidencia</button>` : ""}
      </div>
      ${comentar}
      <h3 class="sub">Historial</h3>
      <ol class="historial">${hist.reverse().join("")}</ol>`;
  }
  function opcionesGestores(i) {
    // Responsables posibles: administración y los técnicos de esta categoría
    const l = S.gestores.filter((g) => atiende(g, i.categoria));
    if (i.asignado_email && !l.some((g) => g.email === i.asignado_email)) l.push({ email: i.asignado_email, nombre: i.asignado_nombre });
    return `<option value="">Sin asignar</option>` + l.map((g) => `<option value="${esc(g.email)}" ${g.email === i.asignado_email ? "selected" : ""}>${esc(nombreGestor(g))}</option>`).join("");
  }
  const nombreGestor = (g) => (g.email === S.user.email ? S.user.nombre : g.nombre || nombreDeEmail(g.email));

  async function fichaClick(e) {
    const b = e.target.closest("button"); if (!b || !S.ficha) return;
    const i = S.ficha.inc, d = b.dataset;
    if (d.cerrar != null) return $("#ficha").close();
    if (d.ver) { const v = $("#visor"); $("img", v).src = d.ver; return v.showModal(); }
    if (d.quitarAdj != null) { S.ficha.archivos.splice(+d.quitarAdj, 1); return pintarPrevia($("#cPrevia"), S.ficha.archivos); }
    if (d.asignarme != null) { const s = $("#fComentar").asignado; if (!S.gestores.some((g) => g.email === S.user.email)) S.gestores.push({ email: S.user.email, nombre: S.user.nombre, rol: S.user.rol, categorias: S.user.categorias }); s.innerHTML = opcionesGestores(i); s.value = S.user.email; if (s.form.estado.value === "abierta") s.form.estado.value = "en_proceso"; return; }
    if (d.descargar) return descargarFicha(d.descargar);
    if (d.copiar != null) {
      const url = location.origin + location.pathname + "#inc-" + i.id;
      try { await navigator.clipboard.writeText(url); toast("Enlace copiado"); } catch { prompt("Copia el enlace:", url); }
      return;
    }
    try {
      if (d.borrarAdj) {
        const a = S.ficha.adjuntos.find((x) => x.id == d.borrarAdj);
        if (!(await confirmar("Borrar archivo", `Se borrará «${esc(a.nombre)}».`, "Borrar", "aviso"))) return;
        await api.borrarAdjunto(a); return abrirFicha(i.id);
      }
      if (d.borrarEv) {
        if (!(await confirmar("Borrar comentario", "Se borrará el comentario (sus archivos quedan en la incidencia).", "Borrar", "aviso"))) return;
        if (DEMO) { const db = demoLeer(); db.eventos = db.eventos.filter((x) => x.id != d.borrarEv); demoGuardar(db); }
        else ok(await sb.from("inc_eventos").delete().eq("id", +d.borrarEv));
        return abrirFicha(i.id);
      }
      if (d.editar != null) return editarIncidencia(i);
      if (d.borrar != null) {
        if (!(await confirmar("Borrar incidencia", `Se borrará ${codigo(i.id)} con su historial y sus archivos. No se puede deshacer.<br>Si ya está resuelta, mejor ciérrala.`, "Borrar", "aviso"))) return;
        await api.borrar(i.id); $("#ficha").close(); toast(`${codigo(i.id)} borrada`); return recargar();
      }
    } catch (err) { fallo(err); }
  }

  async function guardarFicha() {
    const f = $("#fComentar"), i = S.ficha.inc, texto = f.texto.value.trim(), btn = $("#cGuardar");
    const cambios = {};
    if (gestiona(i)) {
      if (f.estado.value !== i.estado) cambios.estado = f.estado.value;
      if (f.prioridad.value !== i.prioridad) cambios.prioridad = f.prioridad.value;
      if ((f.asignado.value || null) !== (i.asignado_email || null)) {
        const g = S.gestores.find((x) => x.email === f.asignado.value);
        cambios.asignado_email = f.asignado.value || null;
        cambios.asignado_nombre = g ? nombreGestor(g) : null;
      }
    }
    if (!texto && !S.ficha.archivos.length && !Object.keys(cambios).length) return toast("No hay nada que guardar");
    btn.disabled = true; btn.textContent = "Guardando…";
    try {
      if (Object.keys(cambios).length) await api.actualizar(i.id, cambios);
      let ev = null;
      if (texto || S.ficha.archivos.length) ev = await api.comentar(i.id, texto || "Adjunta archivos.");
      for (const [n, a] of S.ficha.archivos.entries()) { btn.textContent = `Subiendo ${n + 1}/${S.ficha.archivos.length}…`; await api.subir(i.id, a.file, ev?.id); }
      S.incs = await api.incidencias();
      toast("Guardado"); await abrirFicha(i.id); pintarLista(); contarPendientes(); if (S.vista === "admin" && S.admSec === "resumen") pintarResumen();
    } catch (e) { fallo(e); btn.disabled = false; btn.textContent = "Guardar"; }
  }

  async function editarIncidencia(i) {
    const s = sub(i.categoria, i.subcategoria);
    const v = await dialogo(`<h2>Corregir ${codigo(i.id)}</h2>
      <label class="campo">Resumen <input name="titulo" maxlength="120" required minlength="3" value="${esc(i.titulo)}"></label>
      <label class="campo">Descripción <textarea name="descripcion" rows="5" maxlength="4000" required minlength="10">${esc(i.descripcion)}</textarea></label>
      <div class="fila">
        <label class="campo crece">Aula o zona <input name="ubicacion" list="dlUbis" maxlength="80" value="${esc(i.ubicacion)}" ${s?.ubicacion === "opcional" ? "" : "required"}></label>
        <label class="campo crece">Persona <input name="persona" list="dlPersonal" maxlength="120" required value="${esc(i.persona)}"></label>
      </div>
      ${gestiona(i) ? "" : `<label class="campo">Urgencia <select name="urgencia">${Object.entries(PRIOS).map(([k, t]) => `<option value="${k}" ${k === urg(i) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`}
      <datalist id="dlUbis">${S.ubis.filter((u) => u.activo).map((u) => `<option value="${esc(u.nombre)}">`).join("")}</datalist>
      <div class="dlg-botones"><button class="btn" value="" formnovalidate>Cancelar</button><button class="btn primario" value="ok">Guardar</button></div>`);
    if (v !== "ok") return;
    const D = S.dlgDatos;
    try {
      await api.actualizar(i.id, { titulo: D.titulo.trim(), descripcion: D.descripcion.trim(), ubicacion: D.ubicacion.trim(), persona: D.persona.trim(), ...(D.urgencia ? { urgencia: D.urgencia } : {}) });
      S.incs = await api.incidencias(); toast("Cambios guardados"); abrirFicha(i.id); pintarLista();
    } catch (e) { fallo(e); }
  }

  // ─── Nueva incidencia ─────────────────────────────────────────────────────
  function prepararNueva() {
    const F = $("#fNueva");
    $("#nCats").innerHTML = CATS.map((c) => `<button type="button" class="cat-btn" data-cat="${c.id}" role="radio" aria-checked="false" style="--c:${c.color}">
      <span class="t-ico">${icono(c.icono)}</span><span><b>${esc(c.nombre)}</b><small>${esc(c.subs.map((s) => s.nombre).join(" · "))}</small></span></button>`).join("");
    F.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const N = S.nueva, d = b.dataset;
      if (d.cat) { if (N.cat !== d.cat) { N.cat = d.cat; N.sub = cat(d.cat).subs.length === 1 ? cat(d.cat).subs[0].nombre : null; N.elems.clear(); } pintarNueva(); }
      else if (d.sub) { if (N.sub !== d.sub) { N.sub = d.sub; N.elems.clear(); } pintarNueva(); }
      else if (d.elem) { N.elems.has(d.elem) ? N.elems.delete(d.elem) : N.elems.add(d.elem); pintarNueva(); }
      else if (d.quitarAdj != null) { N.archivos.splice(+d.quitarAdj, 1); pintarPrevia($("#nPrevia"), N.archivos); }
      else if (d.soyYo != null) { F.persona.value = S.user.nombre; }
    });
    F.ubicacion.onchange = () => { $("#nUbiOtraL").hidden = F.ubicacion.value !== "__otra"; if (F.ubicacion.value === "__otra") F.ubicacionOtra.focus(); };
    $("#nArchivos").onchange = async (e) => { await anadirArchivos(S.nueva.archivos, e.target.files); e.target.value = ""; pintarPrevia($("#nPrevia"), S.nueva.archivos); };
    $("#nLimpiar").onclick = () => { F.reset(); S.nueva = formNuevo(); $("#nError").innerHTML = ""; $$(".invalido", F).forEach((x) => x.classList.remove("invalido")); pintarNueva(); };
    F.onsubmit = (e) => { e.preventDefault(); enviarNueva(); };
    F.addEventListener("input", (e) => e.target.closest(".invalido")?.classList.remove("invalido"));
    $("#personaPista").insertAdjacentHTML("beforeend", ` <button type="button" class="enlace" data-soy-yo>Soy yo</button>`);
  }
  function pintarPersonal() { $("#dlPersonal").innerHTML = S.personal.map((p) => `<option value="${esc(p.nombre)}">`).join(""); }
  function pintarNueva() {
    const F = $("#fNueva"), N = S.nueva, c = cat(N.cat), s = c && sub(N.cat, N.sub);
    $$("#nCats [data-cat]").forEach((b) => { b.classList.toggle("on", b.dataset.cat === N.cat); b.setAttribute("aria-checked", b.dataset.cat === N.cat); });
    if (c) $("#nCats").classList.remove("invalido");
    if (s) $("#nSubs").classList.remove("invalido");
    if (N.elems.size) $("#nElems").classList.remove("invalido");
    $("#nSubs").hidden = !c;
    if (c) $("#nSubs").innerHTML = `<p class="ayuda">${esc(c.nombre)}: ¿de qué se trata?</p><div class="chips">${c.subs.map((x) => `<button type="button" class="chip-btn ${x.nombre === N.sub ? "on" : ""}" data-sub="${esc(x.nombre)}" style="--c:${c.color}">${esc(x.nombre)}</button>`).join("")}</div>`;
    $("#nElems").hidden = !s?.elementos.length;
    if (s?.elementos.length) $("#nElems").innerHTML = `<p class="ayuda">¿Qué falla o qué se necesita? Marca todo lo que corresponda.</p><div class="chips">${s.elementos.map((x) => `<button type="button" class="chip-btn mini ${N.elems.has(x) ? "on" : ""}" data-elem="${esc(x)}" aria-pressed="${N.elems.has(x)}" style="--c:${c.color}">${N.elems.has(x) ? "✓ " : ""}${esc(x)}</button>`).join("")}</div>`;

    // ¿Dónde? según la subcategoría
    const modo = s?.ubicacion || "cualquiera", activas = S.ubis.filter((u) => u.activo);
    const lista = modo === "aula" ? activas.filter((u) => u.tipo === "aula") : modo === "zona" ? activas.filter((u) => u.tipo === "zona") : activas;
    const previa = F.ubicacion.value;
    F.ubicacion.innerHTML = `<option value="">${modo === "opcional" ? "— No hace falta —" : "Elige…"}</option>` + opcionesUbi(lista) + `<option value="__otra">Otra (escríbela)…</option>`;
    F.ubicacion.value = [...F.ubicacion.options].some((o) => o.value === previa) ? previa : "";
    $("#nUbiOtraL").hidden = F.ubicacion.value !== "__otra";
    $("#dondeEtq").textContent = { aula: "Aula", zona: "Zona común", cualquiera: "Aula o zona", opcional: "Aula o zona (opcional)" }[modo];
    $("#dondeAyuda").textContent = { aula: "Elige el aula exacta.", zona: "Elige la zona común exacta.", cualquiera: "Elige el aula o la zona exacta (o «Otra» si no está en la lista).", opcional: "Solo si tiene que ver con un aula o un equipo concreto." }[modo];

    $("#personaEtq").textContent = s?.cuenta ? "Persona de la cuenta" : "Persona afectada o de contacto";
    $("#personaPista").firstChild.textContent = s?.cuenta ? "Nombre y apellidos de quien tiene el problema con su cuenta." : "A quién afecta o a quién hay que dirigirse.";
    pintarPrevia($("#nPrevia"), N.archivos);
  }
  function validarNueva() {
    const F = $("#fNueva"), N = S.nueva, s = N.cat && sub(N.cat, N.sub), mal = [];
    const marca = (el, txt) => { el.classList.add("invalido"); mal.push(txt); };
    if (!N.cat) marca($("#nCats"), "Elige qué tipo de incidencia es");
    else if (!s) marca($("#nSubs"), "Elige de qué se trata");
    else if (s.elementos.length && !N.elems.size) marca($("#nElems"), "Marca qué falla o qué se necesita");
    const ubi = F.ubicacion.value === "__otra" ? F.ubicacionOtra.value.trim() : F.ubicacion.value;
    if (!ubi && s?.ubicacion !== "opcional") marca(F.ubicacion.value === "__otra" ? F.ubicacionOtra.closest(".campo") : F.ubicacion.closest(".campo"), "Indica el aula o la zona");
    if (!F.persona.value.trim()) marca(F.persona.closest(".campo"), "Indica la persona afectada o de contacto");
    if (F.titulo.value.trim().length < 3) marca(F.titulo.closest(".campo"), "Escribe un resumen");
    if (F.descripcion.value.trim().length < 10) marca(F.descripcion.closest(".campo"), "Describe la incidencia con algo más de detalle");
    if (!F.prioridad.value) marca($(".prioridades", F), "Elige la urgencia");
    return { mal, ubi };
  }
  async function enviarNueva() {
    const F = $("#fNueva"), N = S.nueva, btn = $("#nEnviar");
    $$(".invalido", F).forEach((x) => x.classList.remove("invalido"));
    const { mal, ubi } = validarNueva();
    if (mal.length) {
      $("#nError").innerHTML = `Falta completar:<ul class="problemas">${mal.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`;
      $(".invalido", F)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    $("#nError").innerHTML = "";
    btn.disabled = true; btn.textContent = "Enviando…";
    try {
      const inc = await api.crear({ categoria: N.cat, subcategoria: N.sub, elementos: [...N.elems], ubicacion: ubi, persona: F.persona.value.trim(),
        titulo: F.titulo.value.trim(), descripcion: F.descripcion.value.trim(), urgencia: F.prioridad.value });
      for (const [n, a] of N.archivos.entries()) {
        btn.textContent = `Subiendo ${n + 1}/${N.archivos.length}…`;
        try { await api.subir(inc.id, a.file); } catch (e) { fallo(e); }
      }
      S.incs = await api.incidencias();
      F.reset(); S.nueva = formNuevo();
      toast(`Incidencia ${codigo(inc.id)} enviada`);
      S.estado = "pend"; mostrar("lista"); abrirFicha(inc.id);
    } catch (e) { fallo(e); }
    btn.disabled = false; btn.textContent = "Enviar incidencia";
  }

  // ─── Administración ───────────────────────────────────────────────────────
  function prepararAdmin() {
    const R = $("#resFiltros");
    R.desde.value = inicioCursoIso(); R.hasta.value = hoyIso();
    R.addEventListener("input", pintarResumen);
    $("#resumen").addEventListener("click", (e) => { const b = e.target.closest("[data-res]"); if (b) pintarDetalleResumen(b.dataset.res); });
    $("#resDetalle").addEventListener("click", (e) => {
      if (e.target.closest("[data-res-cerrar]")) { S.resSel = null; $("#resDetalle").innerHTML = ""; $$("#resumen .sel").forEach((x) => x.classList.remove("sel")); return; }
      const t = e.target.closest("[data-id]"); if (t) abrirFicha(+t.dataset.id);
    });
    $("#btnCsv").onclick = dialogoExportar;
    $("#btnNuevaUbi").onclick = () => editarUbi();
    $("#admUbis").addEventListener("click", (e) => { const b = e.target.closest("[data-editar]"); if (b) editarUbi(S.ubis.find((u) => u.id == b.dataset.editar)); });
    $("#admCuentaForm").onsubmit = async (e) => {
      e.preventDefault();
      const email = e.target.email.value.trim().toLowerCase();
      if (!cuentaColegio(email)) return toast(`Debe ser una cuenta @${CFG.dominio}`);
      const rol = e.target.rol.value, cats = rol === "tecnico" ? $$("#altaCats input:checked").map((x) => x.value) : [];
      try {
        await api.addCuenta(email, rol);
        if (cats.length) await api.ponerCategorias(email, cats);
        e.target.reset(); $("#altaCats").hidden = true; toast("Cuenta añadida"); S.gestores = await api.gestores(); pintarCuentas();
      } catch (err) { fallo(err); }
    };
    $("#altaCats").insertAdjacentHTML("beforeend", casillasCats([]));
    $("#admCuentaForm").rol.onchange = (e) => ($("#altaCats").hidden = e.target.value !== "tecnico");
    $("#admCuentas").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-quitar]"); if (!b) return;
      if (!(await confirmar("Quitar permiso", `${esc(b.dataset.quitar)} pasará a solo ver las incidencias.`, "Quitar", "aviso"))) return;
      try { await api.delCuenta(b.dataset.quitar); toast("Permiso quitado"); pintarCuentas(); } catch (err) { fallo(err); }
    });
    $("#admCuentas").addEventListener("change", async (e) => {
      const fila = e.target.closest("[data-cats]");
      if (fila) {
        const cats = $$("input:checked", fila).map((x) => x.value);
        try { await api.ponerCategorias(fila.dataset.cats, cats); toast(cats.length ? "Atiende: " + nombresCats(cats) : "Atiende todas las categorías"); S.gestores = await api.gestores(); pintarCuentas(); } catch (err) { fallo(err); pintarCuentas(); }
        return;
      }
      const s = e.target.closest("[data-rol]"); if (!s) return;
      try { await api.cambiarRol(s.dataset.rol, s.value); toast("Rol cambiado"); S.gestores = await api.gestores(); pintarCuentas(); } catch (err) { fallo(err); pintarCuentas(); }
    });
  }
  async function pintarAdmin() {
    try {
      if (S.admSec === "resumen") pintarResumen();
      else if (S.admSec === "ubicaciones") { S.ubis = await api.ubis(); pintarUbis(); }
      else if (S.admSec === "cuentas") await pintarCuentas();
    } catch (e) { fallo(e); }
  }
  const enFechas = () => { const R = $("#resFiltros"); return S.incs.filter((i) => (!R.desde.value || isoDia(new Date(i.creado)) >= R.desde.value) && (!R.hasta.value || isoDia(new Date(i.creado)) <= R.hasta.value)); };
  // Panel de control: cada cifra es un botón que lista esas incidencias debajo (S.resFiltros[clave] = [título, filtro])
  function pintarResumen() {
    const l = enFechas(), cerradas = l.filter((i) => i.cerrado), F = (S.resFiltros = {});
    const dias = cerradas.length ? cerradas.reduce((s, i) => s + (new Date(i.cerrado) - new Date(i.creado)), 0) / cerradas.length / 864e5 : null;
    let n = 0;
    const boton = (num, titulo, filtro, cls = "") => { const k = "f" + n++; F[k] = [titulo, filtro]; return num ? `<button type="button" class="cifra ${cls}" data-res="${k}" title="Ver: ${esc(titulo)}">${num}</button>` : ""; };
    const kpi = (titulo, filtro, txt, cls = "") => { const k = "f" + n++; F[k] = [titulo, filtro]; return `<button type="button" class="kpi kpi-btn ${cls}" data-res="${k}"><b>${l.filter(filtro).length}</b><span>${txt}</span></button>`; };
    const pend = (i) => PENDIENTES.includes(i.estado);
    const fila = (nombre, titulo, f, cls = "") => {
      const x = l.filter(f); if (!x.length) return "";
      return `<tr class="${cls}"><td>${nombre}</td>${Object.entries(ESTADOS).map(([k, v]) => `<td class="num">${boton(x.filter((i) => i.estado === k).length, `${titulo} · ${v}`, (i) => f(i) && i.estado === k)}</td>`).join("")}<td class="num">${boton(x.length, titulo, f, "total")}</td></tr>`;
    };
    const cabecera = (t) => `<thead><tr><th>${t}</th>${Object.values(ESTADOS).map((v) => `<th class="num">${v}</th>`).join("")}<th class="num">Total</th></tr></thead>`;
    const responsables = [...new Set(l.map((i) => i.asignado_nombre || ""))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b));
    const porUbi = Object.entries(l.reduce((m, i) => (i.ubicacion && (m[i.ubicacion] = (m[i.ubicacion] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
    $("#resumen").innerHTML = `<div class="kpis">
      ${kpi("Todas las incidencias", () => true, "incidencias")}
      ${kpi("Pendientes", pend, "pendientes")}
      ${kpi("Pendientes de prioridad alta", (i) => pend(i) && i.prioridad === "alta", "pendientes de prioridad alta", "kpi-alta")}
      ${kpi("Pendientes sin responsable", (i) => pend(i) && !i.asignado_email, "pendientes sin responsable", "kpi-aviso")}
      ${kpi("Cerradas", (i) => i.estado === "cerrada", "cerradas")}
      <div class="kpi"><b>${dias == null ? "—" : dias < 1 ? "< 1" : dias.toFixed(1).replace(".", ",")}</b><span>días de media hasta cerrarse</span></div></div>
      <h3 class="sub">Por tipo</h3>
      <div class="tabla-scroll"><table class="tabla-res">${cabecera("Tipo")}<tbody>
      ${CATS.map((c) => fila(`<b style="color:${c.color}">${esc(c.nombre)}</b>`, c.nombre, (i) => i.categoria === c.id, "fila-cat") + c.subs.map((s) => fila(`<span class="sangria">${esc(s.nombre)}</span>`, s.nombre, (i) => i.categoria === c.id && i.subcategoria === s.nombre)).join("")).join("")}
      </tbody></table></div>
      <h3 class="sub">Por responsable</h3>
      <div class="tabla-scroll"><table class="tabla-res">${cabecera("Responsable")}<tbody>
      ${responsables.map((r) => fila(r ? esc(r) : "<i>Sin asignar</i>", r || "Sin asignar", (i) => (i.asignado_nombre || "") === r)).join("")}
      </tbody></table></div>
      ${porUbi.length ? `<h3 class="sub">Aulas y zonas con más incidencias</h3><table class="tabla-res">${porUbi.map(([u, k]) => `<tr><td>${esc(u)}</td><td class="num">${boton(k, u, (i) => i.ubicacion === u, "total")}</td></tr>`).join("")}</table>` : ""}`;
    // Si había un detalle abierto, se vuelve a pintar con los datos nuevos
    if (S.resSel && F[S.resSel]?.[0] === S.resTitulo) pintarDetalleResumen(S.resSel); else { S.resSel = null; $("#resDetalle").innerHTML = ""; }
  }
  function pintarDetalleResumen(k) {
    const [titulo, filtro] = S.resFiltros[k];
    S.resSel = k; S.resTitulo = titulo;
    $$("#resumen [data-res]").forEach((b) => b.classList.toggle("sel", b.dataset.res === k));
    const l = enFechas().filter(filtro).sort((a, b) => PENDIENTES.includes(a.estado) && PENDIENTES.includes(b.estado) ? PESO[a.prioridad] - PESO[b.prioridad] || b.id - a.id : b.id - a.id);
    $("#resDetalle").innerHTML = `<div class="res-det-cab"><h3>${esc(titulo)} <span class="contador">${l.length}</span></h3><button type="button" class="btn mini" data-res-cerrar>Ocultar</button></div>
      <div class="tickets">${l.map(tarjeta).join("") || `<p class="vacio">Ninguna.</p>`}</div>`;
    $("#resDetalle").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // ─── Exportar: ficha suelta y, desde el panel, Excel / Word / PDF / CSV (exportar.js) ───
  const COLUMNAS = [
    ["numero", "Número", 9, (i) => codigo(i.id), true], ["creada", "Creada", 16, (i) => fechaHora(i.creado), true],
    ["categoria", "Categoría", 24, (i) => cat(i.categoria)?.nombre || i.categoria, true], ["subcategoria", "Subcategoría", 20, (i) => i.subcategoria, true],
    ["elementos", "Qué falla", 22, (i) => (i.elementos || []).join(", "), false], ["ubicacion", "Aula o zona", 18, (i) => i.ubicacion, true],
    ["persona", "Persona", 20, (i) => i.persona, false], ["titulo", "Resumen", 34, (i) => i.titulo, true],
    ["descripcion", "Descripción", 50, (i) => i.descripcion, false], ["urgencia", "Urgencia indicada", 14, (i) => PRIOS[urg(i)], false], ["prioridad", "Prioridad asignada", 14, (i) => PRIOS[i.prioridad], true],
    ["estado", "Estado", 15, (i) => ESTADOS[i.estado], true], ["responsable", "Responsable", 20, (i) => i.asignado_nombre || "", true],
    ["creador", "Creada por", 20, (i) => i.creado_nombre || i.creado_por, false], ["cerrada", "Cerrada", 16, (i) => (i.cerrado ? fechaHora(i.cerrado) : ""), false],
  ].map(([id, titulo, ancho, valor, porDefecto]) => ({ id, titulo, ancho, valor, porDefecto }));
  const plano = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent; };
  const fechaIso = (iso) => iso.split("-").reverse().join("/");

  async function modeloFicha(i, det) {
    const c = cat(i.categoria), fotos = det.adjuntos.filter((a) => a.tipo.startsWith("image/")), otros = det.adjuntos.filter((a) => !a.tipo.startsWith("image/"));
    return {
      titulo: `${codigo(i.id)} · ${i.titulo}`,
      etiquetas: `${ESTADOS[i.estado]} · Prioridad asignada: ${PRIOS[i.prioridad].toLowerCase()} · Urgencia indicada: ${PRIOS[urg(i)].toLowerCase()}`,
      datos: [["Tipo", `${c?.nombre || i.categoria} › ${i.subcategoria}`], ...(i.elementos?.length ? [["Qué falla", i.elementos.join(", ")]] : []),
        ["Aula o zona", i.ubicacion || "—"], ["Persona", i.persona], ["Creada", `${fechaHora(i.creado)} · ${i.creado_nombre || nombreDeEmail(i.creado_por)}`],
        ["Responsable", i.asignado_nombre || "Sin asignar"], ["Urgencia indicada", PRIOS[urg(i)]], ["Prioridad asignada", PRIOS[i.prioridad]], ...(i.cerrado ? [["Cerrada", fechaHora(i.cerrado)]] : []),
        ...(otros.length ? [["Otros archivos", otros.map((a) => a.nombre).join(", ")]] : [])],
      descripcion: i.descripcion,
      fotos: (await Promise.all(fotos.map((a) => api.urlAdjunto(a).catch(() => null)))).filter(Boolean),
      historial: det.eventos.map((e) => { const t = plano(textoEvento(e)); return [fechaHora(e.creado), e.autor_nombre || nombreDeEmail(e.autor), t.charAt(0).toUpperCase() + t.slice(1) + (e.texto ? ": " + e.texto : "")]; }),
    };
  }
  function modeloResumen(l) {
    const pend = (i) => PENDIENTES.includes(i.estado), cerradas = l.filter((i) => i.cerrado);
    const dias = cerradas.length ? cerradas.reduce((s, i) => s + (new Date(i.cerrado) - new Date(i.creado)), 0) / cerradas.length / 864e5 : null;
    const fila = (nombre, f) => { const x = l.filter(f); return x.length ? [nombre, ...Object.keys(ESTADOS).map((k) => x.filter((i) => i.estado === k).length || ""), x.length] : null; };
    const porTipo = [], destacadas = [];
    CATS.forEach((c) => { const f = fila(c.nombre, (i) => i.categoria === c.id); if (!f) return; destacadas.push(porTipo.length); porTipo.push(f);
      c.subs.forEach((s) => { const g = fila("   " + s.nombre, (i) => i.categoria === c.id && i.subcategoria === s.nombre); if (g) porTipo.push(g); }); });
    const responsables = [...new Set(l.map((i) => i.asignado_nombre || ""))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b));
    const porUbi = Object.entries(l.reduce((m, i) => (i.ubicacion && (m[i.ubicacion] = (m[i.ubicacion] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const cab = (t) => [t, ...Object.values(ESTADOS), "Total"];
    return {
      kpis: [[l.length, "incidencias"], [l.filter(pend).length, "pendientes"], [l.filter((i) => pend(i) && i.prioridad === "alta").length, "pendientes de prioridad alta"],
        [l.filter((i) => pend(i) && !i.asignado_email).length, "pendientes sin responsable"], [cerradas.length, "cerradas"],
        [dias == null ? "—" : dias < 1 ? "< 1" : dias.toFixed(1).replace(".", ","), "días de media hasta cerrarse"]],
      tablas: [{ titulo: "Por tipo", cabecera: cab("Tipo"), filas: porTipo, destacadas },
        { titulo: "Por responsable", cabecera: cab("Responsable"), filas: responsables.map((r) => fila(r || "Sin asignar", (i) => (i.asignado_nombre || "") === r)).filter(Boolean) },
        ...(porUbi.length ? [{ titulo: "Aulas y zonas con más incidencias", cabecera: ["Aula o zona", "Incidencias"], filas: porUbi }] : [])],
    };
  }
  async function descargarFicha(formato) {
    const { inc: i } = S.ficha;
    toast(`Preparando la ficha en ${formato === "pdf" ? "PDF" : "Word"}…`, 60000);
    try {
      await Exportar.generar(formato, { archivo: `incidencia-${String(i.id).padStart(4, "0")}`, titulo: "Ficha de incidencia",
        subtitulo: `Descargada el ${fechaHora(new Date())} por ${S.user.nombre}`, fichas: [await modeloFicha(i, S.ficha)] });
      toast("Ficha descargada");
    } catch (e) { fallo(e); }
  }
  async function dialogoExportar() {
    const R = $("#resFiltros"), sel = S.resSel && S.resFiltros?.[S.resSel];
    const periodo = `creadas del ${fechaIso(R.desde.value || inicioCursoIso())} al ${fechaIso(R.hasta.value || hoyIso())}`;
    const v = await dialogo(`<h2>Exportar</h2>
      <fieldset class="exp-grupo"><legend>Formato</legend><div class="formatos">
        ${[["excel", "Excel", "Hojas con filtros"], ["word", "Word", "Documento editable"], ["pdf", "PDF", "Para imprimir o enviar"], ["csv", "CSV", "Solo datos, sin formato"]]
          .map(([val, t, sub], k) => `<label class="formato"><input type="radio" name="formato" value="${val}" ${k ? "" : "checked"}><b>${t}</b><small>${sub}</small></label>`).join("")}</div></fieldset>
      <fieldset class="exp-grupo"><legend>Qué incidencias</legend>
        <label class="check"><input type="radio" name="origen" value="fechas" ${sel ? "" : "checked"}> Todas las del panel (${periodo})</label>
        ${sel ? `<label class="check"><input type="radio" name="origen" value="sel" checked> Solo la lista que estoy viendo: <b>${esc(sel[0])}</b></label>` : ""}
        <div class="exp-fila"><span>Estado:</span>${Object.entries(ESTADOS).map(([k, t]) => `<label class="check"><input type="checkbox" name="est" value="${k}" checked> ${t}</label>`).join("")}</div>
        <div class="exp-fila"><span>Tipo:</span>${CATS.map((c) => `<label class="check"><input type="checkbox" name="cat" value="${c.id}" checked> ${esc(c.nombre)}</label>`).join("")}</div>
      </fieldset>
      <fieldset class="exp-grupo" data-no-csv><legend>Qué incluir</legend>
        <label class="check"><input type="checkbox" name="resumen" checked> Resumen con las cifras</label>
        <label class="check"><input type="checkbox" name="listado" checked> Listado de incidencias</label>
        <label class="check"><input type="checkbox" name="fichas"> Fichas completas, con historial y fotos (una por página)</label>
      </fieldset>
      <fieldset class="exp-grupo" data-cols><legend>Columnas del listado</legend><div class="exp-cols">
        ${COLUMNAS.map((c) => `<label class="check"><input type="checkbox" name="col" value="${c.id}" ${c.porDefecto ? "checked" : ""}> ${c.titulo}</label>`).join("")}</div></fieldset>
      <div class="dlg-botones"><button class="btn" value="" formnovalidate>Cancelar</button><button class="btn primario" value="ok">Exportar</button></div>`, (f) => {
      const ver = () => { const csv = f.formato.value === "csv"; $("[data-no-csv]", f).hidden = csv; $("[data-cols]", f).hidden = !csv && !f.listado.checked; };
      f.addEventListener("change", ver); ver();
    });
    if (v !== "ok") return;
    const f = $("#dlgForm"), marcados = (n) => $$(`[name=${n}]:checked`, f).map((x) => x.value);
    const formato = f.formato.value, origen = f.origen.value || "fechas", ests = marcados("est"), cats = marcados("cat");
    const l = (origen === "sel" ? enFechas().filter(sel[1]) : enFechas()).filter((i) => ests.includes(i.estado) && cats.includes(i.categoria)).sort((a, b) => a.id - b.id);
    if (!l.length) return toast("No hay incidencias con esa selección");
    const incluir = { resumen: formato !== "csv" && f.resumen.checked, listado: formato === "csv" || f.listado.checked, fichas: formato !== "csv" && f.fichas.checked };
    if (!incluir.resumen && !incluir.listado && !incluir.fichas) return toast("Marca qué quieres incluir");
    const cols = COLUMNAS.filter((c) => marcados("col").includes(c.id));
    if (incluir.listado && !cols.length) return toast("Marca alguna columna del listado");
    if (incluir.fichas && l.length > 60 && !(await confirmar("Muchas fichas", `Vas a exportar ${l.length} fichas completas. Puede tardar un poco.`, "Seguir"))) return;
    toast("Preparando el documento…", 120000);
    try {
      const modelo = { archivo: `incidencias-${hoyIso()}`, titulo: "Incidencias",
        subtitulo: `${origen === "sel" ? sel[0] + " · " : ""}${periodo.charAt(0).toUpperCase() + periodo.slice(1)} · ${l.length} ${l.length === 1 ? "incidencia" : "incidencias"} · exportado el ${fechaHora(new Date())}` };
      if (incluir.resumen) modelo.resumen = modeloResumen(l);
      if (incluir.listado) modelo.listado = { columnas: cols.map((c) => ({ titulo: c.titulo, ancho: c.ancho })), filas: l.map((i) => cols.map((c) => c.valor(i) ?? "")) };
      if (incluir.fichas) { modelo.fichas = []; for (const [n, i] of l.entries()) { toast(`Preparando las fichas (${n + 1}/${l.length})…`, 120000); modelo.fichas.push(await modeloFicha(i, await api.detalle(i.id))); } }
      await Exportar.generar(formato, modelo);
      toast("Descargado");
    } catch (e) { fallo(e); }
  }
  function pintarUbis() {
    const grupos = [...new Set(S.ubis.map((u) => u.grupo || "Sin grupo"))];
    $("#admUbis").innerHTML = grupos.map((g) => `<h3 class="sub">${esc(g)}</h3><table>${S.ubis.filter((u) => (u.grupo || "Sin grupo") === g).map((u) => `<tr class="${u.activo ? "" : "de-baja"}">
      <td>${esc(u.nombre)}${u.activo ? "" : " <small>(desactivada)</small>"}</td><td><small>${u.tipo === "aula" ? "Aula" : "Zona común"}</small></td>
      <td class="acciones-fila"><button class="btn mini" type="button" data-editar="${u.id}">Editar</button></td></tr>`).join("")}</table>`).join("") || `<p class="vacio">No hay aulas ni zonas.</p>`;
  }
  async function editarUbi(u) {
    const grupos = [...new Set(S.ubis.map((x) => x.grupo).filter(Boolean))];
    const v = await dialogo(`<h2>${u ? "Editar" : "Nueva"} aula o zona</h2>
      <label class="campo">Nombre <input name="nombre" required maxlength="80" value="${esc(u?.nombre || "")}" placeholder="Ej.: 2º Primaria B"></label>
      <div class="fila">
        <label class="campo crece">Tipo <select name="tipo"><option value="aula" ${u?.tipo !== "zona" ? "selected" : ""}>Aula</option><option value="zona" ${u?.tipo === "zona" ? "selected" : ""}>Zona común</option></select></label>
        <label class="campo crece">Grupo <input name="grupo" list="dlGrupos" maxlength="60" value="${esc(u?.grupo || "")}" placeholder="ESO, Primaria, Zonas comunes…"></label>
      </div>
      <datalist id="dlGrupos">${grupos.map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
      <label class="check"><input type="checkbox" name="activo" ${u?.activo === false ? "" : "checked"}> Se puede elegir al crear incidencias</label>
      <div class="dlg-botones">${u ? `<button class="btn peligro izq" value="borrar" formnovalidate>Borrar</button>` : ""}<button class="btn" value="" formnovalidate>Cancelar</button><button class="btn primario" value="ok">Guardar</button></div>`);
    try {
      if (v === "borrar") {
        const n = S.incs.filter((i) => i.ubicacion === u.nombre).length;
        if (!(await confirmar("Borrar aula o zona", `Se borrará «${esc(u.nombre)}» de la lista.${n ? ` Las ${n} incidencias que la nombran no cambian. Si solo quieres que no se elija más, desactívala.` : ""}`, "Borrar", "aviso"))) return;
        await api.borrarUbi(u.id);
      } else if (v === "ok") {
        const D = S.dlgDatos;
        await api.guardarUbi({ ...(u ? { id: u.id } : { orden: Math.max(0, ...S.ubis.map((x) => x.orden)) + 1 }), nombre: D.nombre.trim(), tipo: D.tipo, grupo: D.grupo.trim(), activo: !!D.activo });
      } else return;
      S.ubis = await api.ubis(); pintarUbis(); toast("Guardado");
    } catch (e) { fallo(e); }
  }
  const casillasCats = (marcadas, attr = "") => CATS.map((c) => `<label class="check cat-chk" style="--c:${c.color}"><input type="checkbox" value="${c.id}" ${attr} ${marcadas.includes(c.id) ? "checked" : ""}> ${esc(c.nombre)}</label>`).join("");
  async function pintarCuentas() {
    const l = await api.cuentas();
    $("#admCuentas").innerHTML = `<table class="tabla-cuentas">${l.map((a) => `<tr><td>${esc(a.email)}${a.email === S.user.email ? " <small>(tú)</small>" : ""}</td>
      <td>${a.email === S.user.email ? ROLES[a.rol] || a.rol : `<select data-rol="${esc(a.email)}" aria-label="Rol de ${esc(a.email)}">${Object.entries(ROLES).map(([k, t]) => `<option value="${k}" ${k === a.rol ? "selected" : ""}>${t}</option>`).join("")}</select>`}</td>
      <td>${a.rol === "tecnico" ? `<div class="cats-fila" data-cats="${esc(a.email)}">${casillasCats(a.categorias || [])}</div><small class="pista">${a.categorias?.length ? "" : "Ninguna marcada: atiende todas."}</small>` : a.rol === "admin" ? "<small>Todas</small>" : ""}</td>
      <td class="acciones-fila">${a.email === S.user.email ? "" : `<button class="btn mini peligro" type="button" data-quitar="${esc(a.email)}">Quitar</button>`}</td></tr>`).join("")}</table>`;
  }

  // ─── Modo prueba: incidencias de ejemplo ──────────────────────────────────
  async function generarEjemplo() {
    const d = demoLeer(), ahora = Date.now(), h = 36e5;
    const tecInf = { email: "tecnico.informatica@salesianas.org", nombre: "Tecnico Informatica" }, tecMan = { email: "tecnico.mantenimiento@salesianas.org", nombre: "Tecnico Mantenimiento" };
    const coord = { email: "coord.eso@salesianas.org", nombre: "Coordinación ESO" };
    const ej = [
      ["informatica", "Equipos de aula", ["Proyector"], "2º ESO A", "Ana Felipe", "El proyector no enciende", "Al pulsar el botón se enciende la luz naranja pero no proyecta. Se ha probado con el mando y desenchufando.", "alta", "en_proceso", 3],
      ["informatica", "Microsoft 365", ["Contraseña olvidada"], "", "Mario Espejo", "No puede entrar en su cuenta", "Ha olvidado la contraseña y no tiene configurado el móvil para recuperarla.", "media", "cerrada", 50],
      ["informatica", "Microsoft 365", ["Grupo de Teams"], "", "Laura Ramos", "Añadir al equipo de Teams de 3º ESO", "Necesita estar en el equipo «Tutores 3º ESO» y en su SharePoint.", "baja", "abierta", 20],
      ["informatica", "Conectividad y redes", ["Wifi"], "Biblioteca", "Rocío Cano", "La wifi se corta en la biblioteca", "Desde la semana pasada se desconectan los iPads cada pocos minutos, sobre todo al fondo.", "media", "pausada", 120],
      ["mobiliario", "Mobiliario del aula", ["Persiana o cortina"], "1º Bach. B", "Ángela Rodríguez", "Persiana atascada", "La persiana de la ventana del fondo no baja; entra el sol de lleno en las pizarras.", "media", "abierta", 6],
      ["mobiliario", "Mobiliario del aula", ["Silla", "Mesa"], "3º ESO B", "Coordinación ESO", "Dos sillas y una mesa rotas", "Una silla con la pata suelta, otra sin respaldo y una mesa que cojea.", "baja", "abierta", 30],
      ["infraestructura", "Fontanería", ["Fuga de agua"], "Baños", "Conserjería", "Fuga en el baño de chicas de la 1ª planta", "Sale agua por debajo del lavabo del medio. Se ha puesto un cubo.", "alta", "abierta", 1],
      ["infraestructura", "Climatización", ["Aire acondicionado"], "Aula de Informática", "Mario Espejo", "El aire acondicionado gotea", "Gotea encima de los ordenadores de la última fila.", "alta", "cerrada", 200],
      ["fungibles", "Rotuladores y pizarra", ["Recarga de rotuladores"], "Sala de profesores", "Coordinación Primaria", "Recarga de rotuladores de pizarra", "Hacen falta recargas negras y azules para el ciclo.", "baja", "abierta", 10],
    ];
    for (const [c, s, el, ubi, per, tit, des, pri, est, horas] of ej) {
      const t = new Date(ahora - horas * h).toISOString(), id = ++d.seq;
      const tec = c === "informatica" ? tecInf : tecMan, asig = est !== "abierta" ? tec : null;
      d.incs.push({ id, categoria: c, subcategoria: s, elementos: el, ubicacion: ubi, persona: per, titulo: tit, descripcion: des, prioridad: pri, urgencia: { "Añadir al equipo de Teams de 3º ESO": "alta", "La wifi se corta en la biblioteca": "alta" }[tit] || pri, estado: est,
        asignado_email: asig?.email || null, asignado_nombre: asig?.nombre || null, creado_por: coord.email, creado_nombre: coord.nombre, creado: t, actualizado: t,
        cerrado: est === "cerrada" ? new Date(ahora - (horas - 20) * h).toISOString() : null });
      demoEvento(d, id, "creada", {}, t, coord);
      const inc = d.incs[d.incs.length - 1];
      if (inc.urgencia !== pri) demoEvento(d, id, "prioridad", { de: inc.urgencia, a: pri }, new Date(ahora - (horas - 0.5) * h).toISOString(), tec);
      if (asig) {
        const t2 = new Date(ahora - (horas - 1) * h).toISOString();
        demoEvento(d, id, "asignacion", { a: tec.nombre }, t2, tec);
        demoEvento(d, id, "estado", { de: "abierta", a: "en_proceso" }, t2, tec);
      }
      if (est === "pausada") demoEvento(d, id, "estado", { de: "en_proceso", a: "pausada", }, new Date(ahora - (horas - 5) * h).toISOString(), tec),
        demoEvento(d, id, "comentario", { texto: "Pedido un punto de acceso nuevo. Llega en unos 10 días." }, new Date(ahora - (horas - 5) * h).toISOString(), tec);
      if (est === "cerrada") demoEvento(d, id, "estado", { de: "en_proceso", a: "cerrada" }, new Date(ahora - (horas - 20) * h).toISOString(), tec),
        demoEvento(d, id, "comentario", { texto: "Resuelto. Si vuelve a pasar, abrid otra incidencia." }, new Date(ahora - (horas - 20) * h).toISOString(), tec);
    }
    demoGuardar(d);
    S.incs = await api.incidencias(); S.estado = "pend"; mostrar("lista"); toast("Incidencias de ejemplo creadas");
  }

  // ─── Instalar como app ────────────────────────────────────────────────────
  let instalar = null;
  const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const enApp = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  function pintarInstalar() { $$(".instalar").forEach((el) => (el.hidden = el.matches(".franja .instalar") ? enApp() : !instalar)); }
  async function instalarApp() {
    if (instalar === "ios") {
      dialogo(`<h2>Instalar la app</h2>
        <ol class="pasos"><li>Pulsa el botón <b>Compartir</b> de Safari (el cuadrado con una flecha hacia arriba).</li>
        <li>Elige <b>«Añadir a pantalla de inicio»</b>.</li><li>Pulsa <b>Añadir</b>. Aparecerá el icono del colegio en tu pantalla.</li></ol>
        <div class="dlg-botones"><button class="btn primario" value="">Entendido</button></div>`);
      return;
    }
    if (instalar) { instalar.prompt(); await instalar.userChoice.catch(() => {}); instalar = null; pintarInstalar(); return; }
    dialogo(`<h2>Instalar la app</h2>
      <p>Abre el menú del navegador (⋮ o ⋯) y elige <b>«Instalar aplicación»</b> o <b>«Añadir a pantalla de inicio»</b>.</p>
      <div class="dlg-botones"><button class="btn primario" value="">Entendido</button></div>`);
  }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); instalar = e; pintarInstalar(); });
  window.addEventListener("appinstalled", () => { instalar = null; pintarInstalar(); toast("¡App instalada!"); });
  if (esIOS() && !enApp()) instalar = "ios";
  document.addEventListener("click", (e) => { if (e.target.closest(".instalar")) { e.preventDefault(); instalarApp(); } });
  pintarInstalar();

  iniciar();
})();
