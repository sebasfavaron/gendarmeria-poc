/*
 * Mide la Hilux armada con rayos sobre la malla, en el mismo motor que usa la página (three.js r186 en
 * Chromium), y escribe tools/.cache/build/hilux.medidas.js. Mide los dos niveles: los valores salen de
 * "alta" y se controla que "liviana" no difiera en lo que se mide con la cinta.
 * Uso: node tools/assets/medir-hilux.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(TOOLS, '.cache', 'build');
const VENDOR = path.join(TOOLS, '..', 'src', 'next', 'vendor');

// Todo lo que sigue corre en la página
const MEDIR = String.raw`
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
window.medir = async url => {
  const g = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url)).scene;
  g.updateMatrixWorld(true);
  // Para medir, las caras cuentan de los dos lados (un vidrio visto desde adentro, el forro de un pasarruedas)
  g.traverse(m => { if (m.isMesh) m.material.side = THREE.DoubleSide; });
  const O = n => g.getObjectByName(n), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cuerpo = O('cuerpo'), ruedas = ['rueda_DI', 'rueda_DD', 'rueda_TI', 'rueda_TD'].map(O);
  const ray = new THREE.Raycaster();
  // Primer impacto; filtro(material) descarta lo que no interesa (por ejemplo, vidrios)
  const hit = (o, d, objs, far = 10, filtro) => { ray.set(o, d.clone().normalize()); ray.far = far; return ray.intersectObjects([].concat(objs), true).find(h => !filtro || filtro(h.object.material ? h.object.material.name : '')) || null; };
  const mat = h => h && h.object.material ? h.object.material.name : '';
  const r3 = v => Math.round(v * 1000) / 1000, a3 = v => v.toArray().map(r3);
  const W = o => o.getWorldPosition(new THREE.Vector3());

  // Ejes y ruedas
  const zDel = (W(ruedas[0]).z + W(ruedas[1]).z) / 2, zTras = (W(ruedas[2]).z + W(ruedas[3]).z) / 2;
  const xDel = Math.abs(W(ruedas[0]).x), xTras = Math.abs(W(ruedas[2]).x);
  const topeCubierta = hit(V(W(ruedas[0]).x, 3, zDel), V(0, -1, 0), ruedas[0]);
  const radio = topeCubierta.point.y / 2;

  // Borde del pasarruedas sobre la cubierta, del lado izquierdo: el punto más bajo de la chapa o del
  // guardabarros en la mitad exterior de la cubierta, en la vertical del eje (ahí apoya la cinta el gendarme;
  // el forro de plástico de adentro no cuenta)
  const chapa = m => /^(pintura|black_1_ext|black_ext)$/.test(m);
  function arco(rueda, z) {
    const cx = W(rueda).x, techo = hit(V(cx, 3, z), V(0, -1, 0), rueda).point.y;
    let mejor = null;
    for (let dx = -0.14; dx <= -0.06; dx += 0.005) {
      const h = hit(V(cx + dx, techo + 0.002, z), V(0, 1, 0), cuerpo, 0.5, chapa);
      if (h && (!mejor || h.point.y < mejor.y)) mejor = { y: h.point.y, x: cx + dx, m: mat(h) + '/' + h.object.name.slice(0, 24) };
    }
    window.__arco = (window.__arco || []).concat([mejor.m + ' dx ' + (mejor.x - cx).toFixed(3) + ' techo ' + techo.toFixed(3)]);
    return { yBorde: r3(mejor.y), x: r3(mejor.x), luzNominal: r3(mejor.y - techo) };
  }

  // Caja
  const pared = s => hit(V(0, 1.05, zTras + 0.6), V(s, 0, 0), cuerpo).point.x;
  const x0 = pared(-1), x1 = pared(1);
  const zMed = zTras + 0.75;                       // detrás del pasarruedas trasero, como mide un gendarme
  let yPiso = -1;
  for (let x = -0.35; x <= 0.35; x += 0.01) { const h = hit(V(x, 2, zMed), V(0, -1, 0), cuerpo); if (h) yPiso = Math.max(yPiso, h.point.y); }
  const z0 = hit(V(0, yPiso + 0.15, zTras), V(0, 0, -1), cuerpo).point.z, z1 = hit(V(0, yPiso + 0.15, zTras), V(0, 0, 1), cuerpo).point.z;
  // Lugar de la cinta de adentro: sobre una nervadura cerca de la pared izquierda, hacia el portón
  let xCinta = null, yNerv = -1;
  for (let x = x0 + 0.1; x <= x0 + 0.32; x += 0.004) {
    const h = hit(V(x, 2, z1 - 0.2), V(0, -1, 0), cuerpo);
    if (h && h.point.y < yPiso + 0.02 && h.point.y > yNerv + 0.0005) { yNerv = h.point.y; xCinta = x; }   // solo el piso, no el borde
  }
  // Borde superior: lo más alto de la pared (el canto redondeado), con rayos verticales sobre ella
  let borde = 0;
  for (let x = x0 - 0.1; x <= x0 + 0.08; x += 0.005) { const h = hit(V(x, 2, zMed), V(0, -1, 0), cuerpo); if (h) borde = Math.max(borde, h.point.y); }
  const techoPR = hit(V(x0 + 0.06, 2, zTras), V(0, -1, 0), cuerpo).point.y;
  // Por fuera se mide en el portón: del borde de abajo al de arriba. La pared lateral baja mucho más que
  // el piso (tapa el chasis), así que ahí la diferencia con la medida de adentro no diría nada.
  const porton = O('porton');
  const hPorton = y => hit(V(-0.3, y, 4), V(0, 0, -1), g);
  const enPorton = h => { let o = h && h.object; while (o && o !== porton) o = o.parent; return !!o; };
  let bordeInf = borde - 0.05, caraExt = hPorton(borde - 0.2).point.z, topePorton = borde;
  for (let y = borde - 0.05; y > 0.3; y -= 0.002) { const h = hPorton(y); if (!enPorton(h)) break; bordeInf = y; }
  for (let y = borde - 0.05; y < borde + 0.1; y += 0.002) { const h = hPorton(y); if (!enPorton(h)) break; topePorton = y; }

  // Larguero izquierdo detrás del eje (el chasis)
  // El chasis visible es acero negro (black_0) repartido en varias piezas: se mide la cara exterior del larguero
  // izquierdo con rayos que pasan por debajo de la pared de la caja
  const larguero = O('larguero'), acero = m => m === 'black_0';
  let lx = null, ly0 = null, ly1 = null;
  for (let y = 0.9; y > 0.3; y -= 0.004) {
    const h = hit(V(-1.5, y, zTras + 0.5), V(1, 0, 0), cuerpo, 10, acero);
    if (h && h.point.x < 0 && h.point.x > -0.7) { if (lx === null || h.point.x < lx) lx = h.point.x; ly1 = ly1 === null ? y : ly1; ly0 = y; }
  }
  const cajaLarg = new THREE.Box3().setFromObject(larguero);

  // Volante: plano por componentes principales de los vértices del aro
  const pts = [];
  O('volante').traverse(m => { if (m.isMesh && /STEERING_WHEEL/.test(m.name + (m.parent ? m.parent.name : ''))) {
    const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)); } });
  const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = p.clone().sub(c).toArray(); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  // Iteración de potencia sobre la inversa aproximada: el autovector de menor autovalor es la normal
  let nrm = new THREE.Vector3(0, 0.3, 1).normalize(); const M3 = new THREE.Matrix3().set(...C.flat()).invert();
  for (let k = 0; k < 60; k++) nrm.applyMatrix3(M3).normalize();
  if (nrm.z < 0) nrm.negate();                       // hacia el conductor (atrás)
  const radioVol = pts.reduce((s, p) => { const d = p.clone().sub(c); d.addScaledVector(nrm, -d.dot(nrm)); return s + d.length(); }, 0) / pts.length;


  // Asientos: almohadón y respaldo (rayos desde adentro de la cabina, por debajo del tapizado del techo)
  const techo = hit(V(0, 1.3, c.z + 0.4), V(0, 1, 0), cuerpo).point.y;
  const tapizado = m => /seat|leather/.test(m);
  function asiento(x) {
    const cojin = hit(V(x, techo - 0.05, c.z + 0.55), V(0, -1, 0), cuerpo, 10, tapizado).point.y;
    const resp = hit(V(x, cojin + 0.25, c.z), V(0, 0, 1), cuerpo, 10, tapizado).point.z;
    return [r3(x), r3(cojin + 0.1), r3(resp - 0.12)];
  }
  const asCond = asiento(c.x), asAcomp = asiento(-c.x);
  const respaldoDel = hit(V(c.x, asCond[1] + 0.15, c.z), V(0, 0, 1), cuerpo, 10, tapizado).point.z;
  const cojinTras = hit(V(0, techo - 0.05, respaldoDel + 0.45), V(0, -1, 0), cuerpo, 10, tapizado).point;

  // Parabrisas: el vidrio más bajo que se ve por encima del tablero, del lado del acompañante
  function vidrioBajo(x) {
    for (let y = 1.1; y < 1.6; y += 0.005) { const h = hit(V(x, y, c.z + 0.2), V(0, 0, -1), cuerpo, 2); if (h && /glass/i.test(mat(h))) return h; }
    return null;
  }
  const vAcomp = vidrioBajo(-c.x + 0.05), vCond = vidrioBajo(c.x - 0.12);
  const nVidrio = vAcomp.face.normal.clone().transformDirection(vAcomp.object.matrixWorld); if (nVidrio.z < 0) nVidrio.negate();
  const vidrioArriba = hit(V(0, techo - 0.1, c.z + 0.4), V(0, 0, -1), cuerpo, 2).point.z;
  const sobreTablero = (x, z) => { const h = hit(V(x, techo - 0.15, z), V(0, -1, 0), cuerpo, 10, m => !/glass/i.test(m)); return { punto: a3(h.point), normal: a3(h.face.normal.clone().transformDirection(h.object.matrixWorld)) }; };

  // Un lugar plano arriba del tablero: se avanza hasta encontrar una cara que mire hacia arriba
  function tableroPlano(x, z0) {
    for (let z = z0; z < z0 + 0.3; z += 0.01) {
      const h = hit(V(x, techo - 0.15, z), V(0, -1, 0), cuerpo, 10, m => !/glass/i.test(m));
      const n = h && h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (n && n.y > 0.85) return { punto: a3(h.point), normal: a3(n) };
    }
    return sobreTablero(x, z0);
  }
  const centro = n => { const b = new THREE.Box3().setFromObject(O(n)); return b.getCenter(new THREE.Vector3()); };
  const caja = new THREE.Box3().setFromObject(cuerpo);
  const placa = re => { let o = null; cuerpo.traverse(m => { if (m.isMesh && re.test(m.name)) o = m; }); return new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); };
  const ball = s => { const d = O('ballesta_' + s + '_del'), t = O('ballesta_' + s + '_tras'); const bd = new THREE.Box3().setFromObject(d), bt = new THREE.Box3().setFromObject(t); return { x: r3(W(d).x), zDel: r3(bd.min.z), zTras: r3(bt.max.z), yAncla: r3(W(d).y) }; };

  return {
    ejes: { del: r3(zDel), tras: r3(zTras) }, trocha: { del: r3(xDel), tras: r3(xTras) }, radioRueda: r3(radio),
    arco: { del: arco(ruedas[0], zDel), tras: arco(ruedas[2], zTras) },
    // yBordeInfExt y zExt: borde inferior y cara exterior del portón (donde se mide por fuera)
    caja: { yBordeSup: r3(borde), yBordeInfExt: r3(bordeInf), yTopePorton: r3(topePorton), yPiso: r3(yPiso), xCinta: r3(xCinta), yTechoPasarruedas: r3(techoPR), z0: r3(z0), z1: r3(z1), x0: r3(x0), x1: r3(x1), zExt: r3(caraExt), zMedida: r3(zMed) },
    larguero: { x: r3(lx), y0: r3(ly0), y1: r3(ly1), z0: r3(zTras + 0.3), z1: r3(cajaLarg.max.z) },
    limites: { x0: r3(caja.min.x), x1: r3(caja.max.x), z0: r3(caja.min.z), z1: r3(caja.max.z) },
    volante: { centro: a3(c), radio: r3(radioVol), normal: a3(nrm) },
    asiento: { conductor: asCond, acompanante: asAcomp, trasero: a3(cojinTras.clone().add(V(0, 0.1, 0))) },
    espejo: [0, r3(techo - 0.1), r3(vidrioArriba + 0.08)],
    espejoLateral: [r3(caja.min.x + 0.08), r3(vCond.point.y), r3(vCond.point.z + 0.05)],
    patente: { tras: { centro: a3(placa(/cover006/)), normal: [0, 0, 1] }, del: { centro: a3(placa(/cover005/)), normal: [0, 0, -1] } },
    parabrisas: { punto: a3(vAcomp.point.clone().add(V(0, 0.04, 0.01))), normal: a3(nVidrio) },
    tablero: { vin: sobreTablero(c.x - 0.12, vCond.point.z + 0.06), ticket: tableroPlano(0.3, vCond.point.z + 0.06) },
    escape: { centro: a3(centro('escape')) }, tanque: { centro: a3(centro('tanque')) },
    ballesta: { izq: ball('I'), der: ball('D') }
  };
};
window.listo = true;
`;
const PAGINA = `<!doctype html><html><body>
<script type="importmap">{ "imports": { "three": "/vendor/three/three.module.min.js", "three/addons/": "/vendor/three/addons/" } }</script>
<script type="module">${MEDIR}</script></body></html>`;

const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(PAGINA); }
  const file = u.startsWith('/vendor/') ? path.join(VENDOR, u.slice(8)) : u.startsWith('/build/') ? path.join(BUILD, u.slice(7)) : null;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', e => console.error('página:', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`);
await p.waitForFunction(() => window.listo, null, { timeout: 120000 });
const alta = await p.evaluate(() => window.medir('/build/hilux-alta.glb'));
const liviana = await p.evaluate(() => window.medir('/build/hilux-liviana.glb'));
await b.close(); srv.close();

// Lo que se mide con la cinta no puede cambiar entre niveles
const dif = (a, b) => Math.abs(a - b);
const control = [['luz delantera', alta.arco.del.luzNominal, liviana.arco.del.luzNominal], ['luz trasera', alta.arco.tras.luzNominal, liviana.arco.tras.luzNominal],
  ['borde de la caja', alta.caja.yBordeSup, liviana.caja.yBordeSup], ['piso de la caja', alta.caja.yPiso, liviana.caja.yPiso], ['borde inferior exterior', alta.caja.yBordeInfExt, liviana.caja.yBordeInfExt]];
let mal = false;
for (const [k, a, l] of control) { const d = dif(a, l); console.log(`${k}: alta ${a}, liviana ${l}${d > 0.005 ? '  ← DIFIERE' : ''}`); if (d > 0.005) mal = true; }

const js = `/* Medidas de la Hilux tomadas de la malla (generado por tools/assets/medir-hilux.mjs; no editar a mano).
 * Metros, coordenadas de la camioneta sin inclinar: mira hacia -z, el conductor en -x, el piso en y = 0
 * y el centro entre ejes en z = 0. Las usan caso.js, el motor (cinta, cabina, piezas agregadas) y las pruebas. */
(function (root) {
const VEHICULO_MEDIDAS = ${JSON.stringify(alta, null, 1)};
root.VEHICULO_MEDIDAS = VEHICULO_MEDIDAS;
if (typeof module !== 'undefined' && module.exports) module.exports = VEHICULO_MEDIDAS;
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(path.join(BUILD, 'hilux.medidas.js'), js);
console.log(JSON.stringify(alta));
if (mal) { console.error('las medidas difieren entre niveles más de 5 mm'); process.exitCode = 1; }
