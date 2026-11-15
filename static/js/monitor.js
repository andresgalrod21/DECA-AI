// Página "Monitor en vivo": reproduce el periodo de prueba lectura por lectura
(async function () {
  const M = await cargarJSON("monitor");
  const N = M.co2.length, VENTANA_24H = 288;
  const fechas = fechasDesde(M.inicio, N, M.paso_min);

  // Inicios de cada evento de alerta
  const inicios = [];
  for (let i = 0; i < N; i++) if (M.alarma[i] && (i === 0 || !M.alarma[i - 1])) inicios.push(i);

  const $ = (id) => document.getElementById(id);
  const linea = $("linea");
  linea.max = N - 1;

  let idx = Math.max(0, fechas.findIndex((f) => f.getHours() === 6 && f.getMinutes() >= 30));
  let reproduciendo = false, lecturasPorSeg = 2, acumulado = 0, ultimo = 0, ultimoDibujo = 0;

  function estado(i) {
    if (!M.alarma[i]) return { clase: "", texto: "Normal" };
    const n = M.nivel[i];
    if (n === "critica") return { clase: "critica", texto: NIVELES.critica.corto };
    if (n === "advertencia") return { clase: "advertencia", texto: NIVELES.advertencia.corto };
    return { clase: "sensor", texto: NIVELES[n].corto };
  }

  function colorNivel(i) {
    return M.alarma[i] ? NIVELES[M.nivel[i]].color : COLORES.ok;
  }

  function dibujar() {
    const i0 = Math.max(0, idx - VENTANA_24H + 1), x = fechas.slice(i0, idx + 1);
    const co2 = M.co2.slice(i0, idx + 1), err = M.error.slice(i0, idx + 1);
    const reales = co2.map((v, k) => (M.real[i0 + k] ? v : null));
    const alarmas = err.map((v, k) => (M.alarma[i0 + k] ? v : null));
    const colAl = err.map((_, k) => colorNivel(i0 + k));
    const maxCo2 = Math.max(1600, ...co2) * 1.08;
    Plotly.react("g-vivo", [
      { type: "scatter", mode: "lines", x, y: co2, name: "CO₂", line: { color: COLORES.tinta, width: 2.2 },
        hovertemplate: "%{y:.0f} ppm · %{x|%a %H:%M}<extra></extra>" },
      { type: "scatter", mode: "markers", x, y: reales, name: "Anomalía real", marker: { color: "#e58a1f", size: 5 },
        hovertemplate: "Anomalía real<extra></extra>" },
      { type: "scatter", mode: "lines", x, y: err, name: "Error", yaxis: "y2", line: { color: "#7a8a90", width: 1.6 },
        hovertemplate: "Error %{y:.2e}<extra></extra>" },
      { type: "scatter", mode: "markers", x, y: alarmas, name: "Alerta", yaxis: "y2", marker: { color: colAl, size: 7 },
        hovertemplate: "Alerta<extra></extra>" },
    ], layoutBase({
      margin: { l: 60, r: 15, t: 10, b: 35 }, showlegend: false, hovermode: "x unified",
      xaxis: { anchor: "y2", tickformat: "%a %H:%M", gridcolor: "#ece6de" },
      yaxis: { domain: [0.42, 1], title: "CO₂ (ppm)", range: [350, maxCo2], gridcolor: "#ece6de" },
      yaxis2: { domain: [0, 0.32], title: "Error", type: "log", gridcolor: "#ece6de" },
      shapes: [
        { type: "rect", xref: "paper", yref: "y", x0: 0, x1: 1, y0: 1000, y1: 1500, fillcolor: COLORES.adv, opacity: 0.12, line: { width: 0 }, layer: "below" },
        { type: "rect", xref: "paper", yref: "y", x0: 0, x1: 1, y0: 1500, y1: 99999, fillcolor: COLORES.crit, opacity: 0.12, line: { width: 0 }, layer: "below" },
        { type: "line", xref: "paper", yref: "y2", x0: 0, x1: 1, y0: M.umbral, y1: M.umbral, line: { color: COLORES.crit, dash: "dash", width: 1.5 } },
      ],
    }), PLOTLY_CONFIG);
  }

  function actualizarPanel() {
    const e = estado(idx);
    $("reloj").textContent = fmtFecha(fechas[idx]);
    $("v-co2").textContent = Math.round(M.co2[idx]).toLocaleString("es-CO");
    $("v-estado").textContent = e.texto;
    $("medidor").className = "medidor " + e.clase;
    $("v-ocup").textContent = M.ocupacion[idx];
    $("v-temp").textContent = M.temperatura[idx].toFixed(1).replace(".", ",");
    $("v-error").textContent = M.error[idx].toExponential(1).replace(".", ",");
    $("v-error").style.color = M.error[idx] > M.umbral ? COLORES.crit : COLORES.tinta;
    linea.value = idx;
    $("progreso").textContent = `Lectura ${(idx + 1).toLocaleString("es-CO")} de ${N.toLocaleString("es-CO")}`;
  }

  function evento(i) {
    const n = NIVELES[M.nivel[i]];
    // ¿la alerta coincide con una anomalía real durante el evento?
    let j = i, acierto = false, tipo = "";
    while (j < N && M.alarma[j]) { if (M.real[j]) { acierto = true; tipo = M.tipo_real[j]; break; } j++; }
    const div = document.createElement("div");
    div.className = "evento";
    div.innerHTML = `<span class="punto" style="background:${n.color}"></span>
      <div><b>${n.corto}</b> · ${fmtFecha(fechas[i])}<br><span class="nota">${Math.round(M.co2[i]).toLocaleString("es-CO")} ppm · ${n.nombre.split(": ")[1] || ""}</span></div>
      <span class="acierto ${acierto ? "si" : "no"}">${acierto ? "✔ " + TIPOS[tipo].nombre : "✘ Falsa alarma"}</span>`;
    return div;
  }

  function reconstruirBitacora() {
    const b = $("bitacora");
    b.innerHTML = "";
    const previos = inicios.filter((i) => i <= idx);
    if (!previos.length) { b.innerHTML = '<div class="vacio">Aún no hay alertas en este punto.</div>'; }
    previos.slice().reverse().forEach((i) => b.appendChild(evento(i)));
    $("v-alertas").textContent = previos.length;
  }

  function avanzarA(nuevo) {
    const anterior = idx;
    idx = Math.min(N - 1, Math.max(0, nuevo));
    if (idx > anterior && idx - anterior < 400) {
      const b = $("bitacora");
      inicios.filter((i) => i > anterior && i <= idx).forEach((i) => {
        const v = b.querySelector(".vacio"); if (v) v.remove();
        b.prepend(evento(i));
      });
      $("v-alertas").textContent = inicios.filter((i) => i <= idx).length;
    } else {
      reconstruirBitacora();
    }
    actualizarPanel();
  }

  function bucle(t) {
    if (!reproduciendo) return;
    const dt = ultimo ? (t - ultimo) / 1000 : 0;
    ultimo = t;
    acumulado += dt * lecturasPorSeg;
    const pasos = Math.floor(acumulado);
    if (pasos > 0) {
      acumulado -= pasos;
      avanzarA(idx + pasos);
      if (t - ultimoDibujo > 90) { dibujar(); ultimoDibujo = t; }
      if (idx >= N - 1) pausar();
    }
    requestAnimationFrame(bucle);
  }

  function reproducir() {
    if (idx >= N - 1) avanzarA(0);
    reproduciendo = true; ultimo = 0;
    $("b-play").textContent = "⏸ Pausar";
    requestAnimationFrame(bucle);
  }
  function pausar() {
    reproduciendo = false;
    $("b-play").textContent = "▶ Reproducir";
    dibujar();
  }

  $("b-play").addEventListener("click", () => (reproduciendo ? pausar() : reproducir()));
  $("b-evento").addEventListener("click", () => {
    const sig = inicios.find((i) => i > idx);
    if (sig === undefined) return;
    avanzarA(Math.min(N - 1, sig + 6));
    dibujar();
  });
  $("velocidades").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    $("velocidades").querySelectorAll("button").forEach((x) => x.classList.toggle("activo", x === b));
    lecturasPorSeg = +b.dataset.v;
  }));
  linea.addEventListener("input", () => { avanzarA(+linea.value); dibujar(); });

  actualizarPanel();
  reconstruirBitacora();
  dibujar();
})();
