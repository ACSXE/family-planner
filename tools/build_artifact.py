#!/usr/bin/env python3
"""
Prepara una copia de Family Planner lista para publicarse como artifact de Claude.

El visor de artifacts envuelve la página de entrada (index.html) en su propio
<!doctype html>, <head> y <body>, así que esa página debe ir sin ellos. Este
script copia la aplicación a la carpeta indicada y quita ese envoltorio solo de
index.html; el resto de ficheros se copian tal cual.

Uso:
    python3 tools/build_artifact.py <carpeta_de_salida>
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ["login.html"]
DIRS = ["css", "js", "views"]


def strip_document_wrapper(html: str) -> str:
    html = re.sub(r"(?is)<!doctype[^>]*>|</?html[^>]*>|</?head>|</?body[^>]*>", "", html)
    html = re.sub(r'(?i)\s*<meta name="viewport"[^>]*>', "", html)
    # El idioma lo fija un script, porque la etiqueta <html> la pone el visor
    html = html.replace("</title>", "</title>\n  <script>document.documentElement.lang = 'es';</script>", 1)
    return html.strip() + "\n"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1]).resolve()
    if out == ROOT:
        sys.exit("La carpeta de salida no puede ser la del proyecto.")
    out.mkdir(parents=True, exist_ok=True)

    for name in FILES:
        shutil.copy2(ROOT / name, out / name)
    for name in DIRS:
        shutil.copytree(ROOT / name, out / name, dirs_exist_ok=True)
    (out / "index.html").write_text(
        strip_document_wrapper((ROOT / "index.html").read_text(encoding="utf-8")), encoding="utf-8"
    )
    print(f"Versión para el artifact generada en {out}")


if __name__ == "__main__":
    main()
