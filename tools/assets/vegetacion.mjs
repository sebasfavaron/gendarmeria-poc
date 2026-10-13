/*
 * Vegetación como "impostores": se renderiza una vez cada árbol o arbusto de Poly Haven (CC0) de costado,
 * con fondo transparente, y el motor lo muestra en dos planos cruzados. Un árbol real tiene cientos
 * de miles de triángulos; así cuesta cuatro.
 * Salida: tools/.cache/build/vegetacion/<nombre>-<nivel>.webp y vegetacion.entradas.json
 * (meta: ancho y alto en metros). Uso: node tools/assets/vegetacion.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium } from 'playwright-core';
import { bajar } from './polyhaven.mjs';

const TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(TOOLS, '.cache', 'build', 'vegetacion');
const VENDOR = path.join(TOOLS, '..', 'src', 'next', 'vendor');
fs.mkdirSync(OUT, { recursive: true });

const PLANTAS = [
  { nombre: 'arbol1', id: 'searsia_lucida', alta: 512, liviana: 256 },
  { nombre: 'arbol2', id: 'searsia_burchellii', alta: 512, liviana: 256 },
  { nombre: 'arbusto', id: 'shrub_02', alta: 256, liviana: 128 }
];

const PAGINA = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{ "imports": { "three": "/vendor/three/three.module.min.js", "three/addons/": "/vendor/three/addons/" } }</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// Cada archivo trae varias plantas una al lado de la otra: cada una va a su celda cuadrada de un atlas,
// apoyada abajo y centrada. Devuelve el PNG del atlas y el lado en metros de cada celda.
window.render = async (url, celda) => {
  const gltf = await new GLTFLoader().loadAsync(url);
  let raiz = gltf.scene;
  while (raiz.children.length === 1 && !raiz.children[0].isMesh) raiz = raiz.children[0];
  const plantas = raiz.children.filter(n => new THREE.Box3().setFromObject(n).getSize(new THREE.Vector3()).y > 0.05);
  const n = plantas.length;
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(celda * n, celda); r.setClearColor(0x000000, 0); r.setScissorTest(true); document.body.appendChild(r.domElement);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const variantes = [];
  plantas.forEach((pl, i) => {
    const scene = new THREE.Scene(); scene.add(pl);
    pl.traverse(m => { if (m.isMesh) { m.material.side = THREE.DoubleSide; m.material.transparent = false; if (m.material.map) m.material.alphaTest = 0.5; } });
    // Luz pareja con algo de forma: el motor la vuelve a iluminar
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 1.4); d.position.set(0.4, 1, 1); scene.add(d);
    const caja = new THREE.Box3().setFromObject(pl), tam = caja.getSize(new THREE.Vector3()), c = caja.getCenter(new THREE.Vector3());
    const lado = Math.max(tam.x, tam.y) * 1.02;
    const cam = new THREE.OrthographicCamera(-lado / 2, lado / 2, lado, 0, -100, 100);
    cam.position.set(c.x, caja.min.y, c.z + 20); cam.lookAt(c.x, caja.min.y, c.z);
    r.setViewport(i * celda, 0, celda, celda); r.setScissor(i * celda, 0, celda, celda);
    r.render(scene, cam);
    variantes.push({ lado, alto: tam.y });
  });
  return { png: r.domElement.toDataURL('image/png'), variantes };
};
window.listo = true;
</script></body></html>`;

// Servidor de una sola vez: la página, three.js del proyecto y los modelos de la caché
function servidor() {
  const raiz = path.join(TOOLS, '.cache', 'polyhaven');
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = null, tipo = 'application/octet-stream';
    if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(PAGINA); }
    if (u.startsWith('/vendor/')) { file = path.join(VENDOR, u.slice(8)); tipo = 'text/javascript'; }
    if (u.startsWith('/modelo/')) file = path.join(raiz, u.slice(8));
    if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    if (file.endsWith('.gltf')) tipo = 'model/gltf+json';
    res.writeHead(200, { 'Content-Type': tipo }); fs.createReadStream(file).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${srv.address().port}`, srv })));
}

const s = await servidor();
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
p.on('pageerror', e => console.error('página:', e.message));
await p.goto(s.url + '/');
await p.waitForFunction(() => window.listo);
const entradas = [];
for (const pl of PLANTAS) {
  const gltf = await bajar(pl.id, 'gltf', '1k', 'gltf');
  const rel = path.relative(path.join(TOOLS, '.cache', 'polyhaven'), gltf).split(path.sep).join('/');
  const r = await p.evaluate(([u, c]) => window.render(u, c), ['/modelo/' + rel, pl.alta]);
  const png = Buffer.from(r.png.split(',')[1], 'base64'), n = r.variantes.length;
  for (const nivel of ['alta', 'liviana']) {
    const file = path.join(OUT, `${pl.nombre}-${nivel}.webp`);
    await sharp(png).resize(pl[nivel] * n, pl[nivel]).webp({ quality: 85, alphaQuality: 90 }).toFile(file);
    await sharp(file).metadata();   // verificación de lo escrito
    entradas.push({ nivel, clave: `obj.${pl.nombre}.color`, archivo: path.relative(TOOLS, file), fuente: 'polyhaven:' + pl.id, meta: { variantes: r.variantes } });
  }
  console.log(`${pl.nombre} (${pl.id}): ${n} plantas, ` + r.variantes.map(v => v.alto.toFixed(1) + ' m').join(', '));
}
await b.close(); s.srv.close();
fs.writeFileSync(path.join(TOOLS, '.cache', 'build', 'vegetacion.entradas.json'), JSON.stringify(entradas, null, 1));
