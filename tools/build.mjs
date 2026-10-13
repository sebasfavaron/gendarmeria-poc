/*
 * Arma la versión de un solo archivo: el HTML con el CSS, los scripts, three.js y los assets del nivel
 * "liviana" adentro (en base64). Se abre con doble clic y funciona sin internet (solo la fuente Roboto
 * viene de Google Fonts; sin conexión se usa la del sistema).
 *
 * Uso: node tools/build.mjs [carpeta fuente] [archivo de salida]
 *   por defecto: src/next → dist/next/gendarmeria-poc.html (hasta que src/next pase a src/)
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(ROOT, process.argv[2] || 'src/next');
const OUT = path.resolve(ROOT, process.argv[3] || (path.basename(SRC) === 'next' ? 'dist/next/gendarmeria-poc.html' : 'dist/gendarmeria-poc.html'));
const NIVEL = 'liviana';
const leer = rel => fs.readFileSync(path.join(SRC, rel), 'utf8');
const script = (nombre, code) => {
  if (/<\/script/i.test(code)) throw new Error(`${nombre} contiene "</script" y no se puede incrustar`);
  return `<script>/* ${nombre} */\n${code}\n</script>`;
};

// El motor (módulos ES) en un solo script común
const vendor = path.join(SRC, 'vendor/three');
const r = await build({
  entryPoints: [path.join(SRC, 'motor/main.js')], bundle: true, minify: true, format: 'iife', write: false,
  alias: { three: path.join(vendor, 'three.module.min.js') }, logLevel: 'warning',
  plugins: [{ name: 'addons', setup(b) { b.onResolve({ filter: /^three\/addons\// }, a => ({ path: path.join(vendor, 'addons', a.path.slice('three/addons/'.length)) })); } }]
});
const motor = r.outputFiles[0].text;

// Assets del nivel liviana, con su manifest
const manifest = JSON.parse(leer('assets/manifest.json'));
const nivel = manifest.niveles[NIVEL], archivos = {};
for (const a of Object.values(nivel.archivos)) archivos[a.url] = fs.readFileSync(path.join(SRC, a.url)).toString('base64');
const incrustado = { nivel: NIVEL, manifest: { version: manifest.version, niveles: { [NIVEL]: nivel } }, archivos };

let html = leer('index.html');
// Reemplazos con función: el código minificado tiene "$&" y "$'", que replace() interpretaría
html = html.replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + leer('styles.css') + '\n</style>');
html = html.replace(/<!-- three\.js r186 local[\s\S]*?<\/script>\n/, '');                 // importmap
html = html.replace(/<!-- sw:[\s\S]*?<!-- \/sw -->\n/, '');                                 // un archivo suelto no tiene service worker
html = html.replace('<script type="module" src="motor/main.js"></script>',
  () => script('assets', 'window.__ASSETS = ' + JSON.stringify(incrustado) + ';') + '\n' + script('motor', motor));
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => script(src, leer(src)));
if (/<(script|img|iframe|source)\b[^>]*\ssrc="(?!data:)/i.test(html)) throw new Error('quedó alguna referencia a un archivo externo');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
if (fs.readFileSync(OUT, 'utf8') !== html) throw new Error('el archivo escrito no coincide (disco dañado)');
console.log(`${path.relative(ROOT, OUT)}: ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB (assets ${NIVEL})`);
