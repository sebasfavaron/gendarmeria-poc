/*
 * Descargas de Poly Haven (CC0) con caché en tools/.cache/polyhaven/ y control de md5:
 * el disco de trabajo tuvo corrupción silenciosa, así que nada se usa sin verificar.
 *
 *   bajar(id, mapa, resolucion, formato) -> ruta local   (mapa: 'hdri', 'Diffuse', 'nor_gl', 'arm', 'gltf'...)
 *   info(id) -> { name, authors, ... }
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'polyhaven');
const API = 'https://api.polyhaven.com';

async function json(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.json();
    } catch (e) { /* reintenta */ }
    await new Promise(ok => setTimeout(ok, 2000 * (i + 1)));
  }
  throw new Error('no se pudo leer ' + url);
}

const md5 = buf => crypto.createHash('md5').update(buf).digest('hex');

async function bajarArchivo(url, destino, esperado) {
  if (fs.existsSync(destino) && md5(fs.readFileSync(destino)) === esperado) return destino;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (md5(buf) === esperado) {
        fs.writeFileSync(destino, buf);
        if (md5(fs.readFileSync(destino)) === esperado) return destino;
      }
    }
    await new Promise(ok => setTimeout(ok, 2000 * (i + 1)));
  }
  throw new Error(`descarga inválida: ${url}`);
}

const archivos = new Map();
async function listado(id) {
  if (!archivos.has(id)) archivos.set(id, await json(`${API}/files/${id}`));
  return archivos.get(id);
}

export async function info(id) { return json(`${API}/info/${id}`); }

export async function bajar(id, mapa, resolucion, formato) {
  const l = await listado(id);
  const f = l[mapa] && l[mapa][resolucion] && l[mapa][resolucion][formato];
  if (!f) throw new Error(`Poly Haven no tiene ${id} ${mapa} ${resolucion} ${formato}`);
  // Los modelos glTF traen sus texturas y el .bin aparte
  if (formato === 'gltf') {
    const dir = path.join(CACHE, id, `${resolucion}-gltf`);
    const principal = await bajarArchivo(f.url, path.join(dir, path.basename(f.url)), f.md5);
    for (const [rel, inc] of Object.entries(f.include || {})) await bajarArchivo(inc.url, path.join(dir, rel), inc.md5);
    return principal;
  }
  return bajarArchivo(f.url, path.join(CACHE, id, path.basename(f.url)), f.md5);
}
