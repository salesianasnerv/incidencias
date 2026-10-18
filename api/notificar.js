// Envía los avisos por correo de las incidencias con Resend (resend.com).
// La llama la propia base de datos (supabase/avisos.sql) cuando se crea una incidencia,
// cambia de estado o recibe un comentario; ya trae decidido a quién avisar («para»).
// Variables de entorno en Vercel:
//   RESEND_API_KEY  clave de Resend (obligatoria)
//   AVISOS_SECRETO  la misma clave secreta que se pone en Supabase (obligatoria)
//   AVISOS_DE       remitente, con el dominio verificado en Resend.
//                   Ej.: Incidencias <incidencias@nervion.salesianas.org>
//   AVISOS_WEB      dirección de la web (opcional; por defecto https://incidencias-nervion.vercel.app)
//   AVISOS_PRUEBA   si vale «si», no envía nada y devuelve el correo que se enviaría

const crypto = require("crypto");

const WEB = (process.env.AVISOS_WEB || "https://incidencias-nervion.vercel.app").replace(/\/+$/, "");
const DE = process.env.AVISOS_DE || "Incidencias <onboarding@resend.dev>";
const ESTADOS = { abierta: "Abierta", en_proceso: "En proceso", pausada: "Pausada (piezas)", cerrada: "Cerrada" };
const PRIOS = { baja: "Baja", media: "Media", alta: "Alta / crítica" };
const CATEGORIAS = { informatica: "Informática y tecnología", mobiliario: "Mobiliario y equipamiento", infraestructura: "Infraestructura y mantenimiento", fungibles: "Fungibles" };
const COLORES = { abierta: "#009abb", en_proceso: "#ee712a", pausada: "#7a5195", cerrada: "#5f6b00" };

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (id) => "#" + String(id).padStart(4, "0");
const esCorreo = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Compara la clave sin dar pistas por el tiempo que tarda
const mismaClave = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

// Asunto, frase principal y texto del correo según lo que ha pasado
function redactar({ evento: e, incidencia: i }) {
  const n = num(i.id), quien = e.autor_nombre || e.autor || "Alguien";
  const enlace = `${WEB}/#inc-${i.id}`;
  let asunto, frase, extra = "";
  if (e.tipo === "creada") {
    asunto = `Nueva incidencia ${n}: ${i.titulo}`;
    frase = `${quien} ha creado una incidencia nueva.`;
  } else if (e.tipo === "estado") {
    asunto = `Incidencia ${n} ${e.a === "cerrada" ? "cerrada" : "→ " + (ESTADOS[e.a] || e.a)}: ${i.titulo}`;
    frase = `${quien} ha cambiado el estado de tu incidencia: ${ESTADOS[e.de] || e.de} → ${ESTADOS[e.a] || e.a}.`;
  } else {
    asunto = `Nuevo comentario en la incidencia ${n}: ${i.titulo}`;
    frase = `${quien} ha comentado en tu incidencia:`;
    extra = String(e.texto || "").trim();
  }

  const datos = [
    ["Incidencia", `${n} · ${i.titulo}`],
    ["Estado", ESTADOS[i.estado] || i.estado],
    ["Prioridad", PRIOS[i.prioridad] || i.prioridad],
    ["Tipo", [CATEGORIAS[i.categoria] || i.categoria, i.subcategoria, (i.elementos || []).join(", ")].filter(Boolean).join(" › ")],
    ["Dónde", i.ubicacion || "—"],
    ["Persona", i.persona],
    ["Creada por", i.creado_nombre || i.creado_por],
    ...(i.asignado_nombre ? [["Responsable", i.asignado_nombre]] : []),
    ...(e.tipo === "creada" ? [["Descripción", i.descripcion]] : []),
  ];

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1d2a30;max-width:620px">
  <p style="font-size:15px;margin:0 0 12px">${esc(frase)}</p>
  ${extra ? `<blockquote style="margin:0 0 16px;padding:10px 14px;border-left:4px solid ${COLORES[i.estado] || "#009abb"};background:#f3f7f9;white-space:pre-wrap">${esc(extra)}</blockquote>` : ""}
  <table cellpadding="7" style="border-collapse:collapse;font-size:14px;width:100%">
    ${datos.map(([k, v]) => `<tr><th align="left" valign="top" style="border:1px solid #dde4e7;background:#f3f7f9;width:130px">${k}</th>
      <td style="border:1px solid #dde4e7;white-space:pre-wrap">${esc(v)}</td></tr>`).join("")}
  </table>
  <p style="margin:18px 0"><a href="${esc(enlace)}" style="background:#009abb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">Abrir la incidencia</a></p>
  <p style="color:#6b7b82;font-size:12px;margin:0">Aviso automático de la web de Incidencias · Escuelas Salesianas María Auxiliadora Nervión. Si respondes a este correo, le llega a ${esc(quien)}.</p>
</div>`;

  const texto = [frase, extra && `\n«${extra}»\n`, ...datos.map(([k, v]) => `${k}: ${v}`), "", `Abrir la incidencia: ${enlace}`]
    .filter((x) => x !== "").join("\n");
  return { asunto: `[Incidencias] ${asunto}`.slice(0, 200), html, texto };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método no permitido." });
  if (!mismaClave(req.headers["x-avisos-secreto"], process.env.AVISOS_SECRETO)) {
    return res.status(401).json({ ok: false, error: "Clave secreta incorrecta." });
  }

  let b;
  try { b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}; }
  catch { return res.status(400).json({ ok: false, error: "Datos no válidos." }); }
  const para = [...new Set((b.para || []).map((x) => String(x).trim().toLowerCase()))].filter(esCorreo).slice(0, 50);
  if (!b.evento || !b.incidencia || !b.incidencia.id) return res.status(400).json({ ok: false, error: "Faltan datos de la incidencia." });
  if (!para.length) return res.status(200).json({ ok: true, enviados: 0 });

  const { asunto, html, texto } = redactar(b);
  const autor = String(b.evento.autor || "").toLowerCase();
  const correo = { from: DE, to: para, subject: asunto, html, text: texto, ...(esCorreo(autor) ? { reply_to: autor } : {}) };

  if (process.env.AVISOS_PRUEBA === "si") return res.status(200).json({ ok: true, prueba: true, correo });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ ok: false, error: "Falta configurar el envío (RESEND_API_KEY)." });

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(correo),
    });
    if (!r.ok) {
      console.error("Resend", r.status, await r.text());
      return res.status(502).json({ ok: false, error: "El servicio de correo no ha aceptado el envío." });
    }
    return res.status(200).json({ ok: true, enviados: para.length });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ ok: false, error: "No se ha podido conectar con el servicio de correo." });
  }
};

module.exports.redactar = redactar;
