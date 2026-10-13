/*
 * Objetos de Poly Haven (CC0) en GLB livianos: simplificados, texturas WebP y geometría comprimida (meshopt).
 * Salida en tools/.cache/build/objetos/ y la lista en tools/.cache/build/objetos.entradas.json.
 * Uso: node tools/assets/objetos.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt, flatten, join, getSceneVertexCount, VertexCountMethod } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { bajar } from './polyhaven.mjs';

const TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(TOOLS, '.cache', 'build', 'objetos');
fs.mkdirSync(OUT, { recursive: true });

// nombre: clave en el manifest; tri: triángulos máximos en alta (liviana usa la mitad)
const OBJETOS = [
  { nombre: 'cemento', id: 'cement_bag', tri: 2000 },
  { nombre: 'termo', id: 'plastic_thermos', tri: 3000 },
  { nombre: 'cigarrillos', id: 'cigarette_pack', tri: 1500 },
  { nombre: 'cajon', id: 'plastic_crate_01', tri: 5000 },
  { nombre: 'bidon', id: 'plastic_jerrycan', tri: 3000 },
  { nombre: 'caja', id: 'cardboard_box_01', tri: 2500 },
  { nombre: 'barrera', id: 'concrete_road_barrier', tri: 6000 }
];
const NIVELES = { alta: { tex: 1024 }, liviana: { tex: 512 } };

await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const triangulos = doc => {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices(), pos = p.getAttribute('POSITION');
    n += (idx ? idx.getCount() : pos.getCount()) / 3;
  }
  return Math.round(n);
};

const entradas = [];
for (const o of OBJETOS) {
  const fuente = await bajar(o.id, 'gltf', '1k', 'gltf');
  for (const [nivel, cfg] of Object.entries(NIVELES)) {
    const doc = await io.read(fuente);
    const meta = Math.round((nivel === 'alta' ? o.tri : o.tri / 2));
    const antes = triangulos(doc);
    await doc.transform(
      dedup(), flatten(), join(), weld(),
      ...(antes > meta ? [simplify({ simplifier: MeshoptSimplifier, ratio: meta / antes, error: 0.002, lockBorder: false })] : []),
      prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [cfg.tex, cfg.tex], quality: 82 }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' })
    );
    const file = path.join(OUT, `${o.nombre}-${nivel}.glb`);
    await io.write(file, doc);
    // Verificación: se vuelve a leer lo escrito (el disco de trabajo tuvo corrupción silenciosa)
    const check = await io.read(file);
    const despues = triangulos(check);
    entradas.push({ nivel, clave: `obj.${o.nombre}`, archivo: path.relative(TOOLS, file), fuente: 'polyhaven:' + o.id });
    console.log(`${o.nombre} ${nivel}: ${antes} → ${despues} triángulos, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }
}
fs.writeFileSync(path.join(TOOLS, '.cache', 'build', 'objetos.entradas.json'), JSON.stringify(entradas, null, 1));
