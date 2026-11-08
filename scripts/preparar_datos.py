"""
DECA-AI - Preparación de datos y entrenamiento del modelo.

Genera el dataset sintético del aula, resume la encuesta, entrena los
5 autoencoders del cuaderno de Colab y exporta todo lo que la app Flask
necesita a la carpeta data/. La app NO necesita TensorFlow: solo lee
los archivos que produce este script.

Uso (requiere: pip install tensorflow pandas scikit-learn openpyxl):
    python scripts/preparar_datos.py
"""
import json
import os

import numpy as np
import pandas as pd

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, "data")
MODELO = os.path.join(RAIZ, "modelo")


def generar_dataset(seed=42):
    DIAS, PASO_MIN, VOLUMEN_M3 = 60, 5, 150
    CO2_EXTERIOR, CO2_POR_PERSONA_LS = 420, 0.005
    ACH_NORMAL, ACH_NOCHE, CAPACIDAD = 6.0, 1.0, 35

    rng = np.random.default_rng(seed)
    pasos_dia = 24 * 60 // PASO_MIN
    n = DIAS * pasos_dia
    fechas = pd.date_range("2026-08-03 00:00", periods=n, freq=f"{PASO_MIN}min")
    horas = fechas.hour + fechas.minute / 60

    bloques = [(7, 9), (9, 11), (11, 13), (14, 16), (16, 18)]
    ocupacion = np.zeros(n)
    for d in range(DIAS):
        ini = d * pasos_dia
        if fechas[ini].dayofweek >= 5:
            if fechas[ini].dayofweek == 5 and rng.random() < 0.5:
                mask = (horas[ini:ini + pasos_dia] >= 8) & (horas[ini:ini + pasos_dia] < 12)
                ocupacion[ini:ini + pasos_dia][mask] = rng.integers(8, 20)
            continue
        for h0, h1 in bloques:
            if rng.random() < 0.85:
                gente = rng.integers(15, CAPACIDAD + 1)
                mask = (horas[ini:ini + pasos_dia] >= h0) & (horas[ini:ini + pasos_dia] < h1 - 0.17)
                ocupacion[ini:ini + pasos_dia][mask] = gente
    ocupacion = np.clip(ocupacion + rng.integers(-2, 3, n) * (ocupacion > 0), 0, None)

    ach = np.where(ocupacion > 0, ACH_NORMAL, ACH_NOCHE) * rng.normal(1, 0.08, n)
    ach_base, ocupacion_base = ach.copy(), ocupacion.copy()
    etiqueta = np.zeros(n, dtype=int)
    tipo = np.array(["normal"] * n, dtype=object)

    def marcar(i0, largo, nombre):
        i1 = min(i0 + largo, n)
        etiqueta[i0:i1] = 1
        tipo[i0:i1] = nombre
        return i0, i1

    indices_ocupados = np.where(ocupacion > 0)[0]
    for _ in range(14):
        i0, i1 = marcar(rng.choice(indices_ocupados), rng.integers(18, 37), "falla_ventilacion")
        ach[i0:i1] = rng.uniform(0.3, 1.0)
    for _ in range(10):
        i0, i1 = marcar(rng.choice(indices_ocupados), rng.integers(12, 25), "sobreocupacion")
        ocupacion[i0:i1] = rng.integers(50, 71)

    def simular(ach_v, ocup_v):
        salida = np.empty(n)
        c = CO2_EXTERIOR
        for i in range(n):
            q = ach_v[i] * VOLUMEN_M3 / 3600
            generacion = ocup_v[i] * CO2_POR_PERSONA_LS / 1000 * 1e6 / VOLUMEN_M3
            for _ in range(PASO_MIN):
                c += 60 * (generacion + q / VOLUMEN_M3 * (CO2_EXTERIOR - c))
            salida[i] = c
        return salida

    co2 = simular(ach, ocupacion)
    co2_limpio = simular(ach_base, ocupacion_base)
    for i in range(1, n):
        if etiqueta[i] == 0 and etiqueta[i - 1] == 1 and co2[i] - co2_limpio[i] > 100:
            etiqueta[i] = 1
            tipo[i] = tipo[i - 1]

    co2_medido = co2 + rng.normal(0, 12, n)
    for _ in range(25):
        i0 = rng.integers(0, n)
        marcar(i0, 1, "pico_sensor")
        co2_medido[i0] += rng.uniform(600, 1500)
    for _ in range(4):
        i0, i1 = marcar(rng.integers(0, n - pasos_dia), pasos_dia, "deriva_sensor")
        co2_medido[i0:i1] += np.linspace(0, rng.uniform(250, 450), i1 - i0)
    for _ in range(5):
        i0, i1 = marcar(rng.integers(0, n - 50), rng.integers(24, 49), "sensor_congelado")
        co2_medido[i0:i1] = co2_medido[i0]

    temperatura = 16 + 3 * np.sin((horas - 9) / 24 * 2 * np.pi) + 0.06 * ocupacion + rng.normal(0, 0.3, n)
    humedad = 65 - 4 * np.sin((horas - 9) / 24 * 2 * np.pi) + 0.15 * ocupacion + rng.normal(0, 1.5, n)

    return pd.DataFrame({
        "fecha_hora": fechas,
        "co2_ppm": np.round(np.clip(co2_medido, 350, None), 1),
        "temperatura_c": np.round(temperatura, 2),
        "humedad_rel": np.round(np.clip(humedad, 20, 95), 1),
        "ocupacion": ocupacion.astype(int),
        "dia_semana": fechas.dayofweek,
        "hora": np.round(horas, 3),
        "anomalia": etiqueta,
        "tipo_anomalia": tipo,
    })


def resumir_encuesta():
    d = pd.read_excel(os.path.join(DATA, "encuesta_respuestas.xlsx"))
    c = list(d.columns)
    n = len(d)

    def conteo(col, orden=None, multiple=False):
        s = d[col].dropna().astype(str).str.strip()
        if multiple:
            s = s.str.split(", ").explode().str.strip()
        vc = s.value_counts()
        if orden:
            vc = vc.reindex([o for o in orden if o in vc.index])
        return {"labels": vc.index.tolist(), "values": [int(v) for v in vc.values],
                "pct": [round(v / n * 100, 1) for v in vc.values]}

    q = {
        "genero": conteo(c[1]),
        "edad": conteo(c[2], ["15 - 19 años", "20 - 25 años", "26 - 35 años", "36 - 45 años", "46 o más"]),
        "ocupacion": conteo(c[3]),
        "frecuencia": conteo(c[4], ["Todos los dias", "Varias veces a la semana", "Algunas veces al mes", "Casi nunca"]),
        "asfixia": conteo(c[5], ["Nada asfixiante", "Un poco asfixiante", "Bastante asfixiante", "Demasiado asfixiante"]),
        "sintomas": conteo(c[6], multiple=True),
        "atencion": conteo(c[7], ["Si, con frecuencia", "A veces", "Casi nunca", "No"]),
        "ventilar": conteo(c[8], ["Si, casi siempre", "A veces", "Rara vez",
                                  "No, porque no es posible (no hay ventanas, está prohibido, etc.)"]),
        "asocia_co2": conteo(c[9], ["Si, lo he pensado", "No estoy seguro/a", "No"]),
        "utilidad": conteo(c[10], ["Muy útil", "Bastante útil", "Poco útil", "Nada útil"]),
        "lugares": conteo(c[11], multiple=True),
    }
    imp = pd.to_numeric(d[c[12]], errors="coerce").dropna().astype(int)
    q["importancia"] = {"labels": list(range(1, 11)),
                        "values": [int((imp == k).sum()) for k in range(1, 11)],
                        "media": round(float(imp.mean()), 1)}

    exp = d[c[13]].dropna().astype(str).str.strip()
    exp = exp[~exp.str.lower().str.startswith("nada")]
    experiencias = exp.value_counts().index.tolist()

    pct = lambda clave, etiquetas: round(sum(
        v for l, v in zip(q[clave]["labels"], q[clave]["values"]) if l in etiquetas) / n * 100)
    kpis = {
        "n": n,
        "utilidad": pct("utilidad", ["Muy útil", "Bastante útil"]),
        "asfixia": pct("asfixia", ["Un poco asfixiante", "Bastante asfixiante", "Demasiado asfixiante"]),
        "atencion": pct("atencion", ["Si, con frecuencia", "A veces"]),
        "diario": pct("frecuencia", ["Todos los dias"]),
        "asocia": pct("asocia_co2", ["Si, lo he pensado"]),
        "no_ventila": pct("ventilar", ["No, porque no es posible (no hay ventanas, está prohibido, etc.)"]),
        "importancia": q["importancia"]["media"],
    }
    return {"kpis": kpis, "preguntas": q, "experiencias": experiencias}


def resumir_dataset(df):
    normales = df[df["anomalia"] == 0]
    tipos = ["normal", "falla_ventilacion", "sobreocupacion", "deriva_sensor", "sensor_congelado", "pico_sensor"]
    codigo = {t: i for i, t in enumerate(tipos)}

    caja = {}
    for t in tipos:
        v = df.loc[df["tipo_anomalia"] == t, "co2_ppm"]
        caja[t] = {k: round(float(x), 1) for k, x in zip(
            ["min", "q1", "mediana", "q3", "max"], np.percentile(v, [0, 25, 50, 75, 100]))}
        caja[t]["n"] = int(len(v))

    rangos = pd.cut(df["co2_ppm"], [0, 800, 1000, 1500, np.inf],
                    labels=["Buena (<800)", "Aceptable (800-1000)", "Deficiente (1000-1500)", "Crítica (>1500)"])
    vars_ = ["co2_ppm", "temperatura_c", "humedad_rel", "ocupacion"]
    corr = df[vars_].corr().round(2)

    return {
        "inicio": str(df["fecha_hora"].iloc[0]),
        "paso_min": 5,
        "n": int(len(df)),
        "tipos": tipos,
        "serie": {
            "co2": df["co2_ppm"].tolist(),
            "ocupacion": df["ocupacion"].tolist(),
            "temperatura": df["temperatura_c"].round(1).tolist(),
            "humedad": df["humedad_rel"].tolist(),
            "tipo": [codigo[t] for t in df["tipo_anomalia"]],
        },
        "perfil_horario": {
            "ocupada": normales[normales["ocupacion"] > 0].groupby(normales["fecha_hora"].dt.hour)["co2_ppm"].mean().round(0).reindex(range(24)).fillna(420).tolist(),
            "total": normales.groupby(normales["fecha_hora"].dt.hour)["co2_ppm"].mean().round(0).tolist(),
        },
        "conteo_tipos": {t: int((df["tipo_anomalia"] == t).sum()) for t in tipos},
        "caja": caja,
        "rangos": {str(k): int(v) for k, v in rangos.value_counts().sort_index().items()},
        "correlacion": {"vars": vars_, "matriz": corr.values.tolist()},
    }


def entrenar_modelos(df):
    import tensorflow as tf
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import (Input, Dense, Flatten, Reshape, Dropout, BatchNormalization,
                                         Conv1D, MaxPooling1D, UpSampling1D)
    from tensorflow.keras.callbacks import EarlyStopping
    from sklearn.preprocessing import MinMaxScaler
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix

    np.random.seed(42)
    tf.random.set_seed(42)

    VARIABLES, VENTANA = ["co2_ppm", "ocupacion", "temperatura_c"], 12
    N_VAR = len(VARIABLES)
    dias = df["fecha_hora"].dt.normalize()
    corte = dias.min() + pd.Timedelta(days=int(dias.nunique() * 0.7))
    entreno = df[df["fecha_hora"] < corte].reset_index(drop=True)
    prueba = df[df["fecha_hora"] >= corte].reset_index(drop=True)

    escalador = MinMaxScaler().fit(entreno.loc[entreno["anomalia"] == 0, VARIABLES])

    def ventanas(datos):
        v = escalador.transform(datos[VARIABLES])
        X = np.lib.stride_tricks.sliding_window_view(v, (VENTANA, N_VAR))[:, 0].astype("float32")
        y = np.lib.stride_tricks.sliding_window_view(datos["anomalia"].values, VENTANA).max(axis=1)
        t = np.lib.stride_tricks.sliding_window_view(datos["tipo_anomalia"].values, VENTANA)
        tipo = np.array([next((x for x in fila if x != "normal"), "normal") for fila in t])
        return X, y, tipo

    Xe, ye, _ = ventanas(entreno)
    Xp, yp, tp = ventanas(prueba)
    X_train, X_val = train_test_split(Xe[ye == 0], test_size=0.2, random_state=42)

    def denso(capas, regularizado=False):
        m = Sequential([Input(shape=(VENTANA, N_VAR)), Flatten()])
        for i, u in enumerate(capas):
            m.add(Dense(u, activation="relu"))
            if regularizado and u > 8:
                m.add(BatchNormalization())
                if i in (0, len(capas) - 1):
                    m.add(Dropout(0.2))
        m.add(Dense(VENTANA * N_VAR, activation="sigmoid"))
        m.add(Reshape((VENTANA, N_VAR)))
        return m

    def conv():
        return Sequential([
            Input(shape=(VENTANA, N_VAR)),
            Conv1D(32, 3, activation="relu", padding="same"), MaxPooling1D(2),
            Conv1D(16, 3, activation="relu", padding="same"), MaxPooling1D(2),
            Conv1D(8, 3, activation="relu", padding="same"), UpSampling1D(2),
            Conv1D(16, 3, activation="relu", padding="same"), UpSampling1D(2),
            Conv1D(32, 3, activation="relu", padding="same"),
            Conv1D(N_VAR, 3, activation="sigmoid", padding="same"),
        ])

    experimentos = [
        {"nombre": "Modelo 1", "cambio": "Autoencoder denso base con SGD",
         "arquitectura": "36 → 16 → 8 → 4 → 8 → 16 → 36", "crear": lambda: denso([16, 8, 4, 8, 16]),
         "opt": "sgd", "epocas": 30},
        {"nombre": "Modelo 2", "cambio": "Mismo modelo, optimizador Adam",
         "arquitectura": "36 → 16 → 8 → 4 → 8 → 16 → 36", "crear": lambda: denso([16, 8, 4, 8, 16]),
         "opt": "adam", "epocas": 30},
        {"nombre": "Modelo 3", "cambio": "Más neuronas por capa",
         "arquitectura": "36 → 64 → 32 → 8 → 32 → 64 → 36", "crear": lambda: denso([64, 32, 8, 32, 64]),
         "opt": "adam", "epocas": 30},
        {"nombre": "Modelo 4", "cambio": "BatchNormalization + Dropout",
         "arquitectura": "36 → 64 → 32 → 8 → 32 → 64 → 36 (+BN, Dropout 0.2)",
         "crear": lambda: denso([64, 32, 8, 32, 64], regularizado=True), "opt": "adam", "epocas": 50},
        {"nombre": "Modelo 5", "cambio": "Autoencoder convolucional (Conv1D)",
         "arquitectura": "Conv1D 32 → 16 → 8 (latente 3×8) → 16 → 32 → 3", "crear": conv,
         "opt": "adam", "epocas": 50},
    ]

    def error(m, X):
        return np.mean((X - m.predict(X, verbose=0)) ** 2, axis=(1, 2))

    resultados, mejor, mejor_f1 = [], None, -1
    for e in experimentos:
        tf.random.set_seed(42)
        m = e["crear"]()
        m.compile(optimizer=e["opt"], loss="mse")
        h = m.fit(X_train, X_train, validation_data=(X_val, X_val), epochs=e["epocas"], batch_size=64,
                  callbacks=[EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True)], verbose=0)
        umbral = float(np.percentile(error(m, X_val), 99))
        ep = error(m, Xp)
        pred = (ep > umbral).astype(int)
        por_tipo = {t: round(float(pred[tp == t].mean() * 100), 1) for t in sorted(set(tp)) if t != "normal"}
        r = {
            "nombre": e["nombre"], "cambio": e["cambio"], "arquitectura": e["arquitectura"],
            "optimizador": e["opt"], "parametros": int(m.count_params()), "epocas": len(h.history["loss"]),
            "umbral": umbral,
            "precision": round(float(precision_score(yp, pred)), 3),
            "recall": round(float(recall_score(yp, pred)), 3),
            "f1": round(float(f1_score(yp, pred)), 3),
            "matriz": confusion_matrix(yp, pred).tolist(),
            "por_tipo": por_tipo,
            "loss": [round(float(x), 6) for x in h.history["loss"]],
            "val_loss": [round(float(x), 6) for x in h.history["val_loss"]],
        }
        print(e["nombre"], r["precision"], r["recall"], r["f1"])
        resultados.append(r)
        if r["f1"] > mejor_f1:
            mejor_f1, mejor = r["f1"], (e, m, umbral, ep)

    e, modelo, umbral, ep = mejor
    os.makedirs(MODELO, exist_ok=True)
    modelo.save(os.path.join(MODELO, "deca_ai_autoencoder.keras"))

    hist = {"bins": np.histogram_bin_edges(np.log10(ep + 1e-9), bins=60).tolist()}
    hist["normal"] = np.histogram(np.log10(ep[yp == 0] + 1e-9), bins=hist["bins"])[0].tolist()
    hist["anomalia"] = np.histogram(np.log10(ep[yp == 1] + 1e-9), bins=hist["bins"])[0].tolist()

    # Sistema de alertas: persistencia de 3 ventanas + regla de sensor congelado
    co2_actual = prueba["co2_ppm"].values[VENTANA - 1:]
    congelado = np.lib.stride_tricks.sliding_window_view(prueba["co2_ppm"].values, VENTANA).std(axis=1) < 0.5
    supera = pd.Series(ep > umbral)
    persistente = (supera.groupby((~supera).cumsum()).cumsum() >= 3).values
    alarma = persistente | congelado

    def nivel(i):
        if congelado[i]:
            return "sensor_congelado"
        if co2_actual[i] >= 1500:
            return "critica"
        if co2_actual[i] >= 1000:
            return "advertencia"
        return "sensor_atipico"

    niveles = [nivel(i) if alarma[i] else "" for i in range(len(alarma))]
    fechas = prueba["fecha_hora"].iloc[VENTANA - 1:]

    monitor = {
        "modelo": e["nombre"],
        "inicio": str(fechas.iloc[0]),
        "paso_min": 5,
        "umbral": umbral,
        "co2": co2_actual.round(1).tolist(),
        "ocupacion": prueba["ocupacion"].values[VENTANA - 1:].tolist(),
        "temperatura": prueba["temperatura_c"].values[VENTANA - 1:].round(1).tolist(),
        "error": [float(f"{x:.6g}") for x in ep],
        "alarma": alarma.astype(int).tolist(),
        "nivel": niveles,
        "real": yp.astype(int).tolist(),
        "tipo_real": tp.tolist(),
        "metricas": {
            "precision": round(float(precision_score(yp, alarma)), 3),
            "recall": round(float(recall_score(yp, alarma)), 3),
            "f1": round(float(f1_score(yp, alarma)), 3),
        },
    }
    modelos = {"mejor": e["nombre"], "resultados": resultados, "histograma": hist,
               "division": {"entreno_ventanas": int(len(X_train)), "validacion_ventanas": int(len(X_val)),
                            "prueba_ventanas": int(len(Xp)), "prueba_anomalas": int(yp.sum()),
                            "corte": str(corte.date())}}
    return modelos, monitor


def guardar(nombre, obj):
    with open(os.path.join(DATA, nombre), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print("✔", nombre)


if __name__ == "__main__":
    df = generar_dataset()
    df.to_csv(os.path.join(DATA, "dataset_co2_aula.csv"), index=False)
    guardar("encuesta.json", resumir_encuesta())
    guardar("datos.json", resumir_dataset(df))
    modelos, monitor = entrenar_modelos(df)
    guardar("modelos.json", modelos)
    guardar("monitor.json", monitor)
