// Utilidades compartidas por todas las páginas de DECA-AI
const COLORES = {
  verde: "#00a651", verdeOscuro: "#0b7a3f", cielo: "#92dbec", rosa: "#f6c4b8", tierra: "#c99571",
  tinta: "#1f2a2e", suave: "#4b5a60", ok: "#1f9d63", adv: "#e0a100", crit: "#d6453d", sensor: "#6c5ce7",
  gris: "#b9c3c6",
};

const TIPOS = {
  normal: { nombre: "Normal", color: "#7fb7c6" },
  falla_ventilacion: { nombre: "Falla de ventilación", color: "#d6453d" },
  sobreocupacion: { nombre: "Sobreocupación", color: "#e58a1f" },
  deriva_sensor: { nombre: "Deriva del sensor", color: "#6c5ce7" },
  sensor_congelado: { nombre: "Sensor congelado", color: "#1f9d63" },
  pico_sensor: { nombre: "Pico del sensor", color: "#1f2a2e" },
};

const NIVELES = {
  critica: { nombre: "Crítica: CO₂ muy alto, ventilar o desalojar", corto: "Crítica", color: COLORES.crit },
  advertencia: { nombre: "Advertencia: CO₂ elevado, abrir ventanas", corto: "Advertencia", color: COLORES.adv },
  sensor_atipico: { nombre: "Sensor: comportamiento atípico", corto: "Revisar sensor", color: COLORES.sensor },
  sensor_congelado: { nombre: "Sensor: lectura congelada", corto: "Sensor congelado", color: COLORES.sensor },
};

const PLOTLY_CONFIG = { responsive: true, displaylogo: false, locale: "es",
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] };

function layoutBase(extra = {}) {
  return Object.assign({
    font: { family: "Nunito, Segoe UI, sans-serif", color: COLORES.tinta, size: 13 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 55, r: 20, t: 30, b: 45 },
    hoverlabel: { font: { family: "Nunito, sans-serif" } },
    xaxis: { gridcolor: "#ece6de", zeroline: false },
    yaxis: { gridcolor: "#ece6de", zeroline: false },
    legend: { orientation: "h", y: -0.2 },
  }, extra);
}

// En la versión estática (GitHub Pages) no hay servidor Flask: los datos se leen como archivos
const ESTATICO = !!window.DECA_ESTATICO;
const RUTA_API = ESTATICO ? "api/" : "/api/";

async function cargarJSON(nombre) {
  const r = await fetch(`${RUTA_API}${nombre}.json`);
  return r.json();
}

function fechasDesde(inicio, n, pasoMin) {
  const base = new Date(inicio.replace(" ", "T"));
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = new Date(base.getTime() + i * pasoMin * 60000);
  return out;
}

function fmtFecha(d) {
  return d.toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Aparición de secciones al hacer scroll
document.addEventListener("DOMContentLoaded", () => {
  const obs = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        e.target.dispatchEvent(new CustomEvent("revelado"));
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll(".revelar").forEach((el) => obs.observe(el));
});

// Contador animado para cifras
function animarNumero(el, destino, sufijo = "", decimales = 0) {
  const t0 = performance.now(), dur = 1400;
  function paso(t) {
    const p = Math.min(1, (t - t0) / dur), v = destino * (1 - Math.pow(1 - p, 3));
    el.textContent = v.toFixed(decimales).replace(".", ",") + sufijo;
    if (p < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}
