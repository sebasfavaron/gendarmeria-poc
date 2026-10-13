#!/usr/bin/env node
// Personas de Microsoft Rocketbox (MIT) para el motor: conductor (2 niveles), compañero y dos animaciones.
// Uso: node tools/assets/rocketbox.mjs [--forzar] [--sin-renders]
//   1. baja de GitHub lo que falte a tools/.cache/rocketbox/ (controla el hash de git de cada archivo);
//   2. Blender sin interfaz (rocketbox_prep.py): FBX -> GLB intermedio;
//   3. texturas (TGA -> WebP, especular -> rugosidad, recoloreo) y glTF Transform (meshopt, poda);
//   4. escribe en tools/.cache/build/ los GLB, conductor-huesos.txt, rocketbox-creditos.md y renders de control.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { prune, dedup, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(TOOLS, '.cache/rocketbox');
const TMP = path.join(CACHE, 'tmp');
const BUILD = path.join(TOOLS, '.cache/build');
const BLENDER = path.join(TOOLS, 'assets/blender.sh');
const PREP = path.join(TOOLS, 'assets/rocketbox_prep.py');
const REPO = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/';
const FORZAR = process.argv.includes('--forzar');
const RENDERS = !process.argv.includes('--sin-renders');

const AV = 'Assets/Avatars/Professions/';
const ANIM = 'Assets/Animations/all_animations_max_motextr_static/';
const CLIP_ESPERA = 'm_idle_neutral_01';
const CLIP_SENTADO = 'm_sit_chair_breathe_01';

// Hash de git (sha1 de "blob <tamaño>\0<contenido>") de cada archivo que usamos, tomado del árbol del repo.
const FUENTES = {
  'LICENSE.md': '9bcfb3ece5301a55d3a41bbd00a029ab27d61d13',
  [AV + 'Wood_Male_01/Export/Wood_Male_01_facial.fbx']: '9cc5b0b244237deaee221e292d391dc29deae9cf',
  [AV + 'Wood_Male_01/Textures/m110_head_color.tga']: '6e878ffd5c130f72692e7173de09c1f60cfffb98',
  [AV + 'Wood_Male_01/Textures/m110_head_normal.tga']: '9592499b18ab92e46cc7f35841d662dcb324bc08',
  [AV + 'Wood_Male_01/Textures/m110_head_specular.tga']: '057df0fab6e4f07432b95a109ed140be2b82d128',
  [AV + 'Wood_Male_01/Textures/m110_body_color.tga']: '0af41e390f173cdf145acb21a84d49e78449f389',
  [AV + 'Wood_Male_01/Textures/m110_body_normal.tga']: '73cce53e173f705fd09b76c2d09627d3d8359e6e',
  [AV + 'Wood_Male_01/Textures/m110_body_specular.tga']: 'cb4b6927439276a991bcda6cac932636f2ad09c5',
  [AV + 'Construction_Male_08/Export/Construction_Male_08.fbx']: '69682d9d4fe4a9c76c73748327975ef61f7ff4b8',
  [AV + 'Construction_Male_08/Textures/m108_head_color.tga']: 'd792a53251663a7ac4c9091a214fca7ea3a23954',
  [AV + 'Construction_Male_08/Textures/m108_head_normal.tga']: '455a404db80115389b2f57e0f1972d69d98d9e5d',
  [AV + 'Construction_Male_08/Textures/m108_head_specular.tga']: '9f4ad22572a1ffca3c95a2db685baf2044939b53',
  [AV + 'Construction_Male_08/Textures/m108_body_color.tga']: '50d49e1d549ba369d1a69964b584b7d1c83248f3',
  [AV + 'Construction_Male_08/Textures/m108_body_normal.tga']: 'd3e15ba111891084bf97dad9ce2ca7849b969d55',
  [AV + 'Construction_Male_08/Textures/m108_body_specular.tga']: 'ba42009a9b295e9b31c4be8ed17e23b475932c22',
  [AV + 'Construction_Male_08/Textures/m108_helmet_color.tga']: '3f51f17cc0b7f783993b132463a17391fecd04e2',
  [AV + 'Construction_Male_08/Textures/m108_helmet_normal.tga']: 'e6fbf3bca4bdfac0bca8ed36763022018e139461',
  [AV + 'Construction_Male_08/Textures/m108_helmet_specular.tga']: '554bf36dde5117ec1d1c46913366e3ea25dee7d3',
  [ANIM + 'm_idle_neutral_01.max.fbx']: 'a2d92c3326a9c503af677c9fa6082387f060d6c4',
  [ANIM + 'm_sit_chair_breathe_01.max.fbx']: '791c2dd6b07d1d9b871d454d9868cff6d233624d',
};

// Formas ARKit y visemas de Rocketbox que quedan, con el nombre que usa el motor.
const FORMAS = {
  eyeBlinkLeft: 'AK_09_EyeBlinkLeft', eyeBlinkRight: 'AK_10_EyeBlinkRight',
  eyeSquintLeft: 'AK_19_EyeSquintLeft', eyeSquintRight: 'AK_20_EyeSquintRight',
  browInnerUp: 'AK_03_BrowInnerUp', browDownLeft: 'AK_01_BrowDownLeft', browDownRight: 'AK_02_BrowDownRight',
  jawOpen: 'AK_25_JawOpen', mouthClose: 'AK_27_MouthClose',
  mouthPressLeft: 'AK_36_MouthPressLeft', mouthPressRight: 'AK_37_MouthPressRight',
  mouthSmileLeft: 'AK_44_MouthSmileLeft', mouthSmileRight: 'AK_45_MouthSmileRight',
  mouthFrownLeft: 'AK_30_MouthFrownLeft', mouthFrownRight: 'AK_31_MouthFrownRight',
  viseme_aa: 'AA_VI_10_aa', viseme_O: 'AA_VI_13_O', viseme_E: 'AA_VI_11_E', viseme_PP: 'AA_VI_01_PP',
};

const OLIVA = [0x50, 0x5a, 0x3a]; // verde oliva de Gendarmería (sRGB)

const CONDUCTOR = {
  nombre: 'conductor',
  fbx: AV + 'Wood_Male_01/Export/Wood_Male_01_facial.fbx',
  partes: { m110_head: 'cabeza', m110_body: 'cuerpo' },
  texturas: { cabeza: AV + 'Wood_Male_01/Textures/m110_head', cuerpo: AV + 'Wood_Male_01/Textures/m110_body' },
  formas: FORMAS,
  formas_en: 'cabeza',
  niveles: {
    'conductor-alta': { tam: { cabeza: 2048, cuerpo: 2048 }, max: 3e6 },
    'conductor-liviana': { tam: { cabeza: 1024, cuerpo: 1024 }, max: 2e6 },
  },
};
const COMPANERO = {
  nombre: 'companero',
  fbx: AV + 'Construction_Male_08/Export/Construction_Male_08.fbx',
  partes: { m108_head: 'cabeza', m108_body: 'cuerpo', m108_helmet: 'casco' },
  texturas: {
    cabeza: AV + 'Construction_Male_08/Textures/m108_head',
    cuerpo: AV + 'Construction_Male_08/Textures/m108_body',
    casco: AV + 'Construction_Male_08/Textures/m108_helmet',
  },
  recolor: { cuerpo: 'azul', casco: 'blanco' },
  niveles: { companero: { tam: { cabeza: 1024, cuerpo: 1024, casco: 1024 }, max: 1.2e6 } },
};
const CLIPS = [
  { nombre: 'espera', fuente: CLIP_ESPERA, max: 1e6 },
  { nombre: 'sentado', fuente: CLIP_SENTADO, max: 1.5e6 },
];

const log = (...a) => console.log('[rocketbox]', ...a);
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const blobSha1 = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

// ---------- 1. Descarga ----------

async function bajarFuentes() {
  for (const [ruta, sha] of Object.entries(FUENTES)) {
    const destino = path.join(CACHE, ruta);
    if (fs.existsSync(destino) && blobSha1(fs.readFileSync(destino)) === sha) continue;
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    let ok = false;
    for (let intento = 1; intento <= 3 && !ok; intento++) {
      log('bajando', ruta, intento > 1 ? `(intento ${intento})` : '');
      const r = await fetch(REPO + ruta.split('/').map(encodeURIComponent).join('/'));
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${ruta}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (blobSha1(buf) !== sha) { log('  hash distinto, reintento'); continue; }
      fs.writeFileSync(destino + '.parcial', buf);
      fs.renameSync(destino + '.parcial', destino);
      ok = blobSha1(fs.readFileSync(destino)) === sha; // relee: el disco puede fallar
    }
    if (!ok) throw new Error('no se pudo bajar bien ' + ruta);
  }
  log('fuentes controladas:', Object.keys(FUENTES).length);
}

// ---------- 2. Blender ----------

function blender(nombre, cfg, entradas) {
  const salida = path.join(TMP, nombre + '.glb');
  const cfgRuta = path.join(TMP, nombre + '.json');
  const cfgTexto = JSON.stringify({ ...cfg, salida }, null, 1);
  const vigente = !FORZAR && fs.existsSync(salida) && fs.existsSync(cfgRuta) &&
    fs.readFileSync(cfgRuta, 'utf8') === cfgTexto &&
    [PREP, ...entradas].every((e) => fs.statSync(e).mtimeMs < fs.statSync(salida).mtimeMs);
  if (vigente) return salida;
  fs.writeFileSync(cfgRuta, cfgTexto);
  log('blender:', nombre);
  const r = spawnSync(BLENDER, ['-b', '--python', PREP, '--', cfgRuta], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const texto = (r.stdout || '') + (r.stderr || '');
  const util = texto.split('\n').filter((l) => /^(FORMAS|DELTA|OJOS|PARTE|CAJA|CLIP|PELVIS_INICIO|LISTO)|Error|Traceback/.test(l));
  util.forEach((l) => console.log('   ', l));
  if (r.status !== 0 || !texto.includes('LISTO ' + salida)) {
    console.error(texto.slice(-4000));
    throw new Error('falló Blender en ' + nombre);
  }
  return salida;
}

// ---------- 3. Texturas ----------

function leerTGA(buf) {
  const idLen = buf[0], tipo = buf[2], w = buf.readUInt16LE(12), h = buf.readUInt16LE(14), bpp = buf[16], desc = buf[17];
  if (buf[1] !== 0 || ![2, 10].includes(tipo) || ![24, 32].includes(bpp) || desc & 0x10) throw new Error('TGA no soportado');
  const b = bpp / 8, n = w * h;
  let src;
  let p = 18 + idLen;
  if (tipo === 2) src = buf.subarray(p, p + n * b);
  else {
    src = Buffer.alloc(n * b);
    for (let i = 0; i < n;) {
      const c = buf[p++], k = (c & 0x7f) + 1;
      if (c & 0x80) { for (let j = 0; j < k; j++, i++) buf.copy(src, i * b, p, p + b); p += b; }
      else { buf.copy(src, i * b, p, p + k * b); p += k * b; i += k; }
    }
  }
  const arriba = (desc & 0x20) !== 0;
  const px = new Uint8Array(n * 3);
  for (let y = 0; y < h; y++) {
    const sy = arriba ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = (sy * w + x) * b, d = (y * w + x) * 3;
      px[d] = src[s + 2]; px[d + 1] = src[s + 1]; px[d + 2] = src[s];
    }
  }
  return { w, h, px };
}

const sat01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}
// Peso 0..1 de un tono dentro de [a, b] grados, con rampa de `r` grados a cada lado.
function pesoTono(h, a, b, r) {
  if (h > b + r + 30) h -= 360; // tonos rojos cerca de 360 cuentan como negativos
  return sat01((h - (a - r)) / r) * sat01((b + r - h) / r);
}

// Texeles vacíos entre islas UV: negro puro en color y normal plana.
function mascaraVacia(color, normal) {
  const n = color.w * color.h, m = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = color.px, q = normal.px, j = i * 3;
    m[i] = c[j] + c[j + 1] + c[j + 2] === 0 && Math.abs(q[j] - 128) <= 3 && Math.abs(q[j + 1] - 128) <= 3 && q[j + 2] >= 250 ? 1 : 0;
  }
  return m;
}

// Rellena los texeles vacíos con el promedio de lo cercano (pirámide "push-pull"), para que no sangre negro en las costuras.
function rellenar(px, w, h, ch, vacio) {
  const niveles = [];
  let c = new Float32Array(w * h * ch), m = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { m[i] = vacio[i] ? 0 : 1; for (let k = 0; k < ch; k++) c[i * ch + k] = px[i * ch + k]; }
  niveles.push({ w, h, c, m });
  while (niveles.at(-1).w > 1 || niveles.at(-1).h > 1) {
    const a = niveles.at(-1), nw = Math.max(1, a.w >> 1), nh = Math.max(1, a.h >> 1);
    const nc = new Float32Array(nw * nh * ch), nm = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let s = 0; const acc = new Float32Array(ch);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = Math.min(a.w - 1, x * 2 + dx), sy = Math.min(a.h - 1, y * 2 + dy), i = sy * a.w + sx;
        if (a.m[i]) { s++; for (let k = 0; k < ch; k++) acc[k] += a.c[i * ch + k]; }
      }
      const o = y * nw + x;
      if (s) { nm[o] = 1; for (let k = 0; k < ch; k++) nc[o * ch + k] = acc[k] / s; }
    }
    niveles.push({ w: nw, h: nh, c: nc, m: nm });
  }
  for (let l = niveles.length - 2; l >= 0; l--) {
    const a = niveles[l], g = niveles[l + 1];
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const i = y * a.w + x;
      if (a.m[i]) continue;
      // bilineal sobre el nivel más grueso (ya completo)
      const fx = Math.min(g.w - 1, Math.max(0, (x + 0.5) * g.w / a.w - 0.5)), fy = Math.min(g.h - 1, Math.max(0, (y + 0.5) * g.h / a.h - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(g.w - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      for (let k = 0; k < ch; k++) {
        const v = (g.c[(y0 * g.w + x0) * ch + k] * (1 - tx) + g.c[(y0 * g.w + x1) * ch + k] * tx) * (1 - ty) +
          (g.c[(y1 * g.w + x0) * ch + k] * (1 - tx) + g.c[(y1 * g.w + x1) * ch + k] * tx) * ty;
        a.c[i * ch + k] = v;
      }
      a.m[i] = 1;
    }
  }
  const c0 = niveles[0].c;
  for (let i = 0; i < w * h; i++) if (vacio[i]) for (let k = 0; k < ch; k++) px[i * ch + k] = Math.round(c0[i * ch + k]);
}

// Máscara 0..1 de los triángulos UV dados (coordenadas de imagen 0..1), ensanchada `borde` texeles.
function mascaraTriangulos(tris, w, h, borde) {
  const m = new Uint8Array(w * h);
  for (const t of tris) {
    const p = t.map(([u, v]) => [u * w, v * h]);
    const x0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q[0]))) - 1), x1 = Math.min(w - 1, Math.ceil(Math.max(...p.map((q) => q[0]))) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q[1]))) - 1), y1 = Math.min(h - 1, Math.ceil(Math.max(...p.map((q) => q[1]))) + 1);
    const ar = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]);
    if (Math.abs(ar) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const a = ((p[1][0] - px) * (p[2][1] - py) - (p[2][0] - px) * (p[1][1] - py)) / ar;
      const b = ((p[2][0] - px) * (p[0][1] - py) - (p[0][0] - px) * (p[2][1] - py)) / ar;
      if (a >= -1e-6 && b >= -1e-6 && a + b <= 1 + 1e-6) m[y * w + x] = 1;
    }
  }
  // ensanchar
  for (let it = 0; it < borde; it++) {
    const c = m.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!c[i] && (c[i - 1] || c[i + 1] || c[i - w] || c[i + w])) m[i] = 1;
    }
  }
  const f = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) f[i] = m[i];
  return f;
}

// Especular de Rocketbox -> rugosidad. La piel (tono anaranjado y saturado) queda en 0,4-0,65,
// la tela en 0,8-0,9; el especular aporta poros y costuras. Los ojos quedan brillantes.
function rugosidad(color, spec, ojos) {
  const n = color.w * color.h, r = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = i * 3, [h, s, v] = hsv(color.px[j] / 255, color.px[j + 1] / 255, color.px[j + 2] / 255);
    const piel = pesoTono(h, -10, 42, 6) * sat01((s - 0.33) / 0.1) * sat01((v - 0.1) / 0.06);
    const e = spec.px[j] / 255;
    const rp = Math.min(0.66, Math.max(0.38, 0.6 - 1.3 * e));
    const rt = Math.min(0.92, Math.max(0.45, 0.9 - 1.2 * e));
    let x = rt + (rp - rt) * piel;
    if (ojos) x += (0.1 - x) * ojos[i];
    r[j] = r[j + 1] = r[j + 2] = Math.round(x * 255);
  }
  return r;
}

function mediana(vals) {
  if (!vals.length) return 1;
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1];
}

// Recoloreo que conserva el detalle: cada texel elegido toma el tono oliva escalado por su brillo
// relativo al brillo típico de la zona (pliegues, costuras y sombras quedan).
function recolorear(color, modo) {
  const n = color.w * color.h, px = color.px, peso = new Float32Array(n), brillo = new Float32Array(n), ref = [];
  for (let i = 0; i < n; i++) {
    const j = i * 3, [h, s, v] = hsv(px[j] / 255, px[j + 1] / 255, px[j + 2] / 255);
    let w;
    if (modo === 'azul') w = pesoTono(h, 195, 255, 12) * sat01((s - 0.2) / 0.12) * sat01((v - 0.05) / 0.05);
    else w = sat01((v - 0.25) / 0.15) * sat01((0.3 - s) / 0.1); // casco blanco
    peso[i] = w; brillo[i] = v;
    if (w > 0.95 && (i & 7) === 0) ref.push(v);
  }
  const vref = mediana(ref);
  for (let i = 0; i < n; i++) {
    const w = peso[i];
    if (w <= 0) continue;
    const k = brillo[i] / vref, j = i * 3;
    for (let c = 0; c < 3; c++) px[j + c] = Math.round(px[j + c] * (1 - w) + Math.min(255, OLIVA[c] * k) * w);
  }
  return { vref, cubierto: peso.reduce((a, b) => a + (b > 0.5), 0) / n };
}

async function webp(px, w, h, ancho, calidad) {
  const alto = Math.round((ancho * h) / w);
  return sharp(Buffer.from(px.buffer, px.byteOffset, px.byteLength), { raw: { width: w, height: h, channels: 3 } })
    .resize(ancho, alto, { kernel: 'lanczos3' })
    .webp({ quality: calidad, effort: 6, smartSubsample: true })
    .toBuffer();
}

// Prepara color, normal y rugosidad de cada parte a resolución original (cacheado en memoria por avatar).
function prepararTexturas(def, uv) {
  const out = {};
  for (const [parte, base] of Object.entries(def.texturas)) {
    const color = leerTGA(fs.readFileSync(path.join(CACHE, base + '_color.tga')));
    const normal = leerTGA(fs.readFileSync(path.join(CACHE, base + '_normal.tga')));
    const spec = leerTGA(fs.readFileSync(path.join(CACHE, base + '_specular.tga')));
    const vacio = mascaraVacia(color, normal);
    if (def.recolor?.[parte]) {
      const r = recolorear(color, def.recolor[parte]);
      log(`  recoloreo ${parte} (${def.recolor[parte]}): ${(r.cubierto * 100).toFixed(1)}% de los texeles, brillo de referencia ${r.vref.toFixed(2)}`);
    }
    const ojos = uv.ojos?.[parte] ? mascaraTriangulos(uv.ojos[parte], color.w, color.h, 3) : null;
    const rug = rugosidad(color, spec, ojos);
    rellenar(color.px, color.w, color.h, 3, vacio);
    rellenar(rug, color.w, color.h, 3, vacio);
    out[parte] = { w: color.w, h: color.h, color: color.px, normal: normal.px, rug };
  }
  return out;
}

// ---------- 4. glTF Transform ----------

let io;
async function abrirIO() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

async function escribir(doc, archivo, max) {
  const buf = Buffer.from(await io.writeBinary(doc));
  const destino = path.join(BUILD, archivo);
  fs.writeFileSync(destino + '.parcial', buf);
  fs.renameSync(destino + '.parcial', destino);
  const leido = fs.readFileSync(destino);
  if (sha256(leido) !== sha256(buf)) throw new Error('el archivo escrito no coincide: ' + archivo);
  await io.readBinary(new Uint8Array(leido)); // se puede volver a abrir
  log(`${archivo}: ${kb(buf.length)}${buf.length > max ? '  ¡PASA EL LÍMITE de ' + kb(max) + '!' : ''}`);
  return { archivo, bytes: buf.length, sha256: sha256(buf), max };
}

async function armarAvatar(def, intermedio, tex) {
  const res = [];
  for (const [archivo, nivel] of Object.entries(def.niveles)) {
    const doc = await io.read(intermedio);
    const root = doc.getRoot();
    doc.createExtension(EXTTextureWebP).setRequired(true);
    root.listTextures().forEach((t) => t.dispose());
    for (const mat of root.listMaterials()) {
      const parte = mat.getName(), t = tex[parte], ancho = nivel.tam[parte];
      const crear = async (tipo, px, calidad) =>
        doc.createTexture(`${parte}_${tipo}`).setMimeType('image/webp').setImage(await webp(px, t.w, t.h, ancho, calidad));
      mat.setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(await crear('color', t.color, 84));
      mat.setNormalTexture(await crear('normal', t.normal, 82)).setNormalScale(1);
      mat.setMetallicRoughnessTexture(await crear('rugosidad', t.rug, 80)).setMetallicFactor(0).setRoughnessFactor(1);
      mat.setDoubleSided(false).setAlphaMode('OPAQUE');
    }
    await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizationVolume: 'scene' }));
    res.push(await escribir(doc, archivo + '.glb', nivel.max));
  }
  return res;
}

async function armarClip(clip, intermedio) {
  const doc = await io.read(intermedio);
  const root = doc.getRoot();
  const anims = root.listAnimations();
  if (anims.length !== 1) throw new Error(`${clip.nombre}: se esperaba una animación, hay ${anims.length}`);
  const anim = anims[0].setName(clip.nombre);
  for (const ch of anim.listChannels()) {
    const p = ch.getTargetPath(), n = ch.getTargetNode().getName();
    if (p === 'rotation' || (p === 'translation' && n === 'Bip01 Pelvis')) continue;
    const s = ch.getSampler();
    ch.dispose();
    s.dispose();
  }
  root.listSkins().forEach((s) => s.dispose());
  root.listMeshes().forEach((m) => m.dispose());
  await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const r = await escribir(doc, clip.nombre + '.glb', clip.max);
  const input = anim.listSamplers()[0].getInput();
  r.duracion = input.getMax([])[0];
  r.canales = anim.listChannels().length;
  return r;
}

// ---------- 5. Datos de huesos para el motor ----------

const v3 = (a) => `(${a.map((x) => x.toFixed(3)).join(', ')})`;
function ejes(n) {
  // ejes locales del hueso expresados en el mundo (columnas de la matriz)
  const m = n.getWorldMatrix(), nom = ['X', 'Y', 'Z'];
  return nom.map((e, k) => {
    const v = [m[k * 4], m[k * 4 + 1], m[k * 4 + 2]], l = Math.hypot(...v);
    return `+${e}→${v3(v.map((x) => x / l))}`;
  }).join(' ');
}

async function informeHuesos(archivoAvatar, archivoSentado) {
  const doc = await io.read(path.join(BUILD, archivoAvatar));
  const joints = doc.getRoot().listSkins()[0].listJoints();
  const porNombre = Object.fromEntries(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
  const L = [];
  L.push('# Esqueleto del conductor (Rocketbox Wood_Male_01, Biped 3ds Max)');
  L.push('# Unidades: metros. Y arriba. El personaje mira hacia +Z; su izquierda es +X. Pies en y=0.');
  L.push('# En three.js, GLTFLoader cambia los espacios por "_" en node.name: "Bip01 Head" -> "Bip01_Head".');
  L.push('# El nombre original queda en userData.name. Raíz: nodo "Bip01" (sin transformación).');
  L.push('');
  L.push(`## Huesos (${joints.length}): nombre <- padre`);
  for (const j of joints) L.push(`${j.getName()} <- ${j.getParentNode()?.getName() ?? '(escena)'}`);
  const clave = ['Bip01 Pelvis', 'Bip01 Spine', 'Bip01 Spine1', 'Bip01 Spine2', 'Bip01 Neck', 'Bip01 Head', 'Bip01 REye', 'Bip01 LEye',
    'Bip01 MJaw',
    ...['L', 'R'].flatMap((s) => ['Clavicle', 'UpperArm', 'Forearm', 'Hand', 'Finger0', 'Finger1', 'Finger2', 'Finger3', 'Finger4', 'Thigh', 'Calf', 'Foot', 'Toe0'].map((b) => `Bip01 ${s} ${b}`))];
  L.push('');
  L.push('## Pose de reposo (de pie, brazos abiertos hacia abajo), posición en el mundo');
  for (const n of clave) if (porNombre[n]) L.push(`${n.padEnd(20)} ${v3(porNombre[n].getWorldTranslation())}`);
  L.push('');
  L.push('## Ejes locales en reposo (hacia dónde apunta cada eje local, en el mundo)');
  for (const n of ['Bip01 Head', 'Bip01 Neck', 'Bip01 REye', 'Bip01 LEye', 'Bip01 L UpperArm', 'Bip01 L Forearm', 'Bip01 L Hand', 'Bip01 L Finger1', 'Bip01 R UpperArm', 'Bip01 R Forearm', 'Bip01 R Hand', 'Bip01 R Finger1'])
    if (porNombre[n]) L.push(`${n.padEnd(18)} ${ejes(porNombre[n])}`);
  // Primer cuadro de "sentado" aplicado a este esqueleto.
  const clip = await io.read(path.join(BUILD, archivoSentado));
  const anim = clip.getRoot().listAnimations()[0];
  for (const ch of anim.listChannels()) {
    const n = porNombre[ch.getTargetNode().getName()];
    if (!n) continue;
    const out = ch.getSampler().getOutput(), v = out.getElement(0, []);
    if (ch.getTargetPath() === 'rotation') n.setRotation(v); else n.setTranslation(v);
  }
  L.push('');
  L.push(`## Primer cuadro de "sentado" sobre este esqueleto (raíz en el origen), posición en el mundo`);
  for (const n of clave) if (porNombre[n]) L.push(`${n.padEnd(20)} ${v3(porNombre[n].getWorldTranslation())}`);
  fs.writeFileSync(path.join(BUILD, 'conductor-huesos.txt'), L.join('\n') + '\n');
  log('conductor-huesos.txt:', joints.length, 'huesos');
}

function creditos(res) {
  const lic = fs.readFileSync(path.join(CACHE, 'LICENSE.md'), 'utf8');
  const copy = lic.split('\n').find((l) => /^Copyright/.test(l)).trim();
  const md = `### Personas: Microsoft Rocketbox Avatar Library

- **Fuente:** [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), de Microsoft Research y Rocketbox Studios. Formas faciales ARKit y visemas de Fang Ma y Matias Volonte.
- **Licencia:** MIT. ${copy}. El texto completo de la licencia está en el repositorio.
- **Conductor:** avatar \`Assets/Avatars/Professions/Wood_Male_01\`, versión \`_facial\`. Se usan 19 de sus formas faciales.
- **Compañero:** avatar \`Assets/Avatars/Professions/Construction_Male_08\`, con el overol y el casco recoloreados a verde oliva.
- **Animaciones:** \`${CLIP_ESPERA}\` (espera, de pie) y \`${CLIP_SENTADO}\` (sentado), de \`Assets/Animations/all_animations_max_motextr_static\`.
- **Cambios:** pasados a glTF con Blender y glTF Transform, texturas en WebP, el mapa especular convertido en rugosidad y las animaciones recortadas al cuerpo.
`;
  fs.writeFileSync(path.join(BUILD, 'rocketbox-creditos.md'), md);
}

// ---------- 6. Renders de control en three.js r186 ----------

const PAGINA = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#222}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
</head><body><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const avisos = [];
const cw = console.warn.bind(console); console.warn = (...a) => { avisos.push(a.join(' ')); cw(...a); };
const ce = console.error.bind(console); console.error = (...a) => { avisos.push('ERROR ' + a.join(' ')); ce(...a); };
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = {};
const cargar = (u) => (cache[u] ??= loader.loadAsync(u));
function escenaBase(suelo) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x9fb3c8);
  s.environment = entorno; s.environmentIntensity = 0.55;
  s.add(new THREE.HemisphereLight(0xdfe8f5, 0x6b5d4a, 0.8));
  const sol = new THREE.DirectionalLight(0xfff2e0, 2.6);
  sol.position.set(2.5, 4, 3.5); sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048); sol.shadow.camera.left = sol.shadow.camera.bottom = -3; sol.shadow.camera.right = sol.shadow.camera.top = 3;
  sol.shadow.bias = -0.0005; sol.shadow.normalBias = 0.02;
  s.add(sol);
  if (suelo) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x8c8172, roughness: 0.95 }));
    p.rotation.x = -Math.PI / 2; p.receiveShadow = true; s.add(p);
    const g = new THREE.GridHelper(40, 40, 0x444444, 0x666666); g.position.y = 0.002; s.add(g);
  }
  return s;
}
function clonar(gltf) {
  // instancia propia del personaje (SkeletonUtils no hace falta: un clon por render)
  return import('three/addons/utils/SkeletonUtils.js').then((m) => m.clone(gltf.scene));
}
const huesoMundo = (o, n) => { const b = o.getObjectByName(n); const v = new THREE.Vector3(); b.getWorldPosition(v); return v; };
window.datos = {};
window.render = async (c) => {
  avisos.length = 0;
  renderer.setSize(c.ancho, c.alto, false);
  const s = escenaBase(c.suelo);
  const gltf = await cargar(c.modelo);
  const p = await clonar(gltf);
  p.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
  s.add(p);
  let info = {};
  if (c.clip) {
    const g = await cargar(c.clip);
    const mixer = new THREE.AnimationMixer(p);
    mixer.clipAction(g.animations[0]).play();
    mixer.setTime(c.t || 0);
    info.clip = { nombre: g.animations[0].name, duracion: g.animations[0].duration, pistas: g.animations[0].tracks.length };
  }
  const cabeza = p.getObjectByName('cabeza');
  if (c.formas && cabeza) for (const [k, v] of Object.entries(c.formas)) {
    const i = cabeza.morphTargetDictionary[k]; if (i === undefined) throw new Error('falta forma ' + k);
    cabeza.morphTargetInfluences[i] = v;
  }
  p.updateMatrixWorld(true);
  if (c.mirada) {
    // girar los ojos en el mundo alrededor del eje vertical (positivo = hacia su izquierda, +X)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(c.mirada));
    for (const n of ['Bip01_REye', 'Bip01_LEye']) {
      const b = p.getObjectByName(n), qw = new THREE.Quaternion(), qp = new THREE.Quaternion();
      b.getWorldQuaternion(qw); b.parent.getWorldQuaternion(qp);
      b.quaternion.copy(qp.invert().multiply(q.clone().multiply(qw)));
    }
    p.updateMatrixWorld(true);
  }
  const ojos = huesoMundo(p, 'Bip01_REye').add(huesoMundo(p, 'Bip01_LEye')).multiplyScalar(0.5);
  const pelvis = huesoMundo(p, 'Bip01_Pelvis');
  const ref = { ojos, pelvis }[c.ref || 'ojos'] || new THREE.Vector3();
  const cam = new THREE.PerspectiveCamera(c.fov, c.ancho / c.alto, 0.05, 100);
  cam.position.copy(ref).add(new THREE.Vector3(...c.cam));
  cam.lookAt(ref.clone().add(new THREE.Vector3(...(c.mira || [0, 0, 0]))));
  renderer.render(s, cam);
  info.avisos = [...avisos];
  info.ojos = ojos.toArray(); info.pelvis = pelvis.toArray();
  const pies = huesoMundo(p, 'Bip01_L_Foot'); info.pieIzq = pies.toArray();
  const caja = new THREE.Box3().setFromObject(p, true); info.caja = [caja.min.toArray(), caja.max.toArray()];
  if (cabeza) info.formas = Object.keys(cabeza.morphTargetDictionary);
  info.mallas = []; p.traverse((o) => { if (o.isSkinnedMesh) info.mallas.push(o.name + ':' + o.material.name + ':' + (o.material.map ? o.material.map.image.width : 0)); });
  info.png = renderer.domElement.toDataURL('image/png');
  return info;
};
window.listo = true;
</script></body></html>`;

function servidor(raiz) {
  const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.wasm': 'application/wasm' };
  const s = http.createServer((req, res) => {
    const ruta = path.join(raiz, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!ruta.startsWith(raiz) || !fs.existsSync(ruta) || !fs.statSync(ruta).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': tipos[path.extname(ruta)] || 'application/octet-stream' });
    fs.createReadStream(ruta).pipe(res);
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

async function renders() {
  const { chromium } = await import('playwright-core');
  fs.mkdirSync(path.join(CACHE, 'verificar'), { recursive: true });
  fs.writeFileSync(path.join(CACHE, 'verificar/index.html'), PAGINA);
  const srv = await servidor(TOOLS);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const nav = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const resumen = [];
  try {
    const pag = await nav.newPage();
    pag.on('pageerror', (e) => console.error('   página:', e.message));
    await pag.goto(base + '/.cache/rocketbox/verificar/index.html');
    await pag.waitForFunction(() => window.listo === true, null, { timeout: 60000 });
    const B = '/.cache/build/';
    const tomar = async (c) => {
      const info = await pag.evaluate((c) => window.render(c), c);
      const png = Buffer.from(info.png.split(',')[1], 'base64');
      delete info.png;
      if (info.avisos.length) log('  avisos:', info.avisos.slice(0, 5));
      return { png, info };
    };
    const cara = { modelo: B + 'conductor-alta.glb', ancho: 480, alto: 480, fov: 32, cam: [0, -0.03, 0.5], mira: [0, -0.04, 0] };
    const panelesCara = [
      ['neutral', {}],
      ['parpadeo', { formas: { eyeBlinkLeft: 1, eyeBlinkRight: 1 } }],
      ['jawOpen 0,4', { formas: { jawOpen: 0.4 } }],
      ['mouthPress', { formas: { mouthPressLeft: 1, mouthPressRight: 1 } }],
      ['mirada izq.', { mirada: 25 }],
      ['liviana', { modelo: B + 'conductor-liviana.glb' }],
    ];
    const imgs = [];
    for (const [nombre, extra] of panelesCara) {
      const r = await tomar({ ...cara, ...extra });
      imgs.push(r.png);
      if (nombre === 'neutral') resumen.push(['cara', r.info]);
      if (nombre === 'liviana') resumen.push(['liviana', r.info]);
    }
    await mosaico(imgs, 3, 480, 480, panelesCara.map((p) => p[0]), 'verif-conductor-cara.png');
    const sent = [];
    for (const [t, cam] of [[0, [1.9, 0.35, 0.25]], [6, [1.9, 0.35, 0.25]], [3, [1.2, 0.45, 1.6]]]) {
      const r = await tomar({ modelo: B + 'conductor-alta.glb', clip: B + 'sentado.glb', t, ancho: 640, alto: 640, fov: 40, ref: 'pelvis', cam, mira: [0, 0.2, 0.1], suelo: true });
      sent.push(r.png);
      if (t === 0) resumen.push(['sentado', r.info]);
    }
    await mosaico(sent, 3, 640, 640, ['sentado t=0 (lado)', 'sentado t=6 (lado)', 'sentado t=3 (3/4)'], 'verif-conductor-sentado.png');
    const lejos = await tomar({ modelo: B + 'companero.glb', clip: B + 'espera.glb', t: 3, ancho: 960, alto: 540, fov: 50, ref: 'pelvis', cam: [0, 0.7, 8], mira: [0, 0, 0], suelo: true });
    fs.writeFileSync(path.join(BUILD, 'verif-companero-8m.png'), lejos.png);
    resumen.push(['companero 8 m', lejos.info]);
    const cerca = [];
    for (const [t, cam] of [[3, [0, 0.6, 2]], [8, [1.2, 0.6, 1.6]]]) {
      const r = await tomar({ modelo: B + 'companero.glb', clip: B + 'espera.glb', t, ancho: 540, alto: 720, fov: 50, ref: 'pelvis', cam, mira: [0, 0.05, 0], suelo: true });
      cerca.push(r.png);
    }
    await mosaico(cerca, 2, 540, 720, ['espera t=3 (2 m)', 'espera t=8 (3/4)'], 'verif-companero-2m.png');
  } finally {
    await nav.close();
    srv.close();
  }
  for (const [n, i] of resumen) log(`  ${n}:`, JSON.stringify(i));
}

async function mosaico(pngs, cols, w, h, rotulos, archivo) {
  const filas = Math.ceil(pngs.length / cols);
  const capas = [];
  pngs.forEach((png, k) => {
    const x = (k % cols) * w, y = Math.floor(k / cols) * h;
    capas.push({ input: png, left: x, top: y });
    const svg = `<svg width="${w}" height="28"><rect width="100%" height="100%" fill="black" opacity="0.55"/><text x="8" y="20" font-family="DejaVu Sans" font-size="17" fill="white">${rotulos[k]}</text></svg>`;
    capas.push({ input: Buffer.from(svg), left: x, top: y });
  });
  await sharp({ create: { width: cols * w, height: filas * h, channels: 3, background: '#000' } }).composite(capas).png().toFile(path.join(BUILD, archivo));
  log('render:', archivo);
}

// ---------- principal ----------

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(BUILD, { recursive: true });
  await bajarFuentes();
  await abrirIO();
  const resultados = [];
  for (const def of [CONDUCTOR, COMPANERO]) {
    const uvRuta = path.join(TMP, def.nombre + '-uv.json');
    const glb = blender(def.nombre, {
      modo: 'avatar', fbx: path.join(CACHE, def.fbx), uv_json: uvRuta,
      partes: def.partes, formas: def.formas || null, formas_en: def.formas_en || null,
    }, [path.join(CACHE, def.fbx)]);
    log('texturas:', def.nombre);
    const tex = prepararTexturas(def, JSON.parse(fs.readFileSync(uvRuta, 'utf8')));
    resultados.push(...(await armarAvatar(def, glb, tex)));
  }
  for (const clip of CLIPS) {
    const fbx = path.join(CACHE, ANIM + clip.fuente + '.max.fbx');
    const glb = blender(clip.nombre, { modo: 'clip', fbx, nombre: clip.nombre }, [fbx]);
    resultados.push(await armarClip(clip, glb));
  }
  await informeHuesos('conductor-alta.glb', 'sentado.glb');
  creditos(resultados);
  if (RENDERS) await renders();
  console.log('\nArchivo                  Tamaño     Límite    sha256');
  for (const r of resultados)
    console.log(`${r.archivo.padEnd(24)} ${kb(r.bytes).padStart(8)}  ${kb(r.max).padStart(8)}   ${r.sha256}${r.duracion ? `  (${r.duracion.toFixed(2)} s, ${r.canales} canales)` : ''}`);
  const pasados = resultados.filter((r) => r.bytes > r.max);
  if (pasados.length) { console.error('Pasan el límite:', pasados.map((r) => r.archivo).join(', ')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
