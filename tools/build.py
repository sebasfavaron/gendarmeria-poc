#!/usr/bin/env python3
"""
Arma dist/gendarmeria-poc.html: un solo archivo con el CSS, three.js y los scripts adentro,
para abrirlo con doble clic o mandarlo por mensaje. Funciona sin internet (solo la fuente
Roboto viene de Google Fonts; sin conexión se usa la del sistema).

Uso: python3 tools/build.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
OUT = ROOT / 'dist' / 'gendarmeria-poc.html'


def read(rel):
    return (SRC / rel).read_text(encoding='utf-8')


def inline_script(match):
    src = match.group(1)
    code = read(src)
    if '</script' in code.lower():
        raise SystemExit(f'{src} contiene "</script" y no se puede incrustar')
    return f'<script>/* {src} */\n{code}\n</script>'


html = read('index.html')
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + read('styles.css') + '\n</style>')
html = re.sub(r'<!-- three\.js r128 local.*?-->\n', '', html, flags=re.S)
html = re.sub(r'<!-- sw:.*?<!-- /sw -->\n', '', html, flags=re.S)   # dist/ es un archivo suelto: sin service worker
html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)
if 'src="' in re.sub(r'<link[^>]+>', '', html):
    raise SystemExit('quedó alguna referencia a un archivo externo')

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html, encoding='utf-8')
print(f'{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1024:.0f} KB')
