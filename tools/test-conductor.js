/*
 * Conducta del conductor: con un caso nervioso y el gendarme atrás, mira por los espejos y parpadea
 * más que uno tranquilo; al contestar, mueve la mandíbula.
 * Uso: [SRC=src/next] node tools/test-conductor.js
 * Mide en tiempo de juego (con WebGL por software el juego corre más lento que el reloj).
 */
const path = require('path');
const { chromium } = require('playwright-core');
const { servir } = require('./servir');
const SRC = path.resolve(__dirname, '..', process.env.SRC || 'src/next');
const CASOS = { nervioso: 10000, calmo: 10002 };   // conducta según caso.js (ver la semilla en el resultado)

async function medir(b, url, semilla, segundos) {
  const p = await b.newPage({ viewport: { width: 320, height: 240 } });
  p.setDefaultTimeout(240000);
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`${url}/index.html?caso=${semilla}&calidad=liviana`);
  await p.waitForFunction(() => !document.querySelector('#startBtn').disabled, null, { polling: 1000, timeout: 180000 });
  await p.click('#startBtn');
  // El gendarme atrás, junto a la caja
  await p.evaluate(() => Object.assign(__dbg.player, { x: -1.4, z: 2.0 }));
  const r = await p.evaluate(seg => new Promise(ok => {
    const c = __dbg.conductor, t0 = __dbg.tiempo, p0 = c.estado.parpadeos, e0 = c.estado.mirandoEspejo;
    const f = () => (__dbg.tiempo - t0 < seg ? requestAnimationFrame(f) : ok({ conducta: __dbg.CASE.conducta, parpadeos: c.estado.parpadeos - p0, espejo: c.estado.mirandoEspejo - e0 }));
    f();
  }), segundos);
  await p.close();
  return Object.assign(r, { errs });
}

(async () => {
  const server = await servir(SRC);
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  const nerv = await medir(b, server.url, CASOS.nervioso, 12), calmo = await medir(b, server.url, CASOS.calmo, 12);
  console.log('nervioso:', nerv, '\ncalmo:', calmo);
  if (nerv.conducta !== 'nervioso' || calmo.conducta !== 'calmo') errs.push('las semillas no dan la conducta esperada');
  if (nerv.espejo < 1) errs.push('nervioso y con el gendarme atrás, nunca miró por los espejos');
  if (nerv.parpadeos <= calmo.parpadeos) errs.push(`el nervioso no parpadea más (${nerv.parpadeos} contra ${calmo.parpadeos})`);
  errs.push(...nerv.errs, ...calmo.errs);

  // Al contestar mueve la mandíbula
  const p = await b.newPage({ viewport: { width: 320, height: 240 } });
  p.setDefaultTimeout(240000);
  await p.goto(`${server.url}/index.html?caso=${CASOS.calmo}&calidad=liviana`);
  await p.waitForFunction(() => !document.querySelector('#startBtn').disabled, null, { polling: 1000, timeout: 180000 });
  await p.click('#startBtn');
  await p.evaluate(() => { const d = __dbg; Object.assign(d.player, { x: -1.75, z: -0.2 }); });
  const jaw = await p.evaluate(() => new Promise(ok => {
    const d = __dbg, c = d.conductor; c.hablar('Salí de Tartagal a las seis y voy para Tucumán, por trabajo.');
    let max = 0; const t0 = d.tiempo;
    const f = () => { max = Math.max(max, c.estado.jawOpen); if (d.tiempo - t0 < 2) requestAnimationFrame(f); else ok(max); };
    f();
  }));
  console.log('mandíbula al hablar (máximo):', jaw.toFixed(2));
  if (!(jaw > 0.1)) errs.push('al hablar no mueve la mandíbula');
  await b.close(); server.cerrar();
  console.log(errs.length ? 'ERRORES:\n' + errs.join('\n') : 'conductor: sin errores');
  process.exitCode = errs.length ? 1 : 0;
})();
