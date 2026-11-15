// Página "Participa": reportes ciudadanos anónimos y voz de la comunidad
(async function () {
  const enc = await cargarJSON("encuesta");
  const SENSACIONES = ["Nada asfixiante", "Un poco asfixiante", "Bastante asfixiante", "Demasiado asfixiante"];
  const SINTOMAS = ["Fatiga o cansancio", "Sueño o somnolencia", "Dolor de cabeza",
    "Irritación en los ojos o garganta", "Dificultad para concentrarse", "Ninguna en especial"];
  const LUGARES = ["Aula de clase", "Oficina", "Transporte público", "Sala de espera o consultorio", "Gimnasio", "Otro"];
  const form = document.getElementById("form-reporte");
  let avisoActual = "";

  // ---------- Copiar avisos ----------
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch (e) {
      const t = document.createElement("textarea"); t.value = texto; document.body.appendChild(t); t.select();
      const ok = document.execCommand("copy"); t.remove(); return ok;
    }
  }
  document.querySelectorAll(".compartir").forEach((b) => b.addEventListener("click", async () => {
    if (await copiar(b.dataset.aviso)) { const txt = b.textContent; b.textContent = "✔ Copiado"; setTimeout(() => (b.textContent = txt), 1800); }
  }));

  // "Ninguna en especial" es excluyente con los demás síntomas
  form.querySelectorAll("input[name=sintomas]").forEach((c) => c.addEventListener("change", () => {
    if (!c.checked) return;
    form.querySelectorAll("input[name=sintomas]").forEach((o) => {
      if (o !== c && (c.value === "Ninguna en especial" || o.value === "Ninguna en especial")) o.checked = false;
    });
  }));

  // ---------- Gráficas de la comunidad ----------
  const pct = (arr, total) => arr.map((v) => (total ? +(v / total * 100).toFixed(1) : 0));

  function dibujar(datos) {
    const R = datos.reportes, nR = R.length, nE = enc.kpis.n;
    document.getElementById("total-reportes").textContent = datos.total;

    const qa = enc.preguntas.asfixia, qs = enc.preguntas.sintomas;
    const encSens = SENSACIONES.map((s) => qa.values[qa.labels.indexOf(s)] || 0);
    const repSens = SENSACIONES.map((s) => R.filter((r) => r.sensacion === s).length);
    const encSint = SINTOMAS.map((s) => (qs.labels.includes(s) ? qs.values[qs.labels.indexOf(s)] : null));
    const repSint = SINTOMAS.map((s) => R.filter((r) => r.sintomas.includes(s)).length);

    const barras = (y, nombre, color, total) => ({
      type: "bar", orientation: "h", y: y.etiquetas, x: pct(y.valores.map((v) => v ?? 0), total), name: nombre,
      marker: { color }, customdata: y.valores.map((v) => (v === null ? "no se preguntó" : `${v} de ${total}`)),
      hovertemplate: "<b>%{y}</b><br>%{x}% (%{customdata})<extra>" + nombre + "</extra>",
    });
    const lay = layoutBase({ barmode: "group", margin: { l: 10, r: 20, t: 40, b: 30 },
      xaxis: { ticksuffix: "%", gridcolor: "#ece6de", rangemode: "tozero" }, yaxis: { automargin: true, autorange: "reversed" },
      legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0 } });

    const series = (encV, repV, etiquetas) => {
      const t = [barras({ etiquetas, valores: encV }, `Encuesta (${nE})`, COLORES.cielo, nE)];
      if (nR) t.push(barras({ etiquetas, valores: repV }, `Reportes en la app (${nR})`, COLORES.verde, nR));
      return t;
    };
    Plotly.react("g-sensacion", series(encSens, repSens, SENSACIONES), lay, PLOTLY_CONFIG);
    Plotly.react("g-sintomas-com", series(encSint, repSint, SINTOMAS), lay, PLOTLY_CONFIG);

    const gl = document.getElementById("g-lugar");
    if (!nR) {
      Plotly.purge(gl);
      gl.innerHTML = '<div class="vacio">Aún no hay reportes desde la app. ¡Envía el primero con el formulario de arriba!</div>';
    } else {
      gl.innerHTML = "";
      const v = LUGARES.map((l) => R.filter((r) => r.lugar === l).length);
      Plotly.newPlot(gl, [{ type: "bar", orientation: "h", y: LUGARES, x: v, marker: { color: COLORES.tierra },
        hovertemplate: "<b>%{y}</b><br>%{x} reportes<extra></extra>" }],
        layoutBase({ margin: { l: 10, r: 20, t: 10, b: 30 }, yaxis: { automargin: true, autorange: "reversed" },
          xaxis: { dtick: 1, gridcolor: "#ece6de" }, showlegend: false }), PLOTLY_CONFIG);
    }

    // Comentarios: los de la app primero; si no hay, los testimonios de la encuesta
    const cont = document.getElementById("comentarios");
    cont.innerHTML = "";
    const deApp = R.filter((r) => r.comentario).slice(-6).reverse()
      .map((r) => ({ texto: r.comentario, fuente: `${r.lugar} · reporte en la app` }));
    const deEnc = enc.experiencias.slice(0, 6 - Math.min(6, deApp.length)).map((t) => ({ texto: t, fuente: "Encuesta, octubre 2026" }));
    [...deApp, ...deEnc].forEach((c) => {
      const d = document.createElement("div"); d.className = "comentario";
      const p = document.createElement("p"); p.textContent = "“" + c.texto + "”";
      const s = document.createElement("span"); s.className = "nota"; s.textContent = c.fuente;
      d.append(p, s); cont.appendChild(d);
    });
  }

  // ---------- Almacenamiento: servidor Flask o, en la versión estática, el navegador ----------
  const CLAVE = "deca_ai_reportes";
  function leerLocal() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || "[]"); } catch (e) { return []; }
  }
  async function obtenerReportes() {
    if (ESTATICO) { const r = leerLocal(); return { total: r.length, reportes: r }; }
    return (await fetch("/api/reportes")).json();
  }
  async function guardarReporte(r) {
    if (ESTATICO) {
      const todos = leerLocal();
      todos.push(Object.assign({}, r, { fecha: new Date().toISOString().slice(0, 16), comentario: r.comentario.trim().slice(0, 280) }));
      try { localStorage.setItem(CLAVE, JSON.stringify(todos)); } catch (e) { /* almacenamiento no disponible */ }
      return { ok: true, datos: { total: todos.length, reportes: todos } };
    }
    const resp = await fetch("/api/reportes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
    return { ok: resp.ok, datos: resp.ok ? await resp.json() : null };
  }
  if (ESTATICO) document.querySelectorAll(".solo-estatico").forEach((el) => (el.hidden = false));

  dibujar(await obtenerReportes());

  // ---------- Envío del reporte ----------
  function recomendacion(r) {
    const nivel = SENSACIONES.indexOf(r.sensacion);
    const sinVentilar = r.ventilar !== "Sí, se abrieron ventanas o puertas";
    const imposible = r.ventilar.startsWith("No es posible");
    if (nivel <= 0) return { titulo: "El aire se siente bien. ¡Gracias por reportarlo!",
      pasos: ["Los reportes de lugares sin problemas también ayudan: muestran qué espacios funcionan bien."], aviso: "" };
    const pasos = [];
    if (imposible) pasos.push("Como no se puede ventilar, propón una pausa breve fuera del lugar cada hora.");
    else if (sinVentilar) pasos.push("Abre ventanas o puertas entre 5 y 10 minutos; es la forma más rápida de bajar el CO₂.");
    else pasos.push("Bien hecho al ventilar. Si el malestar sigue, sal unos minutos a tomar aire.");
    if (nivel >= 2) pasos.push("Avisa al docente o al encargado del espacio: varias personas pueden estar sintiendo lo mismo.");
    if (r.sintomas.length && !r.sintomas.includes("Ninguna en especial"))
      pasos.push("Los síntomas que marcaste suelen mejorar al respirar aire fresco. Si persisten, consulta a un profesional de salud.");
    if (imposible) pasos.push("Tu reporte sirve como evidencia para pedir ventilación mecánica en este tipo de espacio.");
    return {
      titulo: nivel >= 2 ? "El aire parece cargado: conviene actuar ya" : "Hay señales de aire cargado",
      pasos,
      aviso: `⚠ Aviso de la comunidad DECA-AI: el aire en este espacio (${r.lugar.toLowerCase()}) se siente ${r.sensacion.toLowerCase()}. ` +
        (imposible ? "¿Hacemos una pausa afuera unos minutos?" : "¿Abrimos ventanas o puertas unos 5 minutos?"),
    };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const r = { lugar: f.get("lugar"), sensacion: f.get("sensacion"), ventilar: f.get("ventilar"),
      sintomas: f.getAll("sintomas"), comentario: f.get("comentario") || "" };
    const error = document.getElementById("error-form");
    if (!r.lugar || !r.sensacion || !r.ventilar) { error.hidden = false; return; }
    error.hidden = true;
    const boton = form.querySelector("button[type=submit]");
    boton.disabled = true; boton.textContent = "Enviando…";
    const resp = await guardarReporte(r);
    boton.disabled = false; boton.textContent = "Enviar otro reporte";
    if (!resp.ok) { error.textContent = "No se pudo guardar el reporte. Intenta de nuevo."; error.hidden = false; return; }
    const rec = recomendacion(r);
    document.getElementById("resp-titulo").textContent = rec.titulo;
    const ul = document.getElementById("resp-pasos"); ul.innerHTML = "";
    rec.pasos.forEach((p) => { const li = document.createElement("li"); li.textContent = p; ul.appendChild(li); });
    avisoActual = rec.aviso;
    document.getElementById("resp-compartir").hidden = !rec.aviso;
    document.getElementById("resp-copiado").hidden = true;
    const caja = document.getElementById("respuesta"); caja.hidden = false;
    caja.scrollIntoView({ behavior: "smooth", block: "center" });
    form.reset();
    dibujar(resp.datos);
  });
  document.getElementById("resp-compartir").addEventListener("click", async () => {
    if (await copiar(avisoActual)) document.getElementById("resp-copiado").hidden = false;
  });
})();
