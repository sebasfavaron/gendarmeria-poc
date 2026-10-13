/*
 * Copia three.js (de tools/node_modules) a src/next/vendor/three/: el núcleo en un solo módulo
 * minificado y los complementos que usa el motor tal como vienen (importan 'three' por el importmap).
 * Uso: node tools/vendor-three.mjs [carpeta destino]   (por defecto src/next)
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(TOOLS, '..', process.argv[2] || 'src/next');
const THREE = path.join(TOOLS, 'node_modules/three');
const OUT = path.join(SRC, 'vendor/three');
const ADDONS = ['loaders/GLTFLoader.js', 'loaders/HDRLoader.js', 'libs/meshopt_decoder.module.js',
  'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'addons'), { recursive: true });
const version = JSON.parse(fs.readFileSync(path.join(THREE, 'package.json'))).version;
await build({
  entryPoints: [path.join(THREE, 'build/three.module.js')], bundle: true, minify: true, format: 'esm',
  outfile: path.join(OUT, 'three.module.min.js'), legalComments: 'none',
  banner: { js: `/* three.js ${version} · MIT · https://threejs.org (ver LICENSE) */` }, logLevel: 'warning'
});
for (const a of ADDONS) {
  const dst = path.join(OUT, 'addons', a);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(THREE, 'examples/jsm', a), dst);
}
fs.copyFileSync(path.join(THREE, 'LICENSE'), path.join(OUT, 'LICENSE'));
const kb = f => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
console.log(`three ${version} → ${path.relative(path.join(TOOLS, '..'), OUT)}: núcleo ${kb(path.join(OUT, 'three.module.min.js'))}`);
