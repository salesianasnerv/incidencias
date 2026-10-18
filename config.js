// ─── Configuración de Incidencias ─────────────────────────────────────────────
// Proyecto de Supabase «Acceso Microsoft 365» (el mismo del Control de baños y la Reserva de espacios).
// Si supabaseUrl se deja vacío, la web funciona en MODO PRUEBA: guarda los datos solo en el navegador.
window.APP_CONFIG = {
  supabaseUrl: "https://hblayjaknhfxieqbzrlq.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibGF5amFrbmhmeGllcWJ6cmxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMjg0ODEsImV4cCI6MjEwNjgwNDQ4MX0.K2iWyQAt9upNBXUhdZuV-Nle9fkCMYgQ6jTBBO0MluE",

  dominio: "salesianas.org",          // solo pueden entrar cuentas de este dominio
  dominiosExtra: ["salesianes.org"],  // otros dominios del mismo Microsoft 365 del colegio

  maxAdjuntos: 5,                     // archivos por incidencia o comentario
  maxMB: 10,                          // tamaño máximo de cada archivo (las fotos se reducen solas antes de subirlas)

  // Tipos de incidencia. «id» de la categoría no se cambia (lo comprueba la base de datos);
  // los nombres, subcategorías y elementos sí se pueden cambiar o ampliar aquí.
  // ubicacion: "aula" = hay que elegir el aula · "zona" = una zona común · "cualquiera" = aula o zona
  //            "opcional" = no hace falta (cuentas de Microsoft 365 y Google Workspace)
  categorias: [
    { id: "informatica", nombre: "Informática y tecnología", color: "#009abb", icono: "pantalla", subs: [
      { nombre: "Equipos de aula", ubicacion: "aula",
        elementos: ["Proyector", "Pantalla", "Altavoz", "Apple TV", "Ordenador del aula", "Pizarra digital", "Cables y adaptadores", "Otro"] },
      { nombre: "Conectividad y redes", ubicacion: "cualquiera",
        elementos: ["Wifi", "Red por cable", "Impresora en red", "Otro"] },
      { nombre: "Microsoft 365", ubicacion: "opcional", cuenta: true,
        elementos: ["Contraseña olvidada", "Licencia", "Grupo de Teams", "Sitio de SharePoint", "Correo (Outlook)", "Otro"] },
      { nombre: "Google Workspace", ubicacion: "opcional", cuenta: true,
        elementos: ["Contraseña olvidada", "Licencia", "Classroom", "Grupo o unidad compartida", "Correo (Gmail)", "Otro"] },
    ] },
    { id: "mobiliario", nombre: "Mobiliario y equipamiento", color: "#8a9400", icono: "silla", subs: [
      { nombre: "Mobiliario del aula", ubicacion: "aula",
        elementos: ["Mesa", "Silla", "Pizarra", "Armario o estantería", "Persiana o cortina", "Perchero", "Otro"] },
      { nombre: "Mobiliario de zonas comunes", ubicacion: "zona",
        elementos: ["Mesa", "Silla o banco", "Armario o estantería", "Papelera", "Tablón de anuncios", "Otro"] },
    ] },
    { id: "infraestructura", nombre: "Infraestructura y mantenimiento", color: "#ee712a", icono: "llave", subs: [
      { nombre: "Electricidad", ubicacion: "cualquiera",
        elementos: ["Luces", "Enchufe", "Interruptor", "Cuadro eléctrico", "Otro"] },
      { nombre: "Fontanería", ubicacion: "cualquiera",
        elementos: ["Grifo", "Cisterna o inodoro", "Fuga de agua", "Atasco", "Fuente", "Otro"] },
      { nombre: "Climatización", ubicacion: "cualquiera",
        elementos: ["Aire acondicionado", "Calefacción o radiador", "Ventilador", "Otro"] },
      { nombre: "Cerrajería y accesos", ubicacion: "cualquiera",
        elementos: ["Llave", "Cerradura", "Puerta", "Ventana", "Acceso o portero", "Otro"] },
    ] },
    { id: "fungibles", nombre: "Fungibles", color: "#7a5195", icono: "caja", subs: [
      { nombre: "Papelería", ubicacion: "cualquiera", elementos: ["Folios", "Cartulinas", "Sobres", "Otro"] },
      { nombre: "Rotuladores y pizarra", ubicacion: "cualquiera", elementos: ["Recarga de rotuladores", "Rotuladores nuevos", "Borrador", "Otro"] },
      { nombre: "Impresoras", ubicacion: "cualquiera", elementos: ["Tinta o tóner", "Papel", "Otro"] },
      { nombre: "Otro material", ubicacion: "cualquiera", elementos: [] },
    ] },
  ],
};
