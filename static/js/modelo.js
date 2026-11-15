// Página "El modelo": comparación de los 5 autoencoders y detalle de cada uno
(async function () {
  const m = await cargarJSON("modelos");
  const R = m.resultados;
  const nombres = R.map((r) => r.nombre);

  Plotly.newPlot("g-comparacion", ["precision", "recall", "f1"].map((k, i) => ({
    type: "bar", name: k === "f1" ? "F1" : k[0].toUpperCase() + k.slice(1), x: nombres, y: R.map((r) => r[k]),
    marker: { color: [COLORES.cielo, COLORES.tierra, COLORES.verde][i] },
    hovertemplate: "%{x}: %{y:.3f}<extra>%{fullData.name}</extra>",
  })), layoutBase({ barmode: "group", margin: { l: 40, r: 10, t: 10, b: 40 }, yaxis: { range: [0, 1], gridcolor: "#ece6de" },
    legend: { orientation: "h", y: 1.12 } }), PLOTLY_CONFIG);

  const filas = [...document.querySelectorAll("#tabla-modelos tbody tr")];

  function detalle(i) {
    const r = R[i];
    filas.forEach((f, j) => f.classList.toggle("seleccionado", j === i));
    document.getElementById("titulo-detalle").textContent = `${r.nombre}: ${r.cambio}`;
    document.getElementById("arq-detalle").textContent =
      `Arquitectura: ${r.arquitectura} · Optimizador: ${r.optimizador.toUpperCase()} · ${r.parametros.toLocaleString("es-CO")} parámetros · ${r.epocas} épocas (parada temprana)`;

    const ep = r.loss.map((_, k) => k + 1);
    Plotly.react("g-perdida", [
      { type: "scatter", mode: "lines", x: ep, y: r.loss, name: "Entrenamiento", line: { color: COLORES.verde, width: 2.5 } },
      { type: "scatter", mode: "lines", x: ep, y: r.val_loss, name: "Validación", line: { color: COLORES.tierra, width: 2.5, dash: "dot" } },
    ], layoutBase({ margin: { l: 55, r: 10, t: 10, b: 45 }, xaxis: { title: "Época", gridcolor: "#ece6de" },
      yaxis: { title: "MSE", type: "log", dtick: 1, exponentformat: "power", gridcolor: "#ece6de" }, legend: { orientation: "h", y: 1.12 } }), PLOTLY_CONFIG);

    const mc = r.matriz;
    Plotly.react("g-matriz", [{
      type: "heatmap", z: mc, x: ["Predijo normal", "Predijo anomalía"], y: ["Era normal", "Era anomalía"],
      colorscale: [[0, "#f7f1eb"], [1, "#0b7a3f"]], showscale: false,
      text: mc.map((f) => f.map((v) => v.toLocaleString("es-CO"))), texttemplate: "<b>%{text}</b>", textfont: { size: 16 },
      hovertemplate: "%{y} · %{x}: %{text} ventanas<extra></extra>",
    }], layoutBase({ margin: { l: 95, r: 10, t: 10, b: 40 }, yaxis: { autorange: "reversed" } }), PLOTLY_CONFIG);

    const tipos = Object.keys(r.por_tipo);
    Plotly.react("g-portipo", [{
      type: "bar", orientation: "h", y: tipos.map((t) => TIPOS[t].nombre), x: tipos.map((t) => r.por_tipo[t]),
      marker: { color: tipos.map((t) => TIPOS[t].color) },
      text: tipos.map((t) => r.por_tipo[t].toFixed(0) + "%"), textposition: "outside", cliponaxis: false,
      hovertemplate: "%{y}: %{x:.1f}% detectado<extra></extra>",
    }], layoutBase({ margin: { l: 10, r: 40, t: 10, b: 30 }, xaxis: { range: [0, 115], visible: false },
      yaxis: { automargin: true }, showlegend: false }), PLOTLY_CONFIG);
  }
  filas.forEach((f, i) => f.addEventListener("click", () => detalle(i)));
  detalle(nombres.indexOf(m.mejor));

  // Histograma del error (escala logarítmica) del mejor modelo
  // Se grafica sobre log10(error) en un eje lineal, con etiquetas 10^k
  const h = m.histograma, centros = h.bins.slice(0, -1).map((b, i) => (b + h.bins[i + 1]) / 2);
  const umbral = Math.log10(R[nombres.indexOf(m.mejor)].umbral);
  const kMin = Math.floor(h.bins[0]), kMax = Math.ceil(h.bins[h.bins.length - 1]);
  const ticks = []; for (let k = kMin; k <= kMax; k++) ticks.push(k);
  const sup = (k) => String(k).split("").map((c) => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(c)]).join("");
  Plotly.newPlot("g-histograma", [
    { type: "bar", x: centros, y: h.normal, name: "Ventanas normales", marker: { color: COLORES.cielo }, hovertemplate: "%{y} ventanas<extra>Normal</extra>" },
    { type: "bar", x: centros, y: h.anomalia, name: "Ventanas anómalas", marker: { color: COLORES.crit }, opacity: 0.8, hovertemplate: "%{y} ventanas<extra>Anomalía</extra>" },
  ], layoutBase({
    barmode: "overlay", bargap: 0.05, margin: { l: 55, r: 10, t: 30, b: 50 },
    xaxis: { title: "Error de reconstrucción (MSE, escala log)", tickvals: ticks, ticktext: ticks.map((k) => "10" + sup(k)), gridcolor: "#ece6de" },
    yaxis: { type: "log", title: "Ventanas", dtick: 1, gridcolor: "#ece6de" },
    shapes: [{ type: "line", x0: umbral, x1: umbral, y0: 0, y1: 1, yref: "paper", line: { color: COLORES.tinta, width: 2, dash: "dash" } }],
    annotations: [{ x: umbral, y: 1, yref: "paper", text: "Umbral (percentil 99)", showarrow: false, yanchor: "bottom", xanchor: "left" }],
    legend: { orientation: "h", y: -0.25 },
  }), PLOTLY_CONFIG);
})();
