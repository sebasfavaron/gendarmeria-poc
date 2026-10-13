/*
 * Assets de la escena: cielo HDRI y texturas PBR de Poly Haven (CC0), en los dos niveles de calidad.
 * Deja los archivos en tools/.cache/build/escena/ y la lista en tools/.cache/build/escena.entradas.json;
 * después tools/assets/manifest.mjs los copia a src/next/assets/ con el hash en el nombre.
 *
 * Uso: node tools/assets/escena.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { bajar } from './polyhaven.mjs';

const TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(TOOLS, '.cache', 'build', 'escena');
fs.mkdirSync(OUT, { recursive: true });
const entradas = [];
const entrada = (nivel, clave, archivo, fuente, meta) => entradas.push({ nivel, clave, archivo: path.relative(TOOLS, archivo), fuente, meta });
const ambos = ['alta', 'liviana'];

/* ---------- Cielo ---------- */
// 19:50, ya puesto el sol: cielo de atardecer sin el disco del sol. Ver el spec para el criterio.
const CIELO = 'evening_road_01_puresky';
// Hacia dónde queda el resto de luz del atardecer: oeste-suroeste. En la escena el sur es -z
// (la camioneta va de Tartagal a Tucumán) y el oeste +x.
const OESTE_SUROESTE = new THREE.Vector3(0.92, 0, -0.38).normalize();

function leerHDR(file) {
  const loader = new HDRLoader();
  loader.setDataType(THREE.FloatType);
  const buf = fs.readFileSync(file);
  return loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
const srgb = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

async function cielo() {
  const luz = await bajar(CIELO, 'hdri', '1k', 'hdr');
  const grande = await bajar(CIELO, 'hdri', '4k', 'hdr');
  const dst = path.join(OUT, 'cielo-luz.hdr');
  fs.copyFileSync(luz, dst);
  ambos.forEach(n => entrada(n, 'cielo.luz', dst, 'polyhaven:' + CIELO));

  // Fondo visible: radiancia lineal escalada para que casi nada sature, guardada en sRGB de 8 bits.
  // El motor la vuelve a lineal y la multiplica por 1/escala, así fondo e iluminación son la misma luz.
  const h = leerHDR(grande), W = h.width, H = h.height, d = h.data;
  const lums = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lums[i] = lum(d, i * 4);
  const orden = Float32Array.from(lums).sort();
  const p = orden[Math.floor(orden.length * 0.997)];
  const escala = 1 / p;
  // Color del horizonte (para la niebla) y dirección del resplandor (para girar el cielo)
  const banda = [Math.floor(H * 0.47), Math.floor(H * 0.5)];
  const hor = [0, 0, 0]; let n = 0;
  const col = new Float32Array(W);
  for (let y = banda[0]; y < banda[1]; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; hor[0] += d[i]; hor[1] += d[i + 1]; hor[2] += d[i + 2]; n++; col[x] += lums[y * W + x];
  }
  let uMax = 0, best = -1;
  for (let x = 0; x < W; x++) {
    let s = 0; for (let k = -40; k <= 40; k++) s += col[(x + k + W) % W];
    if (s > best) { best = s; uMax = (x + 0.5) / W; }
  }
  // three.js: u = atan2(z, x) / 2π + 0.5. Giro alrededor de y que lleva el resplandor hacia el oeste-suroeste.
  const uDestino = Math.atan2(OESTE_SUROESTE.z, OESTE_SUROESTE.x) / (2 * Math.PI) + 0.5;
  const giro = (uMax - uDestino) * 2 * Math.PI;
  const meta = { escala, giro, horizonte: hor.map(v => v / n) };

  for (const [nivel, ancho] of [['alta', 4096], ['liviana', 2048]]) {
    const px = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) px[i * 3 + c] = Math.round(255 * srgb(Math.min(1, d[i * 4 + c] * escala)));
    // Las filas del .hdr van de arriba hacia abajo, igual que en un JPG
    const file = path.join(OUT, `cielo-fondo-${nivel}.jpg`);
    await sharp(px, { raw: { width: W, height: H, channels: 3 } })
      .resize(ancho, ancho / 2).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
    entrada(nivel, 'cielo.fondo', file, 'polyhaven:' + CIELO, meta);
  }
  console.log(`cielo ${CIELO}: escala ${escala.toFixed(3)}, giro ${(giro * 180 / Math.PI).toFixed(0)}°, horizonte ${meta.horizonte.map(v => v.toFixed(3)).join(' ')}`);
}

/* ---------- Texturas PBR ---------- */
// arm: oclusión (R), rugosidad (G) y metal (B), como los usa three.js
const TEXTURAS = [
  { nombre: 'asfalto', id: 'asphalt_02', alta: 2048, liviana: 1024 },
  { nombre: 'banquina', id: 'rocky_trail', alta: 1024, liviana: 512 },
  { nombre: 'monte', id: 'sparse_grass', alta: 1024, liviana: 512 },
  { nombre: 'revoque', id: 'painted_plaster_wall', alta: 1024, liviana: 512 },
  { nombre: 'chapa', id: 'corrugated_iron', alta: 1024, liviana: 512 }
];

async function texturas() {
  for (const t of TEXTURAS) {
    const fuentes = { color: await bajar(t.id, 'Diffuse', '2k', 'jpg'), normal: await bajar(t.id, 'nor_gl', '2k', 'jpg'), arm: await bajar(t.id, 'arm', '2k', 'jpg') };
    for (const nivel of ambos) {
      for (const [mapa, src] of Object.entries(fuentes)) {
        const file = path.join(OUT, `${t.nombre}-${mapa}-${nivel}.webp`);
        // Las normales a más de 1K casi no se notan con la textura repetida y pesan el doble
        const lado = mapa === 'normal' ? Math.min(t[nivel], 1024) : t[nivel];
        await sharp(src).resize(lado, lado).webp({ quality: mapa === 'normal' ? 88 : 80 }).toFile(file);
        entrada(nivel, `tex.${t.nombre}.${mapa}`, file, 'polyhaven:' + t.id);
      }
    }
    console.log(`textura ${t.nombre} (${t.id})`);
  }
}

await cielo();
await texturas();
fs.writeFileSync(path.join(TOOLS, '.cache', 'build', 'escena.entradas.json'), JSON.stringify(entradas, null, 1));
console.log(`escena: ${entradas.length} entradas`);
