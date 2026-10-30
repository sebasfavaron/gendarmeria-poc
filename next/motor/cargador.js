/*
 * Carga los assets de un nivel de calidad con progreso por bytes.
 *   cargarManifest() -> manifest
 *   cargar(manifest, nivel, alProgresar(bytes, total)) -> Map(clave -> recurso)
 * Recursos: Texture (jpg/webp), DataTexture (hdr) o el resultado de GLTFLoader (glb).
 * Si algo falla, rechaza con un Error: no se arranca con la escena incompleta.
 * En dist/ (un solo archivo) los datos vienen incrustados en window.__ASSETS y no hay pedidos de red.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { renderer } from './nucleo.js';

const incrustado = window.__ASSETS || null;
// Caché de assets para abrir sin conexión (la lee sw.js). Una por carpeta publicada: /, /v1/, /next/.
const CACHE_ASSETS = 'gpoc-assets:' + location.pathname.replace(/[^/]*$/, '');
const conCache = !incrustado && window.isSecureContext && 'caches' in window;
async function guardar(url, buf) {
  if (!conCache) return;
  try { (await caches.open(CACHE_ASSETS)).put(new URL(url, location.href).href, new Response(buf)); } catch (e) { /* sin lugar: se baja otra vez la próxima */ }
}

export async function cargarManifest() {
  if (incrustado) return incrustado.manifest;
  const r = await fetch('assets/manifest.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('No se pudo leer la lista de archivos (manifest).');
  return r.json();
}

// Baja un archivo contando bytes a medida que llegan
async function bajar(url, avance) {
  if (incrustado) {
    const bin = atob(incrustado.archivos[url]), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    avance(buf.length);
    return buf.buffer;
  }
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`No se pudo bajar ${url} (${r.status}).`);
  // Si vino de la caché del service worker no hace falta volver a guardarlo
  const yaGuardado = conCache && await caches.open(CACHE_ASSETS).then(c => c.match(new URL(url, location.href).href)).catch(() => null);
  const reader = r.body.getReader(), partes = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    partes.push(value); n += value.length; avance(value.length);
  }
  const buf = new Uint8Array(n); let o = 0;
  for (const p of partes) { buf.set(p, o); o += p.length; }
  if (!yaGuardado) guardar(url, buf.buffer.slice(0));
  return buf.buffer;
}

async function imagen(buf, tipo, srgb) {
  const url = URL.createObjectURL(new Blob([buf], { type: tipo }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const t = new THREE.Texture(img);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    t.needsUpdate = true;
    return t;
  } finally { URL.revokeObjectURL(url); }
}

const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const hdrLoader = new HDRLoader().setDataType(THREE.HalfFloatType);

async function decodificar(clave, url, buf) {
  const ext = url.slice(url.lastIndexOf('.') + 1);
  if (ext === 'glb') return gltfLoader.parseAsync(buf, '');
  if (ext === 'hdr') {
    const d = hdrLoader.parse(buf);
    const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
    t.colorSpace = THREE.LinearSRGBColorSpace; t.flipY = true;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.mapping = THREE.EquirectangularReflectionMapping; t.needsUpdate = true;
    return t;
  }
  // Colores en sRGB; normales y mapas de rugosidad u oclusión en lineal
  const srgb = clave.endsWith('.color') || clave === 'cielo.fondo';
  return imagen(buf, ext === 'webp' ? 'image/webp' : 'image/jpeg', srgb);
}

export async function cargar(manifest, nivel, alProgresar) {
  const lista = Object.entries(manifest.niveles[nivel].archivos);
  const total = manifest.niveles[nivel].total;
  let llevo = 0;
  const avance = n => { llevo += n; if (alProgresar) alProgresar(llevo, total); };
  const recursos = new Map();
  // De a cuatro: con la red lenta del celular no conviene abrir todo junto
  const cola = lista.slice();
  async function trabajador() {
    for (let e = cola.shift(); e; e = cola.shift()) {
      const [clave, a] = e;
      const buf = await bajar(a.url, avance);
      const r = await decodificar(clave, a.url, buf);
      recursos.set(clave, { valor: r, meta: a.meta || {} });
    }
  }
  await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()]);
  limpiarGuardados(lista.map(([, a]) => new URL(a.url, location.href).href));
  return recursos;
}
// Borra de la caché los assets de armados anteriores (los nombres cambian con el contenido)
async function limpiarGuardados(vigentes) {
  if (!conCache) return;
  try {
    const c = await caches.open(CACHE_ASSETS), ok = new Set(vigentes);
    for (const req of await c.keys()) if (!ok.has(req.url)) await c.delete(req);
  } catch (e) { /* no es grave */ }
}
