/*
 * Renderiza un GLB desde varias vistas con three.js r186 (el mismo motor de la página), para revisar
 * a ojo un asset armado. Uso: node tools/assets/render_glb.mjs archivo.glb salida/ '[{"nombre":"lado","pos":[-6,1,0],"mira":[0,0.8,0],"fov":40}]'
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const TOOLS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(TOOLS, '..', 'src', 'next', 'vendor');
const [glb, out, vistasJson] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const PAGINA = `<!doctype html><html><body style="margin:0">
<script type="importmap">{ "imports": { "three": "/vendor/three/three.module.min.js", "three/addons/": "/vendor/three/addons/" } }</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(900, 600); r.toneMapping = THREE.AgXToneMapping; document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1d2b40);
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x3a3328, 2.2));
const d = new THREE.DirectionalLight(0xffffff, 2.5); d.position.set(-3, 5, 2); scene.add(d);
const g = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/modelo.glb');
scene.add(g.scene);
window.ocultar = n => { const o = g.scene.getObjectByName(n); if (o) o.visible = false; };
window.vista = v => {
  const cam = v.orto ? new THREE.OrthographicCamera(-v.orto * 1.5, v.orto * 1.5, v.orto, -v.orto, 0.01, 50) : new THREE.PerspectiveCamera(v.fov || 40, 1.5, 0.01, 100);
  cam.position.fromArray(v.pos); if (v.up) cam.up.fromArray(v.up); cam.lookAt(new THREE.Vector3().fromArray(v.mira));
  (v.ocultar || []).forEach(window.ocultar);
  r.render(scene, cam);
  (v.ocultar || []).forEach(n => { const o = g.scene.getObjectByName(n); if (o) o.visible = true; });
  return r.domElement.toDataURL('image/png');
};
window.listo = true;
</script></body></html>`;
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(PAGINA); }
  const file = u === '/modelo.glb' ? path.resolve(glb) : u.startsWith('/vendor/') ? path.join(VENDOR, u.slice(8)) : null;
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 900, height: 600 } });
p.on('pageerror', e => console.error('página:', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`);
await p.waitForFunction(() => window.listo, null, { timeout: 300000 });
for (const v of JSON.parse(vistasJson)) {
  const png = await p.evaluate(v => window.vista(v), v);
  fs.writeFileSync(path.join(out, v.nombre + '.png'), Buffer.from(png.split(',')[1], 'base64'));
}
await b.close(); srv.close();
console.log('listo:', out);
