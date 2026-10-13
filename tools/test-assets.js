/*
 * Verifica los assets generados: que cada archivo del manifest exista y esté sano (tamaño y sha256),
 * que cada nivel y cada grupo entren en su presupuesto, y que todo figure en CREDITOS.md.
 * Uso: [SRC=src/next] node tools/test-assets.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SRC = path.resolve(ROOT, process.env.SRC || 'src/next');
const MB = 1024 * 1024;
// Presupuesto del spec en MB por grupo (la primera parte de la clave) y por nivel. Se tolera un 20 % más.
const PRESUPUESTO = {
  alta:    { total: 27,  hilux: 6,   conductor: 2.5, companero: 1, anim: 2.5, cielo: 2.5, tex: 8, obj: 6 },
  liviana: { total: 15,  hilux: 3.5, conductor: 2,   companero: 1, anim: 2.5, cielo: 2,   tex: 3, obj: 3 }
};
const TOLERANCIA = 1.2;

const errores = [];
const check = (ok, msg) => { if (!ok) errores.push(msg); };

const manifestPath = path.join(SRC, 'assets', 'manifest.json');
assert.ok(fs.existsSync(manifestPath), 'falta ' + path.relative(ROOT, manifestPath));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const creditos = fs.readFileSync(path.join(ROOT, 'CREDITOS.md'), 'utf8');

for (const nivel of ['alta', 'liviana']) {
  const n = manifest.niveles[nivel];
  check(n, `el manifest no tiene el nivel ${nivel}`);
  if (!n) continue;
  const grupos = {};
  let total = 0;
  for (const [clave, a] of Object.entries(n.archivos)) {
    const file = path.join(SRC, a.url);
    if (!fs.existsSync(file)) { check(false, `${nivel}/${clave}: no existe ${a.url}`); continue; }
    const buf = fs.readFileSync(file);
    check(buf.length === a.bytes, `${nivel}/${clave}: pesa ${buf.length} y el manifest dice ${a.bytes}`);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    check(sha === a.sha256, `${nivel}/${clave}: el contenido no coincide (archivo dañado o viejo)`);
    check(path.basename(a.url).includes('.' + sha.slice(0, 6) + '.'), `${nivel}/${clave}: el nombre no lleva el hash del contenido`);
    check(a.fuente && creditos.includes('`' + a.fuente + '`'), `${nivel}/${clave}: la fuente ${a.fuente} no figura en CREDITOS.md`);
    const g = clave.split('.')[0];
    check(PRESUPUESTO[nivel][g] !== undefined, `${nivel}/${clave}: grupo sin presupuesto (${g})`);
    grupos[g] = (grupos[g] || 0) + a.bytes;
    total += a.bytes;
  }
  check(total === n.total, `${nivel}: el total del manifest no coincide`);
  for (const [g, bytes] of Object.entries(grupos)) {
    const max = (PRESUPUESTO[nivel][g] || 0) * TOLERANCIA * MB;
    check(bytes <= max, `${nivel}/${g}: ${(bytes / MB).toFixed(1)} MB supera el presupuesto de ${PRESUPUESTO[nivel][g]} MB`);
  }
  check(total <= PRESUPUESTO[nivel].total * TOLERANCIA * MB, `${nivel}: ${(total / MB).toFixed(1)} MB supera el total de ${PRESUPUESTO[nivel].total} MB`);
  console.log(`${nivel}: ${Object.keys(n.archivos).length} archivos, ${(total / MB).toFixed(1)} MB ` +
    '(' + Object.entries(grupos).map(([g, b]) => `${g} ${(b / MB).toFixed(1)}`).join(', ') + ')');
}

// Archivos sueltos en assets/ que no están en el manifest: quedaron de un armado anterior
for (const nivel of ['alta', 'liviana']) {
  const dir = path.join(SRC, 'assets', nivel);
  if (!fs.existsSync(dir)) continue;
  const usados = new Set(Object.values(manifest.niveles[nivel].archivos).map(a => path.basename(a.url)));
  for (const f of fs.readdirSync(dir)) check(usados.has(f), `${nivel}: ${f} sobra (no está en el manifest)`);
}

// El service worker guarda todo el código: si falta un archivo, sin conexión no abre
{
  const sw = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
  const lista = new Set([...sw.slice(sw.indexOf('const CODIGO'), sw.indexOf('];', sw.indexOf('const CODIGO'))).matchAll(/'([^']+)'/g)].map(m => m[1]));
  const recorrer = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const f = path.join(dir, e.name), rel = path.relative(SRC, f).split(path.sep).join('/');
    if (e.isDirectory()) return rel === 'assets' ? [] : recorrer(f);
    return /\.(js|css|html)$/.test(e.name) && rel !== 'sw.js' ? [rel] : [];
  });
  for (const f of recorrer(SRC)) check(lista.has(f), `sw.js no guarda ${f}: sin conexión no abriría`);
  for (const f of lista) check(f === './' || fs.existsSync(path.join(SRC, f)), `sw.js lista ${f}, que no existe`);
}

// La Hilux: los nodos que usa el motor, sin la chapa de abajo, triángulos por nivel y medidas con sentido físico
async function hilux() {
  const { NodeIO } = require('@gltf-transform/core');
  const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
  const { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const NODOS = ['cuerpo', 'rueda_DI', 'rueda_DD', 'rueda_TI', 'rueda_TD', 'eje_trasero', 'ballesta_I_del', 'ballesta_I_tras',
    'ballesta_D_del', 'ballesta_D_tras', 'escape', 'tanque', 'volante', 'porton', 'larguero'];
  const MAX = { alta: 450000, liviana: 240000 };
  for (const nivel of ['alta', 'liviana']) {
    const a = manifest.niveles[nivel].archivos.hilux;
    if (!a) { check(false, `${nivel}: falta la Hilux`); continue; }
    const doc = await io.read(path.join(SRC, a.url)), nombres = new Set(doc.getRoot().listNodes().map(n => n.getName()));
    for (const n of NODOS) check(nombres.has(n), `${nivel}/hilux: falta el nodo ${n}`);
    check(!nombres.has('Object037'), `${nivel}/hilux: quedó la chapa que tapa la parte de abajo`);
    const tri = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
    check(tri <= MAX[nivel], `${nivel}/hilux: ${Math.round(tri)} triángulos (máximo ${MAX[nivel]})`);
  }
  const M = require(path.join(SRC, 'assets', 'hilux.medidas.js'));
  const rango = (v, a, b, k) => check(typeof v === 'number' && v >= a && v <= b, `medidas: ${k} = ${v}, fuera de ${a}..${b}`);
  rango(M.radioRueda, 0.35, 0.45, 'radioRueda');
  rango(M.arco.del.luzNominal, 0.05, 0.2, 'luz nominal delantera'); rango(M.arco.tras.luzNominal, 0.05, 0.2, 'luz nominal trasera');
  rango(M.caja.yBordeSup - M.caja.yPiso, 0.4, 0.55, 'profundidad de la caja');
  rango(M.caja.yBordeSup - M.caja.yBordeInfExt, 0.4, 0.65, 'alto del portón');
  rango(M.caja.yTechoPasarruedas - M.caja.yPiso, 0.12, 0.35, 'alto de los pasarruedas internos');
  rango(M.volante.radio, 0.13, 0.22, 'radio del volante');
  check(M.volante.centro[0] < 0, 'el volante tiene que quedar a la izquierda (x < 0)');
  check(M.ejes.del < 0 && M.ejes.tras > 0, 'la camioneta tiene que mirar hacia -z');
}

hilux().then(() => {
  if (errores.length) { console.error('ERRORES:\n' + errores.join('\n')); process.exit(1); }
  console.log('assets: sin errores');
});
