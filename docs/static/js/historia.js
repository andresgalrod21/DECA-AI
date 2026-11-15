// Página "La historia": storytelling con la encuesta y un día de datos del aula
(async function () {
  // Cifras animadas
  const contar = (el) => animarNumero(el, parseFloat(el.dataset.contar), el.dataset.sufijo || "", parseInt(el.dataset.decimales || 0));
  document.querySelectorAll(".portada [data-contar]").forEach(contar);
  document.querySelectorAll(".revelar").forEach((sec) =>
    sec.addEventListener("revelado", () => sec.querySelectorAll("[data-contar]").forEach(contar)));

  const [enc, datos] = await Promise.all([cargarJSON("encuesta"), cargarJSON("datos")]);
  const q = enc.preguntas;
  const n = enc.kpis.n;

  function barrasH(id, p, colores, opciones = {}) {
    const pct = p.values.map((v) => +(v / n * 100).toFixed(1));
    Plotly.newPlot(id, [{
      type: "bar", orientation: "h", y: p.labels, x: pct,
      marker: { color: colores, line: { width: 0 } },
      text: pct.map((v) => v + "%"), textposition: "outside", cliponaxis: false,
      customdata: p.values,
      hovertemplate: "<b>%{y}</b><br>%{customdata} personas (%{x}%)<extra></extra>",
    }], layoutBase(Object.assign({
      margin: { l: 10, r: 50, t: 10, b: 30 },
      xaxis: { visible: false, range: [0, Math.max(...pct) * 1.25] },
      yaxis: { automargin: true, autorange: "reversed" },
      bargap: 0.35, showlegend: false,
    }, opciones)), PLOTLY_CONFIG);
  }

  function dona(id, p, colores) {
    Plotly.newPlot(id, [{
      type: "pie", hole: 0.62, labels: p.labels, values: p.values, sort: false,
      marker: { colors: colores, line: { color: "#fffdfa", width: 3 } },
      textinfo: "percent", hovertemplate: "<b>%{label}</b><br>%{value} personas (%{percent})<extra></extra>",
    }], layoutBase({ margin: { l: 10, r: 10, t: 10, b: 10 }, legend: { orientation: "h", y: -0.05 } }), PLOTLY_CONFIG);
  }

  barrasH("g-frecuencia", q.frecuencia, [COLORES.verdeOscuro, COLORES.verde, COLORES.cielo, COLORES.gris]);

  const sint = { labels: [], values: [] };
  q.sintomas.labels.forEach((l, i) => { sint.labels.push(l); sint.values.push(q.sintomas.values[i]); });
  barrasH("g-sintomas", sint, sint.labels.map((l) => l.startsWith("Ninguna") ? COLORES.gris : COLORES.crit));

  dona("g-asocia", q.asocia_co2, [COLORES.verde, COLORES.cielo, COLORES.rosa]);
  barrasH("g-ventilar", {
    labels: q.ventilar.labels.map((l) => l.startsWith("No, porque") ? "No es posible (sin ventanas o prohibido)" : l),
    values: q.ventilar.values,
  }, [COLORES.verde, COLORES.cielo, COLORES.tierra, COLORES.crit]);

  barrasH("g-lugares", q.lugares, COLORES.verde);
  Plotly.newPlot("g-importancia", [{
    type: "bar", x: q.importancia.labels, y: q.importancia.values,
    marker: { color: q.importancia.labels.map((v) => (v >= 7 ? COLORES.verde : COLORES.gris)) },
    hovertemplate: "Calificación %{x}: %{y} personas<extra></extra>",
  }], layoutBase({
    margin: { l: 40, r: 10, t: 10, b: 40 }, showlegend: false,
    xaxis: { dtick: 1, title: "Calificación" }, yaxis: { title: "Personas", gridcolor: "#ece6de" },
    shapes: [{ type: "line", x0: q.importancia.media, x1: q.importancia.media, y0: 0, y1: 1, yref: "paper",
      line: { color: COLORES.tinta, dash: "dot", width: 2 } }],
    annotations: [{ x: q.importancia.media, y: 1, yref: "paper", text: "Promedio " + String(q.importancia.media).replace(".", ","),
      showarrow: false, yanchor: "bottom", font: { size: 12 } }],
  }), PLOTLY_CONFIG);

  // ---------- Un día en el aula ----------
  const paso = datos.paso_min, porDia = 24 * 60 / paso;
  const fechas = fechasDesde(datos.inicio, datos.n, paso);
  const s = datos.serie;
  const sel = document.getElementById("sel-dia");
  const diasConFalla = new Set();
  s.tipo.forEach((t, i) => { if (t === 1) diasConFalla.add(Math.floor(i / porDia)); });
  for (let d = 0; d < datos.n / porDia; d++) {
    const f = fechas[d * porDia];
    const o = document.createElement("option");
    o.value = d;
    o.textContent = f.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) +
      (diasConFalla.has(d) ? "  ⚠ falla de ventilación" : "");
    sel.appendChild(o);
  }
  const diaInicial = [...diasConFalla].find((d) => fechas[d * porDia].getDay() >= 1 && fechas[d * porDia].getDay() <= 5) ?? 0;
  sel.value = diaInicial;

  function dibujarDia(d) {
    const i0 = d * porDia, i1 = i0 + porDia;
    const x = fechas.slice(i0, i1), co2 = s.co2.slice(i0, i1), oc = s.ocupacion.slice(i0, i1), tp = s.tipo.slice(i0, i1);
    const banda = (y0, y1, c) => ({ type: "rect", xref: "paper", x0: 0, x1: 1, y0, y1, fillcolor: c, opacity: 0.16, line: { width: 0 }, layer: "below" });
    const maximo = Math.max(1700, ...co2) * 1.05;
    const anom = co2.map((v, i) => (tp[i] ? v : null));
    Plotly.react("g-dia", [
      { type: "bar", x, y: oc, name: "Personas en el aula", yaxis: "y2", marker: { color: "rgba(201,149,113,.35)" },
        hovertemplate: "%{y} personas<extra></extra>" },
      { type: "scatter", mode: "lines", x, y: co2, name: "CO₂ (ppm)", line: { color: COLORES.tinta, width: 2.5 },
        hovertemplate: "<b>%{y:.0f} ppm</b> · %{x|%H:%M}<extra></extra>" },
      { type: "scatter", mode: "markers", x, y: anom, name: "Anomalía", marker: { color: COLORES.crit, size: 6 },
        hovertemplate: "Anomalía: %{y:.0f} ppm<extra></extra>" },
    ], layoutBase({
      margin: { l: 55, r: 55, t: 10, b: 40 },
      yaxis: { title: "CO₂ (ppm)", range: [350, maximo], gridcolor: "#ece6de" },
      yaxis2: { title: "Personas", overlaying: "y", side: "right", range: [0, 140], showgrid: false },
      xaxis: { tickformat: "%H:%M", gridcolor: "#ece6de" },
      shapes: [banda(0, 800, COLORES.verde), banda(800, 1000, COLORES.adv), banda(1000, 1500, "#e58a1f"), banda(1500, 99999, COLORES.crit)],
      hovermode: "x unified", legend: { orientation: "h", y: -0.18 },
    }), PLOTLY_CONFIG);
    const pico = Math.max(...co2);
    document.getElementById("nota-dia").textContent = `Máximo del día: ${Math.round(pico).toLocaleString("es-CO")} ppm`;
  }
  sel.addEventListener("change", () => dibujarDia(+sel.value));
  dibujarDia(diaInicial);

  // ---------- Carrusel de testimonios ----------
  const tests = [...document.querySelectorAll(".testimonio")], puntos = [...document.querySelectorAll("#puntos button")];
  let actual = 0;
  const mostrar = (i) => {
    tests[actual].classList.remove("activo"); puntos[actual].classList.remove("activo");
    actual = i; tests[actual].classList.add("activo"); puntos[actual].classList.add("activo");
  };
  puntos.forEach((p, i) => p.addEventListener("click", () => mostrar(i)));
  setInterval(() => mostrar((actual + 1) % tests.length), 6000);
})();
