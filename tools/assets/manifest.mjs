/*
 * Arma src/next/assets/ a partir de lo que dejaron los scripts en tools/.cache/build/:
 * copia cada archivo con un hash del contenido en el nombre (así la caché nunca sirve uno viejo),
 * verifica la copia (el disco de trabajo tuvo corrupción silenciosa) y escribe manifest.json.
 *
 * Fuentes: tools/.cache/build/*.entradas.json ([{ nivel, clave, archivo, fuente, meta }]) y los
 * archivos fijos de la Hilux y de Rocketbox, si ya existen.
 * Uso: node tools/assets/manifest.mjs [carpeta destino]   (por defecto src/next)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(TOOLS, '.cache', 'build');
const SRC = path.resolve(TOOLS, '..', process.argv[2] || 'src/next');
const ASSETS = path.join(SRC, 'assets');
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

const entradas = [];
for (const f of fs.readdirSync(BUILD).filter(f => f.endsWith('.entradas.json'))) entradas.push(...JSON.parse(fs.readFileSync(path.join(BUILD, f))));
// Salidas de los pipelines de la Hilux y de Rocketbox (nombres fijos, ver el plan)
const HILUX = 'sketchfab:toyota-hilux-revo-prerunner-2021';
const fijos = [
  ['alta', 'hilux', 'hilux-alta.glb', HILUX], ['liviana', 'hilux', 'hilux-liviana.glb', HILUX],
  ['alta', 'conductor', 'conductor-alta.glb', 'rocketbox:Wood_Male_01'], ['liviana', 'conductor', 'conductor-liviana.glb', 'rocketbox:Wood_Male_01'],
  ['alta', 'companero', 'companero.glb', 'rocketbox:Construction_Male_08'], ['liviana', 'companero', 'companero.glb', 'rocketbox:Construction_Male_08'],
  ['alta', 'anim.espera', 'espera.glb', 'rocketbox:animaciones'], ['liviana', 'anim.espera', 'espera.glb', 'rocketbox:animaciones'],
  ['alta', 'anim.sentado', 'sentado.glb', 'rocketbox:animaciones'], ['liviana', 'anim.sentado', 'sentado.glb', 'rocketbox:animaciones']
];
for (const [nivel, clave, archivo, fuente] of fijos) {
  if (fs.existsSync(path.join(BUILD, archivo))) entradas.push({ nivel, clave, archivo: path.join('.cache', 'build', archivo), fuente });
}

const niveles = { alta: { archivos: {}, total: 0 }, liviana: { archivos: {}, total: 0 } };
for (const e of entradas) {
  const src = path.join(TOOLS, e.archivo), buf = fs.readFileSync(src), sha = sha256(buf);
  const ext = path.extname(src), base = e.clave.replace(/\./g, '-');
  const nombre = `${base}.${sha.slice(0, 6)}${ext}`, dst = path.join(ASSETS, e.nivel, nombre);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (!fs.existsSync(dst) || sha256(fs.readFileSync(dst)) !== sha) {
    fs.writeFileSync(dst, buf);
    if (sha256(fs.readFileSync(dst)) !== sha) throw new Error('la copia quedó dañada: ' + dst);
  }
  const n = niveles[e.nivel];
  n.archivos[e.clave] = Object.assign({ url: `assets/${e.nivel}/${nombre}`, bytes: buf.length, sha256: sha, fuente: e.fuente }, e.meta ? { meta: e.meta } : {});
  n.total += buf.length;
}
// Lo que quedó de armados anteriores
for (const nivel of Object.keys(niveles)) {
  const dir = path.join(ASSETS, nivel); if (!fs.existsSync(dir)) continue;
  const usados = new Set(Object.values(niveles[nivel].archivos).map(a => path.basename(a.url)));
  for (const f of fs.readdirSync(dir)) if (!usados.has(f)) fs.rmSync(path.join(dir, f));
}
// Las medidas de la Hilux son un script común (las usan caso.js, el motor y las pruebas)
const medidas = path.join(BUILD, 'hilux.medidas.js');
if (fs.existsSync(medidas)) fs.copyFileSync(medidas, path.join(ASSETS, 'hilux.medidas.js'));

const version = sha256(Buffer.from(JSON.stringify(niveles))).slice(0, 10);
fs.writeFileSync(path.join(ASSETS, 'manifest.json'), JSON.stringify({ version, niveles }, null, 1));
const mb = b => (b / 1048576).toFixed(1) + ' MB';
console.log(`manifest ${version}: alta ${mb(niveles.alta.total)}, liviana ${mb(niveles.liviana.total)}`);
