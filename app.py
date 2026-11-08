"""
DECA-AI - Detección de anomalías en calidad del aire mediante IA.

Aplicación web del proyecto. Muestra la historia del problema (storytelling
con la encuesta), los árboles de problemas y objetivos, los datos del aula,
el modelo autoencoder y un monitor que reproduce el sistema de alertas.

Ejecutar:
    pip install -r requirements.txt
    python app.py
y abrir http://127.0.0.1:5000
"""
import json
import os

from flask import Flask, abort, render_template, send_from_directory

RAIZ = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(RAIZ, "data")
ARCHIVOS_API = {"encuesta", "datos", "modelos", "monitor"}

app = Flask(__name__)


def cargar(nombre):
    with open(os.path.join(DATA, f"{nombre}.json"), encoding="utf-8") as f:
        return json.load(f)


ENCUESTA = cargar("encuesta")
MODELOS = cargar("modelos")
MONITOR_METRICAS = cargar("monitor")["metricas"]
MEJOR = next(r for r in MODELOS["resultados"] if r["nombre"] == MODELOS["mejor"])


@app.context_processor
def contexto_global():
    return {"kpis": ENCUESTA["kpis"], "mejor": MEJOR, "alertas": MONITOR_METRICAS}


@app.route("/")
def historia():
    return render_template("historia.html", pagina="historia", experiencias=ENCUESTA["experiencias"])


def pct_opcion(pregunta, etiqueta):
    p = ENCUESTA["preguntas"][pregunta]
    return round(dict(zip(p["labels"], p["pct"])).get(etiqueta, 0))


def construir_arbol():
    k = ENCUESTA["kpis"]
    datos = cargar("datos")
    corr = datos["correlacion"]
    r_co2_temp = corr["matriz"][corr["vars"].index("co2_ppm")][corr["vars"].index("temperatura_c")]
    lluvia = next((e for e in ENCUESTA["experiencias"] if "lluvia" in e.lower()), "")
    t = MEJOR["por_tipo"]
    return {
        "efectos": [
            {"id": "e1", "problema": "Disminución de concentración",
             "p_texto": "La concentración del dióxido de carbono dificulta la capacidad de concentración y reduce el rendimiento mental.",
             "objetivo": "Mejorar la concentración y rendimiento",
             "o_texto": "Aumentar la capacidad de atención y el desempeño cognitivo al mantener niveles saludables de aire.",
             "evidencia": f"El <strong>{k['atencion']}%</strong> de los encuestados nota que en lugares cerrados le cuesta más prestar atención o se cansa más de lo normal."},
            {"id": "e2", "problema": "Dolores de cabeza",
             "p_texto": "La acumulación del dióxido de carbono provoca cefaleas frecuentes y molestias de cabeza.",
             "objetivo": "Disminuir los dolores de cabeza",
             "o_texto": "Reducir las cefaleas y molestias de cabeza causadas por la acumulación de CO₂.",
             "evidencia": f"El <strong>{pct_opcion('sintomas', 'Dolor de cabeza')}%</strong> reporta dolor de cabeza cuando el aire se siente pesado."},
            {"id": "e3", "problema": "Fatiga y cansancio",
             "p_texto": "El exceso de dióxido de carbono genera agotamiento, falta de energía y cansancio constante.",
             "objetivo": "Reducir la fatiga y el cansancio",
             "o_texto": "Mantener la energía y evitar el agotamiento causado por el aire cargado.",
             "evidencia": f"La fatiga es el síntoma más reportado: <strong>{pct_opcion('sintomas', 'Fatiga o cansancio')}%</strong>, seguida de la somnolencia ({pct_opcion('sintomas', 'Sueño o somnolencia')}%)."},
            {"id": "e4", "problema": "Afectación de la salud y bienestar",
             "p_texto": "La exposición prolongada deteriora el estado general de salud y disminuye la calidad de vida y bienestar.",
             "objetivo": "Proteger la salud y el bienestar",
             "o_texto": "Evitar la exposición prolongada a aire viciado y mejorar la calidad de vida en aulas, oficinas, salas de espera y gimnasios.",
             "evidencia": f"Los encuestados califican con <strong>{str(k['importancia']).replace('.', ',')}/10</strong> la importancia de controlar el aire donde pasan mucho tiempo."},
        ],
        "central": {"id": "c0", "problema": "Exceso de dióxido de carbono (CO₂) en espacios cerrados por poca ventilación",
                    "objetivo": "Reducir el exceso de dióxido de carbono (CO₂) en espacios cerrados",
                    "evidencia": f"El <strong>{k['asfixia']}%</strong> siente el aire asfixiante en lugares cerrados con poca ventilación, y el <strong>{k['utilidad']}%</strong> considera útil un sistema de alertas."},
        "causas": [
            {"id": "c1", "problema": "Mala ventilación",
             "p_texto": "Mantener los espacios cerrados sin permitir la entrada de aire fresco favorece la acumulación de CO₂.",
             "objetivo": "Detectar la falta de ventilación",
             "o_texto": "Entrenar una red neuronal Autoencoder que detecte la acumulación de CO₂ mediante el error de reconstrucción.",
             "evidencia": f"El autoencoder final ({MEJOR['nombre']}) detecta el <strong>{t.get('falla_ventilacion', 0):.0f}%</strong> de las ventanas con falla de ventilación en el periodo de prueba."},
            {"id": "c2", "problema": "Concentración de calor",
             "p_texto": "La falta de aire genera un aumento de la temperatura y también que el dióxido de carbono se concentre en el ambiente.",
             "objetivo": "Monitorear CO₂ y temperatura",
             "o_texto": "Medir en conjunto el CO₂, la temperatura y la ocupación para identificar cuándo el ambiente se vuelve atípico o peligroso.",
             "evidencia": f"En los datos del aula, CO₂ y temperatura se mueven juntos (correlación de <strong>{str(r_co2_temp).replace('.', ',')}</strong>); por eso el modelo recibe ambas variables."},
            {"id": "c3", "problema": "Lugar de ubicación",
             "p_texto": "Dependiendo de la localización del lugar, puede limitar las posibilidades de ventilación y afectar la calidad del aire que ingresa.",
             "objetivo": "Adaptar el monitoreo a cada espacio",
             "o_texto": "Aprender el comportamiento normal de cada lugar e indicar salir o activar la ventilación mecánica donde no hay ventanas.",
             "evidencia": f"El <strong>{k['no_ventila']}%</strong> no puede abrir ventanas porque no las hay o no está permitido."},
            {"id": "c4", "problema": "Estaciones",
             "p_texto": "En temporadas de frío o lluvia se tiende a mantener las ventanas cerradas, reduciendo la renovación del aire.",
             "objetivo": "Ventilar en cualquier época del año",
             "o_texto": "Emitir alertas en tiempo real (app o dispositivo) que indiquen cuándo renovar el aire, aunque haga frío o llueva.",
             "evidencia": f"«{lluvia}» — testimonio de la encuesta." if lluvia else ""},
        ],
    }


@app.route("/arboles")
def arboles():
    return render_template("arboles.html", pagina="arboles", arbol=construir_arbol())


@app.route("/datos")
def datos():
    return render_template("datos.html", pagina="datos")


@app.route("/modelo")
def modelo():
    return render_template("modelo.html", pagina="modelo", modelos=MODELOS)


@app.route("/monitor")
def monitor():
    return render_template("monitor.html", pagina="monitor")


@app.route("/api/<nombre>.json")
def api(nombre):
    if nombre not in ARCHIVOS_API:
        abort(404)
    return send_from_directory(DATA, f"{nombre}.json", mimetype="application/json")


if __name__ == "__main__":
    app.run(debug=True)
