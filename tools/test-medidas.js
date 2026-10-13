/*
 * Lo que dice la cinta coincide con la malla: con rayos sobre la camioneta cargada (ya inclinada por la
 * suspensión) se mide la luz de cada eje y el piso de la caja, y se compara con los datos del caso.
 * Uso: [SRC=src/next] node tools/test-medidas.js
 */
const path = require('path');
const { chromium } = require('playwright-core');
const { servir } = require('./servir');
const SRC = path.resolve(__dirname, '..', process.env.SRC || 'src/next');
const CASOS = ['caso=original', 'caso=10002', 'caso=10000', 'caso=10005&perfil=oculto', 'caso=10037'];
const TOL = 0.5;   // cm

(async () => {
  const server = await servir(SRC);
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  for (const q of CASOS) {
    const p = await b.newPage({ viewport: { width: 320, height: 240 } });
    await p.goto(`${server.url}/index.html?${q}&calidad=liviana`);
    await p.waitForFunction(() => window.__dbg && __dbg.camioneta, null, { polling: 1000, timeout: 300000 });
    const r = await p.evaluate(() => {
      const { THREE, M, camioneta, CASE } = __dbg, d = CASE.datos;
      camioneta.grupo.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(), cuerpo = camioneta.cuerpo;
      camioneta.grupo.traverse(m => { if (m.isMesh) m.material.side = THREE.DoubleSide; });
      const ruedas = ['rueda_DI', 'rueda_TI'].map(n => camioneta.grupo.getObjectByName(n));
      const luz = (rueda, z, x) => {
        const c = new THREE.Vector3(); rueda.getWorldPosition(c);
        // Tope de la cubierta en el centro de la banda; la luz se mide hacia arriba en el borde exterior, como la cinta
        ray.set(new THREE.Vector3(c.x, 3, c.z), new THREE.Vector3(0, -1, 0)); const tope = ray.intersectObject(rueda, true)[0].point.y;
        ray.set(new THREE.Vector3(x, tope + 0.002, c.z), new THREE.Vector3(0, 1, 0)); ray.far = 0.6;
        const h = ray.intersectObject(cuerpo, true).find(h => /^(pintura|black_1_ext|black_ext)$/.test(h.object.material.name));
        ray.far = Infinity;
        return h ? (h.point.y - tope) * 100 : null;
      };
      // Piso de la caja (con doble fondo, si hay) en el lugar de la cinta, pasado a coordenadas del cuerpo
      const C = M.caja, p0 = cuerpo.localToWorld(new THREE.Vector3(C.xCinta, 2, C.z1 - 0.2));
      ray.set(p0, new THREE.Vector3(0, -1, 0).transformDirection(cuerpo.matrixWorld));
      const piso = cuerpo.worldToLocal(ray.intersectObject(cuerpo, true)[0].point.clone()).y;
      return { gapF: [d.gapF, luz(ruedas[0], 0, M.arco.del.x)], gapR: [d.gapR, luz(ruedas[1], 0, M.arco.tras.x)],
        int: [d.int, (C.yBordeSup - piso) * 100], caso: CASE.semilla + ' ' + CASE.estados.rwheel + ' ' + CASE.estados.bed };
    });
    for (const k of ['gapF', 'gapR', 'int']) {
      const [dato, malla] = r[k];
      const ok = malla !== null && Math.abs(dato - malla) <= TOL + 0.5;   // el dato está redondeado al centímetro
      console.log(`${r.caso} ${k}: cinta ${dato} cm, malla ${malla === null ? '—' : malla.toFixed(2)} cm ${ok ? '' : '← NO COINCIDE'}`);
      if (!ok) errs.push(`${q} ${k}`);
    }
    await p.close();
  }
  await b.close(); server.cerrar();
  console.log(errs.length ? 'ERRORES: ' + errs.join(', ') : 'medidas: la cinta coincide con la malla');
  process.exitCode = errs.length ? 1 : 0;
})();
