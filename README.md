# DECA-AI · Detección de anomalías en calidad del aire mediante IA

Aplicación web en Flask del proyecto de Inteligencia Artificial.

## Cómo ejecutarla (Windows)

1. Abre una terminal (CMD o PowerShell) dentro de esta carpeta.
2. Crea y activa un entorno virtual (solo la primera vez):
   ```
   python -m venv venv
   venv\Scripts\activate
   ```
3. Instala Flask:
   ```
   pip install -r requirements.txt
   ```
4. Ejecuta la app:
   ```
   python app.py
   ```
5. Abre en el navegador: http://127.0.0.1:5000

La próxima vez solo necesitas los pasos 2 (solo `venv\Scripts\activate`), 4 y 5.

La app funciona sin internet (Plotly va incluido). Solo las fuentes tipográficas se descargan de Google Fonts; sin conexión se usan fuentes del sistema.

## Páginas

| Ruta | Contenido |
|---|---|
| `/` | **La historia**: storytelling con los resultados de la encuesta (50 personas) y un día de CO₂ en el aula |
| `/arboles` | **Problema y objetivos**: árboles interactivos; cada problema se ilumina junto a su objetivo y el dato que lo respalda |
| `/datos` | **Los datos**: cómo se generó el dataset, los 60 días completos con filtros y estadísticas |
| `/modelo` | **El modelo**: arquitectura del autoencoder, los 5 experimentos y sus métricas |
| `/monitor` | **Monitor en vivo**: reproduce los 18 días de prueba lectura por lectura con alertas |

## Estructura

```
DECA-AI/
├── app.py                      ← servidor Flask
├── requirements.txt            ← solo Flask
├── data/
│   ├── encuesta_respuestas.xlsx  ← respuestas originales de la encuesta
│   ├── dataset_co2_aula.csv      ← dataset sintético (17.280 registros)
│   ├── encuesta.json             ← resumen de la encuesta
│   ├── datos.json                ← serie y estadísticas del aula
│   ├── modelos.json              ← resultados de los 5 modelos
│   └── monitor.json              ← errores y alertas del periodo de prueba
├── modelo/deca_ai_autoencoder.keras  ← mejor modelo entrenado
├── scripts/preparar_datos.py   ← regenera todo lo de data/ y modelo/
├── templates/                  ← páginas HTML
└── static/                     ← estilos, JavaScript y Plotly
```

## ¿Por qué la app no necesita TensorFlow?

El modelo se entrena una sola vez con `scripts/preparar_datos.py`, que guarda sus resultados (errores de reconstrucción, umbral, alertas y métricas) en `data/`. La app solo lee esos archivos. Así funciona en cualquier PC con Python, sin instalar TensorFlow, que además solo es compatible con algunas versiones de Python.

Para volver a entrenar (opcional, requiere Python 3.9–3.12):
```
pip install -r requirements-entrenamiento.txt
python scripts/preparar_datos.py
```
Los números pueden variar un poco entre entrenamientos.

## Autores

Mayra Vanessa Caipe Rojas · Andrés Camilo Galindo Rodríguez
Inteligencia Artificial · Docente: Yudy Amparo Narváez Vallejo · Chía, Cundinamarca
