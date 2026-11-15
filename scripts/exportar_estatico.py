"""
Genera la versión estática de DECA-AI en la carpeta docs/ para publicarla en GitHub Pages.

GitHub Pages no ejecuta Python, así que este script "congela" cada página de la app Flask
en un archivo HTML y copia los datos y estilos. En esa versión, los reportes de "Participa"
se guardan en el navegador de cada visitante.

Uso:
    python scripts/exportar_estatico.py
"""
import os
import re
import shutil
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from app import app  # noqa: E402

DOCS = os.path.join(RAIZ, "docs")
PAGINAS = {"/": "index.html", "/arboles": "arboles.html", "/datos": "datos.html", "/modelo": "modelo.html",
           "/participa": "participa.html", "/comunidad": "comunidad.html", "/monitor": "monitor.html"}
DATOS = ["encuesta", "datos", "modelos", "monitor"]


def relativizar(html):
    html = html.replace('href="/static/', 'href="static/').replace('src="/static/', 'src="static/')
    html = re.sub(r'href="(/[a-z]*)"', lambda m: f'href="{PAGINAS.get(m.group(1), m.group(1))}"', html)
    return html.replace('<script src="static/js/comun.js">',
                        '<script>window.DECA_ESTATICO = true;</script>\n  <script src="static/js/comun.js">')


if __name__ == "__main__":
    if os.path.exists(DOCS):
        shutil.rmtree(DOCS)
    os.makedirs(os.path.join(DOCS, "api"))
    cliente = app.test_client()
    for ruta, archivo in PAGINAS.items():
        r = cliente.get(ruta)
        assert r.status_code == 200, ruta
        with open(os.path.join(DOCS, archivo), "w", encoding="utf-8") as f:
            f.write(relativizar(r.get_data(as_text=True)))
        print("✔", archivo)
    shutil.copytree(os.path.join(RAIZ, "static"), os.path.join(DOCS, "static"))
    for n in DATOS:
        shutil.copy(os.path.join(RAIZ, "data", f"{n}.json"), os.path.join(DOCS, "api", f"{n}.json"))
    open(os.path.join(DOCS, ".nojekyll"), "w").close()
    print("Versión estática lista en docs/")
