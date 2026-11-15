// Página "Los datos": exploración interactiva del dataset sintético del aula
(async function () {
  const d = await cargarJSON("datos");
  const fechas = fechasDesde(d.inicio, d.n, d.paso_min);
  const s = d.serie;
  const tipos = d.tipos;
  const anomalos = tipos.slice(1);
  const visibles = new Set(anomalos);
  const unidades = { co2: "ppm", temperatura: "°C", humedad: "%", ocupacion: "personas" };
  const nombresVar = { co2: "CO₂", temperatura: "Temperatura", humedad: "Humedad", ocupacion: "Ocupación" };

  // Conteo de tipos
  Plotly.newPlot("g-tipos", [{
    type: "bar", orientation: "h",
    y: anomalos.map((t) => TIPOS[t].nombre), x: anomalos.map((t) => d.conteo_tipos[t]),
    marker: { color: anomalos.map((t) => TIPOS[t].color) },
    text: anomalos.map((t) => d.conteo_tipos[t].toLocaleString("es-CO")), textposition: "outside", cliponaxis: false,
    hovertemplate: "<b>%{y}</b><br>%{x} registros<extra></extra>",
  }], layoutBase({ margin: { l: 10, r: 50, t: 5, b: 20 }, xaxis: { visible: false }, yaxis: { automargin: true, autorange: "reversed" }, showlegend: false }), PLOTLY_CONFIG);

  // Filtros de anomalías
  const filtros = document.getElementById("filtros");
  anomalos.forEach((t) => {
    const l = document.createElement("label");
    l.className = "filtro";
    l.innerHTML = `<input type="checkbox" checked value="${t}"><i style="background:${TIPOS[t].color}"></i>${TIPOS[t].nombre}`;
    l.querySelector("input").addEventListener("change", (e) => {
      e.target.checked ? visibles.add(t) : visibles.delete(t);
      dibujarSerie();
    });
    filtros.appendChild(l);
  });
  const selVar = document.getElementById("sel-var");
  selVar.addEventListener("change", dibujarSerie);

  function dibujarSerie() {
    const v = selVar.value, y = s[v];
    const trazas = [{
      type: "scattergl", mode: "lines", x: fechas, y, name: nombresVar[v],
      line: { color: "#5f7d86", width: 1 },
      hovertemplate: `%{y} ${unidades[v]}<br>%{x|%a %d %b %H:%M}<extra></extra>`,
    }];
    anomalos.filter((t) => visibles.has(t)).forEach((t) => {
      const k = tipos.indexOf(t), xs = [], ys = [];
      s.tipo.forEach((c, i) => { if (c === k) { xs.push(fechas[i]); ys.push(y[i]); } });
      trazas.push({
        type: "scattergl", mode: "markers", x: xs, y: ys, name: TIPOS[t].nombre,
        marker: { color: TIPOS[t].color, size: 5 },
        hovertemplate: `<b>${TIPOS[t].nombre}</b><br>%{y} ${unidades[v]}<br>%{x|%a %d %b %H:%M}<extra></extra>`,
      });
    });
    const rangoInicial = [fechas[7 * 288], fechas[14 * 288]];
    const actual = document.getElementById("g-serie").layout;
    const rango = actual && actual.xaxis && actual.xaxis.range ? actual.xaxis.range : rangoInicial;
    Plotly.react("g-serie", trazas, layoutBase({
      margin: { l: 55, r: 15, t: 10, b: 30 },
      xaxis: { range: rango, rangeslider: { visible: true, thickness: 0.08 }, type: "date", gridcolor: "#ece6de" },
      yaxis: { title: `${nombresVar[v]} (${unidades[v]})`, gridcolor: "#ece6de", fixedrange: false },
      showlegend: false,
      shapes: v === "co2" ? [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 1000, y1: 1000, line: { color: COLORES.crit, dash: "dot", width: 1.5 } }] : [],
    }), PLOTLY_CONFIG);
  }
  dibujarSerie();

  // Perfil horario
  const horas = [...Array(24).keys()];
  Plotly.newPlot("g-perfil", [{
    type: "bar", x: horas, y: d.perfil_horario.total,
    marker: { color: d.perfil_horario.total.map((v) => (v > 600 ? COLORES.verde : COLORES.cielo)) },
    hovertemplate: "%{x}:00 · %{y} ppm<extra></extra>",
  }], layoutBase({ margin: { l: 50, r: 10, t: 10, b: 40 }, showlegend: false,
    xaxis: { title: "Hora del día", dtick: 2 }, yaxis: { title: "CO₂ promedio (ppm)", gridcolor: "#ece6de" } }), PLOTLY_CONFIG);

  // Rangos de calidad
  const r = d.rangos;
  Plotly.newPlot("g-rangos", [{
    type: "pie", hole: 0.6, labels: Object.keys(r), values: Object.values(r), sort: false,
    marker: { colors: [COLORES.verde, COLORES.adv, "#e58a1f", COLORES.crit], line: { color: "#fffdfa", width: 3 } },
    hovertemplate: "<b>%{label}</b><br>%{value} registros (%{percent})<extra></extra>",
  }], layoutBase({ margin: { l: 10, r: 10, t: 10, b: 10 }, legend: { orientation: "v", x: 1, y: 0.5 } }), PLOTLY_CONFIG);

  // Cajas por tipo (estadísticos precalculados)
  Plotly.newPlot("g-caja", tipos.map((t) => {
    const c = d.caja[t];
    return {
      type: "box", name: TIPOS[t].nombre, x: [TIPOS[t].nombre],
      q1: [c.q1], median: [c.mediana], q3: [c.q3], lowerfence: [c.min], upperfence: [c.max],
      marker: { color: TIPOS[t].color }, fillcolor: TIPOS[t].color + "55", line: { color: TIPOS[t].color },
      hoverinfo: "y",
    };
  }), layoutBase({ margin: { l: 55, r: 10, t: 10, b: 80 }, showlegend: false,
    yaxis: { title: "CO₂ (ppm)", gridcolor: "#ece6de" }, xaxis: { tickangle: -25 } }), PLOTLY_CONFIG);

  // Correlación
  const etiquetas = ["CO₂", "Temperatura", "Humedad", "Ocupación"];
  const m = d.correlacion.matriz;
  Plotly.newPlot("g-corr", [{
    type: "heatmap", z: m, x: etiquetas, y: etiquetas, zmin: -1, zmax: 1,
    colorscale: [[0, "#6c5ce7"], [0.5, "#f7f1eb"], [1, "#00a651"]],
    text: m.map((f) => f.map((v) => v.toFixed(2).replace(".", ","))), texttemplate: "%{text}",
    hovertemplate: "%{y} vs %{x}: %{text}<extra></extra>", showscale: false,
  }], layoutBase({ margin: { l: 90, r: 10, t: 10, b: 50 }, yaxis: { autorange: "reversed" } }), PLOTLY_CONFIG);
})();
