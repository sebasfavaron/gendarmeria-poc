/*
 * La Hilux: "Toyota Hilux Revo Prerunner 2021", de Asadawut.Kaewma (CC-BY 4.0 declarada; ver CREDITOS.md).
 * Baja el modelo (espejo sin login de GitHub), lo prepara y arma los dos niveles:
 *   - borra la chapa plana que tapa la parte de abajo (Object037);
 *   - lo gira para que mire hacia -z con el piso en y = 0 y el centro entre ejes en z = 0;
 *   - pasa el interior a volante a la izquierda: espeja la cabina en x; las piezas con texto
 *     (instrumentos, pantallas, botones) solo se trasladan, para que se lean bien;
 *   - separa lo que no se inclina con la carrocería: ruedas, eje trasero y las ballestas (cada mitad
 *     con su pivote en el eje, así el motor las aplana cuando hay peso);
 *   - la pintura queda en un solo material "pintura", blanco y con laca.
 * Todas las transformaciones quedan horneadas en la geometría: los grupos solo tienen traslación.
 *
 * Salida: tools/.cache/build/hilux-alta.glb, hilux-liviana.glb. Las medidas las toma medir-hilux.mjs.
 * Uso: node tools/assets/hilux.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as THREE from 'three';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplifyPrimitive, textureCompress, meshopt, transformPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(TOOLS, '.cache', 'hilux');
const FUENTE = path.join(CACHE, 'src');
const BUILD = path.join(TOOLS, '.cache', 'build');
fs.mkdirSync(BUILD, { recursive: true });

/* ---------- Descarga (con control del sha1 de git de cada archivo) ---------- */
const REPO = 'Alive-hub/WebAR_AliveStudiosWebsite', CARPETA = 'src/toyota_hilux_revo_prerunner_2021';
const gitSha = buf => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
async function listar(dir) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${dir}`, { headers: { 'User-Agent': 'gendarmeria-poc' } });
  if (!r.ok) throw new Error('GitHub: ' + r.status);
  const out = [];
  for (const e of await r.json()) out.push(...(e.type === 'dir' ? await listar(e.path) : [e]));
  return out;
}
async function bajarFuente() {
  if (fs.existsSync(path.join(FUENTE, 'scene.gltf')) && fs.existsSync(path.join(FUENTE, 'verificado'))) return;
  for (const e of await listar(CARPETA)) {
    const dst = path.join(FUENTE, path.relative(CARPETA, e.path));
    if (fs.existsSync(dst) && gitSha(fs.readFileSync(dst)) === e.sha) continue;
    const r = await fetch(e.download_url); const buf = Buffer.from(await r.arrayBuffer());
    if (gitSha(buf) !== e.sha) throw new Error('descarga inválida: ' + e.path);
    fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, buf);
    if (gitSha(fs.readFileSync(dst)) !== e.sha) throw new Error('quedó dañado en disco: ' + e.path);
  }
  fs.writeFileSync(path.join(FUENTE, 'verificado'), new Date().toISOString());
}

/* ---------- Clasificación de las piezas ---------- */
const INTERIOR = /(_int$|_int_|^int_|black_int_2|seat_leather|seatbelt|velvet_roof|velvet_ground|plastic_roof|^ind_|Android_Auto|Material_349|glass_dashboard|^material$)/;
const CON_TEXTO = /^(ind_decal|ind_screen|ind_1|Android_Auto|Material_349)$/;
// Ruedas: en el modelo original R es x < 0 (el lado derecho mirando hacia +z). Ya girado, la derecha es +x.
const RUEDAS = { WHEEL_LF: 'rueda_DI', WHEEL_RF: 'rueda_DD', WHEEL_LR: 'rueda_TI', WHEEL_RR: 'rueda_TD' };
const BALLESTAS = { leaf_lr_1: 'ballesta_I', leaf_lr_2: 'ballesta_I', leaf_rr_1: 'ballesta_D', leaf_rr_2: 'ballesta_D' };
const NOMBRADOS = { Exhaust_pipe: 'escape', Exhaust_pipe_mount: 'escape', Gasoline_tank: 'tanque', Gasoline_tank_mount: 'tanque',
  STEER_HR: 'volante', HILUX_EX_HI_MT_BOOT_DOOR_MESH: 'porton', Chassis_group: 'larguero' };

function ancestros(n) { const a = []; for (let p = n; p; p = p.getParentNode()) a.push(p.getName()); return a; }

function preparar(doc) {
  const root = doc.getRoot(), escena = root.listScenes()[0];
  // Fuera la chapa de abajo
  for (const n of root.listNodes()) if (n.getName() === 'Object037') { const borrar = []; n.traverse(c => borrar.push(c)); borrar.reverse().forEach(c => c.dispose()); }

  const piezas = [];
  for (const n of root.listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    const anc = ancestros(n);
    const mat = mesh.listPrimitives()[0].getMaterial(), matName = mat ? mat.getName() : '';
    let grupo = 'cuerpo';
    for (const a of anc) { if (RUEDAS[a]) { grupo = RUEDAS[a]; break; } if (BALLESTAS[a]) { grupo = BALLESTAS[a] + (/_1$/.test(a) ? '_del' : '_tras'); break; } if (a === 'REAR_AXLE') { grupo = 'eje_trasero'; break; } }
    const nombrado = anc.map(a => NOMBRADOS[a]).find(Boolean) || null;
    const b = getBounds(n), centro = b.min.map((v, i) => (v + b.max[i]) / 2);
    const cabina = Math.abs(centro[0]) < 0.82 && centro[1] > 0.45 && centro[1] < 1.85 && centro[2] > -1.15 && centro[2] < 1.15;
    piezas.push({ n, mesh, matName, grupo, nombrado, mundo: new THREE.Matrix4().fromArray(n.getWorldMatrix()), centro,
      interior: grupo === 'cuerpo' && cabina && INTERIOR.test(matName), texto: CON_TEXTO.test(matName) });
  }

  // Giro (mira hacia -z) y ubicación: piso en y = 0 y centro entre ejes en z = 0
  const rot = new THREE.Matrix4().makeRotationY(Math.PI);
  let piso = Infinity; const zRuedas = {};
  for (const p of piezas) if (p.grupo.startsWith('rueda_')) {
    const b = getBounds(p.n); piso = Math.min(piso, b.min[1]);
    const z = -(b.min[2] + b.max[2]) / 2; (zRuedas[p.grupo] = zRuedas[p.grupo] || []).push(z);
  }
  const zDel = avg([...zRuedas.rueda_DI, ...zRuedas.rueda_DD]), zTras = avg([...zRuedas.rueda_TI, ...zRuedas.rueda_TD]);
  const G = new THREE.Matrix4().makeTranslation(0, -piso, -(zDel + zTras) / 2).multiply(rot);
  const espejo = new THREE.Matrix4().makeScale(-1, 1, 1);

  // Hornea la transformación final de cada pieza en su geometría (copias propias de los datos)
  const usados = new Map();
  for (const p of piezas) {
    let M = G.clone().multiply(p.mundo);
    if (p.interior) {
      if (p.texto) {   // con texto: solo se traslada a la posición espejada, sin espejar
        const c = new THREE.Vector3().fromArray(p.centro).applyMatrix4(G);
        M = new THREE.Matrix4().makeTranslation(-2 * c.x, 0, 0).multiply(M);
      } else M = espejo.clone().multiply(M);
    }
    if (usados.has(p.mesh)) { p.mesh = p.mesh.clone(); p.n.setMesh(p.mesh); }
    usados.set(p.mesh, true);
    for (const prim of p.mesh.listPrimitives()) {
      for (const sem of prim.listSemantics()) prim.setAttribute(sem, prim.getAttribute(sem).clone());
      if (prim.getIndices()) prim.setIndices(prim.getIndices().clone());
      transformPrimitive(prim, M.toArray());
    }
    p.final = M;
  }

  // Estructura nueva: grupos con solo traslación (pivotes de ruedas y ballestas)
  const hilux = doc.createNode('hilux'), grupos = {};
  const grupo = (nombre, padre, pos) => {
    if (grupos[nombre]) return grupos[nombre];
    const g = doc.createNode(nombre).setTranslation(pos || [0, 0, 0]); (padre || hilux).addChild(g); grupos[nombre] = g; return g;
  };
  const cuerpo = grupo('cuerpo');
  const cajaDe = lista => { const b = new THREE.Box3(); lista.forEach(p => { const bb = getBounds(p.n); b.expandByPoint(new THREE.Vector3().fromArray(bb.min)); b.expandByPoint(new THREE.Vector3().fromArray(bb.max)); }); return b; };
  // Las piezas ya están en coordenadas finales con la matriz del nodo; se pasan a identidad
  for (const p of piezas) { p.n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]); const pa = p.n.getParentNode(); if (pa) pa.removeChild(p.n); for (const c of p.n.listChildren()) p.n.removeChild(c); }
  const porGrupo = {}; piezas.forEach(p => (porGrupo[p.grupo] = porGrupo[p.grupo] || []).push(p));
  for (const [nombre, lista] of Object.entries(porGrupo)) {
    let pivote = [0, 0, 0], padre = hilux;
    const b = cajaDe(lista);
    if (nombre.startsWith('rueda_') || nombre === 'eje_trasero') pivote = b.getCenter(new THREE.Vector3()).toArray();
    if (nombre.startsWith('ballesta_')) {
      // Pivote en el extremo de la mitad que está sobre el eje trasero
      const zEje = (zTras - zDel) / 2, c = b.getCenter(new THREE.Vector3());
      pivote = [c.x, c.y, Math.abs(b.min.z - zEje) < Math.abs(b.max.z - zEje) ? b.min.z : b.max.z];
    }
    const g = nombre === 'cuerpo' ? cuerpo : grupo(nombre, padre, pivote);
    for (const p of lista) {
      if (pivote.some(v => v)) for (const prim of p.mesh.listPrimitives()) transformPrimitive(prim, new THREE.Matrix4().makeTranslation(-pivote[0], -pivote[1], -pivote[2]).toArray());
      const destino = p.nombrado && nombre === 'cuerpo' ? grupo(p.nombrado, cuerpo) : g;
      destino.addChild(p.n);
    }
  }
  // La escena queda solo con la Hilux nueva
  for (const n of escena.listChildren()) escena.removeChild(n);
  escena.addChild(hilux);

  // Pintura: un solo material, blanco con laca
  const pintura = root.listMaterials().find(m => m.getName() === 'carpaint');
  // Se conservan sus mapas (oclusión y rugosidad horneadas): solo cambia el color
  pintura.setName('pintura').setBaseColorFactor([0.78, 0.79, 0.78, 1]).setMetallicFactor(0.05);
  if (!pintura.getExtension('KHR_materials_clearcoat')) {
    const cc = doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.05);
    pintura.setExtension('KHR_materials_clearcoat', cc);
  }
  return { zDel, zTras };
}
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;

/* ---------- Niveles ---------- */
// Lo que define las medidas (carrocería y caja en "pintura", guardabarros y pasarruedas en black_*ext, la
// banda de rodamiento de las cubiertas) se
// simplifica con poco error; el resto, bastante. Los bordes no se traban: las piezas sueltas lo necesitan.
const NIVELES = {
  alta:    { tex: 2048, ratios: { pintura: 0.6, black_1_ext: 0.45, black_ext: 0.45 }, ruedas: 0.45, resto: 0.2,  errores: [0.0004, 0.006], maxTri: 450000 },
  liviana: { tex: 1024, ratios: { pintura: 0.45, black_1_ext: 0.3, black_ext: 0.25 }, ruedas: 0.3, resto: 0.04, errores: [0.0005, 0.03], maxTri: 240000 }   // la carrocería, los guardabarros y las ruedas se cuidan: ahí se mide
};
const triangulos = doc => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

async function nivel(io, preparada, nombre, cfg) {
  const doc = await io.readBinary(preparada);
  await doc.transform(dedup(), weld());
  // Las ruedas enteras (la cinta apoya en la banda de rodamiento) y lo que se revisa abajo con la linterna
  // (largueros, ballestas, eje, escape, tanque): si se deforman, la soldadura y las ballestas no se leen
  const enRueda = new Set();
  for (const n of doc.getRoot().listNodes()) if (/^(rueda_|larguero$|ballesta_|eje_trasero$|escape$|tanque$)/.test(n.getName())) n.traverse(c => { if (c.getMesh()) enRueda.add(c.getMesh()); });
  for (const m of doc.getRoot().listMeshes()) for (const prim of m.listPrimitives()) {
    const mat = prim.getMaterial() ? prim.getMaterial().getName() : '';
    const medida = cfg.ratios[mat] !== undefined || enRueda.has(m);
    const ratio = enRueda.has(m) ? cfg.ruedas : medida ? cfg.ratios[mat] : cfg.resto;
    if (prim.getIndices()) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: cfg.errores[medida ? 0 : 1], lockBorder: false });
  }
  await doc.transform(prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [cfg.tex, cfg.tex], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const file = path.join(BUILD, `hilux-${nombre}.glb`);
  await io.write(file, doc);
  const check = await io.read(file);   // verificación de lo escrito
  const tri = Math.round(triangulos(check));
  console.log(`hilux ${nombre}: ${tri} triángulos, ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
  if (tri > cfg.maxTri) console.warn(`  supera el máximo de ${cfg.maxTri}`);
}

await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await bajarFuente();
const doc = await io.read(path.join(FUENTE, 'scene.gltf'));
const ejes = preparar(doc);
await doc.transform(prune());
const preparada = await io.writeBinary(doc);
fs.writeFileSync(path.join(CACHE, 'preparada.glb'), preparada);
console.log(`preparada: ${Math.round(triangulos(doc))} triángulos; ejes en z ${(-(ejes.zTras - ejes.zDel) / 2).toFixed(3)} y ${((ejes.zTras - ejes.zDel) / 2).toFixed(3)}`);
for (const [nombre, cfg] of Object.entries(NIVELES)) await nivel(io, preparada, nombre, cfg);
