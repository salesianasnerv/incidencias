// ─── Exportar a PDF, Word, Excel y CSV con el formato corporativo ─────────────
// Copia la «Hoja corporativa» del colegio: cabecera con el lema y el logo horizontal, pie con
// «SALESIANAS NERVIÓN · Escuelas Salesianas María Auxiliadora», la dirección y la trama de colores.
// Las librerías se descargan solo la primera vez que se exporta.
//
// Exportar.generar(formato, modelo), con formato "pdf" | "word" | "excel" | "csv" y modelo:
//   { archivo, titulo, subtitulo,
//     resumen?: { kpis: [[cifra, texto]], tablas: [{ titulo, cabecera: [], filas: [[]], destacadas: [índices] }] },
//     listado?: { columnas: [{ titulo, ancho }], filas: [[]] },
//     fichas?: [{ titulo, etiquetas, datos: [[etiqueta, valor]], descripcion, fotos: [url], historial: [[cuándo, quién, qué]] }] }
window.Exportar = (() => {
  "use strict";
  const CDN = "https://cdn.jsdelivr.net/npm/";
  const LIBS = {
    excel: CDN + "exceljs@4.4.0/dist/exceljs.min.js",
    word: CDN + "docx@8.5.0/build/index.umd.js",
    pdf: CDN + "pdfmake@0.2.10/build/pdfmake.min.js",
  };
  const FUENTE = (peso, estilo = "normal") => `${CDN}@fontsource/fira-sans@5.0.12/files/fira-sans-latin-${peso}-${estilo}.woff`;
  const C = { azul: "1392B3", lema: "1691B1", pieAzul: "1F9CC2", pieVerde: "C6C81E", texto: "1E293B", suave: "64748B", borde: "D8DEE6", fondo: "EEF2F6" };
  const LEMA = "La alegría de crecer juntos";
  const PIE1 = ["SALESIANAS NERVIÓN", "Escuelas Salesianas María Auxiliadora"];
  const PIE2 = "C/ SANTA MARÍA MAZZARELLO, 1     41005 SEVILLA     954 63 23 47     www.nervion.salesianas.org";

  const cargas = {};
  const cargar = (k) => (cargas[k] ||= new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = LIBS[k]; s.onload = ok;
    s.onerror = () => { delete cargas[k]; mal(new Error("No se pudo cargar el generador de documentos. Revisa la conexión.")); };
    document.head.appendChild(s);
  }));

  // Imágenes: cualquier formato pasa a PNG/JPEG con su tamaño (los generadores no leen HEIC, WebP…)
  const imgCache = new Map();
  function imagen(url, max = 1400, tipo = "image/jpeg") {
    const k = url + "|" + max + "|" + tipo;
    if (!imgCache.has(k)) imgCache.set(k, (async () => {
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const f = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
      const g = c.getContext("2d");
      if (tipo === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(bmp, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL(tipo, 0.86);
      const bin = atob(dataUrl.split(",")[1]), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return { dataUrl, buffer: buf, w: c.width, h: c.height };
    })());
    return imgCache.get(k);
  }
  const corporativas = () => Promise.all([imagen("img/logo-horizontal.png", 900, "image/png"), imagen("img/trama.png", 1600, "image/png")]);
  // Fotos de las fichas: si alguna no se puede leer, se omite
  const fotosDe = (fichas) => Promise.all((fichas || []).map((f) => Promise.all((f.fotos || []).map((u) => imagen(u, 1200).catch(() => null))).then((l) => l.filter(Boolean))));
  const encaja = (img, maxW, maxH) => { const k = Math.min(maxW / img.w, maxH / img.h, 1); return [Math.round(img.w * k), Math.round(img.h * k)]; };

  function descargar(blob, nombre) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  // El listado va en horizontal si tiene muchas columnas
  const apaisado = (m) => (m.listado?.columnas.length || 0) > 6;

  // ── PDF (pdfmake, con Fira Sans) ───────────────────────────────────────────
  async function pdf(m) {
    await cargar("pdf");
    const [[logo, trama], fotos] = await Promise.all([corporativas(), fotosDe(m.fichas)]);
    pdfMake.fonts = { Fira: { normal: FUENTE(400), bold: FUENTE(700), italics: FUENTE(400, "italic"), bolditalics: FUENTE(700) } };
    const hex = (c) => "#" + c;
    const tabla = (cab, filas, anchos, destacadas = [], tam = 9) => ({
      table: { headerRows: 1, widths: anchos || cab.map(() => "*"), dontBreakRows: true,
        body: [cab.map((t) => ({ text: t, bold: true, color: "#fff", fillColor: hex(C.azul), fontSize: tam })),
          ...filas.map((f, n) => f.map((t) => ({ text: String(t ?? ""), fontSize: tam, bold: destacadas.includes(n), fillColor: destacadas.includes(n) ? hex(C.fondo) : n % 2 ? "#F8FAFC" : null })))] },
      layout: { hLineColor: () => hex(C.borde), vLineColor: () => hex(C.borde), hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 3, paddingBottom: () => 3 },
      margin: [0, 0, 0, 12],
    });
    const contenido = [{ text: m.titulo, style: "h1" }, { text: m.subtitulo || "", style: "sub" }];
    let hayAlgo = false;
    if (m.resumen) {
      hayAlgo = true;
      contenido.push({ text: "Resumen", style: "h2" },
        { table: { widths: m.resumen.kpis.map(() => "*"), body: [m.resumen.kpis.map(([n, t]) => ({ stack: [{ text: String(n), fontSize: 18, bold: true, color: hex(C.azul) }, { text: t, fontSize: 8, color: hex(C.suave) }], fillColor: hex(C.fondo), margin: [6, 6, 6, 6] }))] },
          layout: { hLineColor: () => "#fff", vLineColor: () => "#fff", hLineWidth: () => 3, vLineWidth: () => 3 }, margin: [0, 0, 0, 12] });
      m.resumen.tablas.forEach((t) => contenido.push({ text: t.titulo, style: "h3" }, tabla(t.cabecera, t.filas, ["*", ...t.cabecera.slice(1).map(() => 52)], t.destacadas)));
    }
    if (m.listado) {
      const giro = apaisado(m);
      contenido.push({ text: "Listado de incidencias", style: "h2", pageBreak: hayAlgo ? "before" : undefined, pageOrientation: giro ? "landscape" : "portrait" },
        tabla(m.listado.columnas.map((c) => c.titulo), m.listado.filas, m.listado.columnas.map((c) => (c.ancho >= 30 ? "*" : "auto")), [], 7.5));
      hayAlgo = true;
    }
    (m.fichas || []).forEach((f, n) => {
      contenido.push({ text: f.titulo, style: "h2", pageBreak: hayAlgo ? "before" : undefined, pageOrientation: "portrait" },
        { text: f.etiquetas, color: hex(C.suave), margin: [0, 0, 0, 8] },
        { table: { widths: [110, "*"], body: f.datos.map(([e, v]) => [{ text: e, bold: true, color: hex(C.suave), fontSize: 9 }, { text: String(v ?? ""), fontSize: 10 }]) },
          layout: { hLineColor: () => hex(C.borde), vLineWidth: () => 0, hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5), paddingTop: () => 4, paddingBottom: () => 4 }, margin: [0, 0, 0, 10] },
        { text: "Descripción", style: "h3" },
        { table: { widths: ["*"], body: [[{ text: f.descripcion, fillColor: hex(C.fondo), margin: [8, 6, 8, 6] }]] }, layout: "noBorders", margin: [0, 0, 0, 10] });
      if (fotos[n].length) {
        contenido.push({ text: "Fotos", style: "h3" });
        for (let i = 0; i < fotos[n].length; i += 2) contenido.push({ columns: fotos[n].slice(i, i + 2).map((img) => ({ image: img.dataUrl, fit: [205, 170] })), columnGap: 12, margin: [0, 0, 0, 8] });
      }
      if (f.historial?.length) contenido.push({ text: "Historial", style: "h3" }, tabla(["Cuándo", "Quién", "Qué"], f.historial, [80, 110, "*"], [], 8.5));
      hayAlgo = true;
    });

    const doc = {
      pageSize: "A4", pageMargins: [85, 92, 85, 92],
      defaultStyle: { font: "Fira", fontSize: 10, color: hex(C.texto), lineHeight: 1.15 },
      styles: {
        h1: { fontSize: 20, bold: true, color: hex(C.azul) }, sub: { fontSize: 10, color: hex(C.suave), margin: [0, 2, 0, 14] },
        h2: { fontSize: 14, bold: true, color: hex(C.azul), margin: [0, 6, 0, 6] }, h3: { fontSize: 10.5, bold: true, color: hex(C.azul), margin: [0, 4, 0, 4] },
      },
      header: (pag, total, tam) => ({ margin: [85, 30, 85, 0], columns: [
        { text: LEMA, color: hex(C.lema), fontSize: 14, margin: [0, 12, 0, 0] },
        { image: logo.dataUrl, width: 117, alignment: "right" }] }),
      footer: (pag, total, tam) => ({ stack: [
        { text: `Página ${pag} de ${total}`, fontSize: 7, color: hex(C.suave), alignment: "right", margin: [0, 0, 40, 4] },
        { text: [{ text: PIE1[0], color: hex(C.pieVerde) }, "          ", { text: PIE1[1], color: hex(C.pieAzul) }], fontSize: 9, alignment: "center" },
        { text: PIE2, fontSize: 8, color: hex(C.pieAzul), alignment: "center", margin: [0, 1, 0, 6], preserveLeadingSpaces: true },
        { image: trama.dataUrl, width: tam.width }] }),
      content: contenido,
      info: { title: m.titulo, author: "Escuelas Salesianas María Auxiliadora · Nervión" },
    };
    await new Promise((ok) => pdfMake.createPdf(doc).getBlob((b) => { descargar(b, m.archivo + ".pdf"); ok(); }));
  }

  // ── Word (docx) ────────────────────────────────────────────────────────────
  async function word(m) {
    await cargar("word");
    const D = window.docx;
    const [[logo, trama], fotos] = await Promise.all([corporativas(), fotosDe(m.fichas)]);
    const CUERPO = "Arial Narrow", TITULOS = "Fira Sans";
    const sinBordes = { top: { style: D.BorderStyle.NONE }, bottom: { style: D.BorderStyle.NONE }, left: { style: D.BorderStyle.NONE }, right: { style: D.BorderStyle.NONE }, insideHorizontal: { style: D.BorderStyle.NONE }, insideVertical: { style: D.BorderStyle.NONE } };
    const borde = { style: D.BorderStyle.SINGLE, size: 4, color: C.borde };
    const bordes = { top: borde, bottom: borde, left: borde, right: borde, insideHorizontal: borde, insideVertical: borde };
    const p = (texto, o = {}) => new D.Paragraph({ spacing: { after: o.after ?? 80 }, alignment: o.align, pageBreakBefore: o.salto,
      children: [new D.TextRun({ text: String(texto ?? ""), font: o.font || CUERPO, size: o.size || 22, bold: o.bold, color: o.color || C.texto })] });
    const h = (texto, nivel = 2, salto) => p(texto, { font: TITULOS, size: nivel === 1 ? 40 : nivel === 2 ? 28 : 22, bold: true, color: C.azul, after: 120, salto });
    // Anchos en twips (Word y otros visores los necesitan fijos). Ancho útil: A4 vertical 8504, horizontal 14570.
    const ANCHO = { v: 8504, h: 14570 };
    const reparto = (pcts, W) => { const t = pcts.reduce((a, b) => a + b, 0); return pcts.map((x) => Math.round((W * x) / t)); };
    const celda = (texto, o = {}) => new D.TableCell({ shading: o.fondo ? { fill: o.fondo, type: D.ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 50, bottom: 50, left: 80, right: 80 }, width: o.ancho ? { size: o.ancho, type: D.WidthType.DXA } : undefined,
      children: String(texto ?? "").split("\n").map((l) => new D.Paragraph({ children: [new D.TextRun({ text: l, font: o.font || CUERPO, size: o.size || 18, bold: o.bold, color: o.color || C.texto })] })) });
    const tabla = (cab, filas, pcts, destacadas = [], size = 18, W = ANCHO.v) => {
      const anchos = reparto(pcts || cab.map(() => 1), W);
      return new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: anchos, layout: D.TableLayoutType.FIXED, borders: bordes,
        rows: [new D.TableRow({ tableHeader: true, children: cab.map((t, i) => celda(t, { fondo: C.azul, color: "FFFFFF", bold: true, font: TITULOS, size, ancho: anchos[i] })) }),
          ...filas.map((f, n) => new D.TableRow({ cantSplit: true, children: f.map((t, i) => celda(t, { size, bold: destacadas.includes(n), fondo: destacadas.includes(n) ? C.fondo : n % 2 ? "F8FAFC" : undefined, ancho: anchos[i] })) }))] });
    };
    const tablaSimple = (filas, pcts, opciones, W = ANCHO.v, conLineas = false) => {
      const anchos = reparto(pcts, W);
      return new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: anchos, layout: D.TableLayoutType.FIXED, borders: conLineas ? { ...sinBordes, insideHorizontal: borde } : sinBordes,
        rows: filas.map((f) => new D.TableRow({ children: f.map((t, i) => celda(t, { ...opciones[i], ancho: anchos[i] })) })) });
    };
    const espacio = () => new D.Paragraph({ spacing: { after: 120 }, children: [] });
    // Cabecera y pie de la hoja corporativa (anchoPagina en píxeles a 96 ppp: A4 vertical 794, horizontal 1123)
    const cabecera = (W) => { const [a, b] = reparto([62, 38], W); return new D.Header({ children: [new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: [a, b], layout: D.TableLayoutType.FIXED, borders: sinBordes, rows: [new D.TableRow({ children: [
      new D.TableCell({ width: { size: a, type: D.WidthType.DXA }, verticalAlign: D.VerticalAlign.CENTER, children: [new D.Paragraph({ children: [new D.TextRun({ text: LEMA, font: TITULOS, size: 28, color: C.lema })] })] }),
      new D.TableCell({ width: { size: b, type: D.WidthType.DXA }, children: [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.ImageRun({ data: logo.buffer, transformation: { width: 156, height: Math.round(156 * logo.h / logo.w) } })] })] }),
    ] })] })] }); };
    const pie = (anchoPagina) => new D.Footer({ children: [
      new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [
        new D.TextRun({ text: PIE1[0], font: "Arial", size: 18, color: C.pieVerde }), new D.TextRun({ text: "          ", font: "Arial", size: 18 }),
        new D.TextRun({ text: PIE1[1], font: "Arial", size: 18, color: C.pieAzul })] }),
      new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [
        new D.TextRun({ text: PIE2, font: "Arial", size: 17, color: C.pieAzul }),
        new D.ImageRun({ data: trama.buffer, transformation: { width: anchoPagina, height: Math.round(anchoPagina * trama.h / trama.w) },
          // Pegada al borde inferior de la página (alto de A4 en EMU: vertical 10692000, horizontal 7560000)
          floating: { horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.PAGE, offset: 0 },
            verticalPosition: { relative: D.VerticalPositionRelativeFrom.PAGE, offset: (anchoPagina > 900 ? 7560000 : 10692000) - Math.round(anchoPagina * trama.h / trama.w) * 9525 },
            allowOverlap: true, behindDocument: false, wrap: { type: D.TextWrappingType.NONE } } })] }),
    ] });
    const seccion = (children, horizontal = false) => ({
      properties: { page: { size: horizontal ? { orientation: D.PageOrientation.LANDSCAPE, width: 11906, height: 16838 } : { width: 11906, height: 16838 },
        margin: { top: 1417, right: horizontal ? 1134 : 1701, bottom: 1417, left: horizontal ? 1134 : 1701, header: 708, footer: 414 } } },
      headers: { default: cabecera(horizontal ? ANCHO.h : ANCHO.v) }, footers: { default: pie(horizontal ? 1123 : 794) }, children,
    });

    const secciones = [];
    let actual = [h(m.titulo, 1), p(m.subtitulo || "", { color: C.suave, after: 200 })];
    if (m.resumen) {
      actual.push(h("Resumen"), tabla(m.resumen.kpis.map(([, t]) => t), [m.resumen.kpis.map(([n]) => String(n))], null, [], 20), espacio());
      m.resumen.tablas.forEach((t) => actual.push(h(t.titulo, 3), tabla(t.cabecera, t.filas, [3.2, ...t.cabecera.slice(1).map(() => 1)], t.destacadas), espacio()));
    }
    if (m.listado) {
      const giro = apaisado(m);
      if (giro) { secciones.push(seccion(actual)); actual = []; }
      actual.push(h("Listado de incidencias", 2, !giro && actual.length > 2), tabla(m.listado.columnas.map((c) => c.titulo), m.listado.filas, m.listado.columnas.map((c) => c.ancho), [], giro ? 15 : 17, giro ? ANCHO.h : ANCHO.v));
      if (giro) { secciones.push(seccion(actual, true)); actual = []; }
    }
    (m.fichas || []).forEach((f, n) => {
      const salto = actual.length > 0 && !(n === 0 && actual.length === 2 && !m.resumen && !m.listado);
      actual.push(h(f.titulo, 2, salto), p(f.etiquetas, { color: C.suave }),
        tablaSimple(f.datos, [28, 72], [{ bold: true, color: C.suave }, { size: 20 }], ANCHO.v, true),
        espacio(), h("Descripción", 3),
        tablaSimple([[f.descripcion]], [100], [{ fondo: C.fondo, size: 22 }]),
        espacio());
      if (fotos[n].length) {
        actual.push(h("Fotos", 3));
        fotos[n].forEach((img) => { const [w, hh] = encaja(img, 300, 240); actual.push(new D.Paragraph({ spacing: { after: 120 }, children: [new D.ImageRun({ data: img.buffer, transformation: { width: w, height: hh } })] })); });
      }
      if (f.historial?.length) actual.push(h("Historial", 3), tabla(["Cuándo", "Quién", "Qué"], f.historial, [18, 24, 58], [], 18));
    });
    if (actual.length) secciones.push(seccion(actual));

    const doc = new D.Document({ creator: "Escuelas Salesianas María Auxiliadora · Nervión", title: m.titulo,
      styles: { default: { document: { run: { font: CUERPO, size: 22 } } } }, sections: secciones });
    descargar(await D.Packer.toBlob(doc), m.archivo + ".docx");
  }

  // ── Excel (ExcelJS) ────────────────────────────────────────────────────────
  async function excel(m) {
    await cargar("excel");
    const [logo] = await corporativas();
    const wb = new ExcelJS.Workbook();
    wb.creator = "Escuelas Salesianas María Auxiliadora · Nervión"; wb.created = new Date();
    const logoId = wb.addImage({ base64: logo.dataUrl, extension: "png" });
    const F = (o = {}) => ({ name: "Fira Sans", size: 10, color: { argb: "FF" + C.texto }, ...o });
    const fino = { style: "thin", color: { argb: "FF" + C.borde } };
    function hoja(nombre, anchos, horizontal = true) {
      const ws = wb.addWorksheet(nombre, { views: [{ showGridLines: false }],
        pageSetup: { paperSize: 9, orientation: horizontal ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.6, right: 0.6, top: 0.9, bottom: 0.9, header: 0.4, footer: 0.4 } },
        headerFooter: { oddHeader: `&L&"Fira Sans"&14&K${C.lema}${LEMA}`, oddFooter: `&C&"Arial"&9&K${C.pieVerde}${PIE1[0]}     &K${C.pieAzul}${PIE1[1]}&R&8&K${C.suave}&P / &N` } });
      ws.columns = anchos.map((w) => ({ width: w }));
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 170, height: Math.round(170 * logo.h / logo.w) } });
      ws.getRow(1).height = 22; ws.getRow(2).height = 22; ws.getRow(3).height = 18;
      const t = ws.getCell(1, Math.min(3, anchos.length)); t.value = m.titulo; t.font = F({ size: 16, bold: true, color: { argb: "FF" + C.azul } });
      const s = ws.getCell(2, Math.min(3, anchos.length)); s.value = m.subtitulo || ""; s.font = F({ color: { argb: "FF" + C.suave } });
      ws.addRow([]); ws.addRow([]);
      return ws;
    }
    function tabla(ws, cab, filas, destacadas = []) {
      const r0 = ws.addRow(cab);
      r0.eachCell((c) => { c.font = F({ bold: true, color: { argb: "FFFFFFFF" } }); c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C.azul } }; c.alignment = { vertical: "middle", wrapText: true }; c.border = { top: fino, bottom: fino, left: fino, right: fino }; });
      filas.forEach((f, n) => {
        const r = ws.addRow(f);
        r.eachCell({ includeEmpty: true }, (c) => {
          c.font = F({ bold: destacadas.includes(n) }); c.alignment = { vertical: "top", wrapText: true }; c.border = { top: fino, bottom: fino, left: fino, right: fino };
          const fondo = destacadas.includes(n) ? C.fondo : n % 2 ? "F8FAFC" : null;
          if (fondo) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + fondo } };
        });
      });
      return r0.number;
    }
    if (m.resumen) {
      const ws = hoja("Resumen", [34, 14, 14, 16, 14, 12], false);
      const rk = ws.addRow(m.resumen.kpis.map(([n]) => n)), rt = ws.addRow(m.resumen.kpis.map(([, t]) => t));
      rk.eachCell((c) => { c.font = F({ size: 18, bold: true, color: { argb: "FF" + C.azul } }); c.alignment = { horizontal: "left" }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C.fondo } }; });
      rt.eachCell((c) => { c.font = F({ size: 8, color: { argb: "FF" + C.suave } }); c.alignment = { wrapText: true, vertical: "top" }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + C.fondo } }; });
      rt.height = 30;
      m.resumen.tablas.forEach((t) => {
        ws.addRow([]);
        const r = ws.addRow([t.titulo]); r.getCell(1).font = F({ size: 12, bold: true, color: { argb: "FF" + C.azul } });
        tabla(ws, t.cabecera, t.filas, t.destacadas);
      });
    }
    if (m.listado) {
      const ws = hoja("Incidencias", m.listado.columnas.map((c) => c.ancho));
      const fila = tabla(ws, m.listado.columnas.map((c) => c.titulo), m.listado.filas);
      ws.autoFilter = { from: { row: fila, column: 1 }, to: { row: fila, column: m.listado.columnas.length } };
      ws.views = [{ state: "frozen", ySplit: fila, showGridLines: false }];
      ws.pageSetup.printTitlesRow = `${fila}:${fila}`;
    }
    if (m.fichas?.length) {
      const ws = hoja("Historial", [12, 48, 18, 26, 70]);
      const filas = [];
      m.fichas.forEach((f) => f.historial.forEach(([cuando, quien, que]) => filas.push([f.titulo.split(" · ")[0], f.titulo.split(" · ").slice(1).join(" · "), cuando, quien, que])));
      const fila = tabla(ws, ["Número", "Incidencia", "Cuándo", "Quién", "Qué"], filas);
      ws.autoFilter = { from: { row: fila, column: 1 }, to: { row: fila, column: 5 } };
      ws.views = [{ state: "frozen", ySplit: fila, showGridLines: false }];
    }
    const buf = await wb.xlsx.writeBuffer();
    descargar(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), m.archivo + ".xlsx");
  }

  // ── CSV (para abrir en cualquier programa) ─────────────────────────────────
  function csv(m) {
    const l = m.listado || { columnas: [], filas: [] };
    const txt = "﻿" + [l.columnas.map((c) => c.titulo), ...l.filas].map((f) => f.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    descargar(new Blob([txt], { type: "text/csv;charset=utf-8" }), m.archivo + ".csv");
  }

  return {
    async generar(formato, modelo) {
      if (formato === "pdf") return pdf(modelo);
      if (formato === "word") return word(modelo);
      if (formato === "excel") return excel(modelo);
      return csv(modelo);
    },
  };
})();
