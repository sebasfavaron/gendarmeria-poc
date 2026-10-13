/*
 * Capturas rápidas para ajustar luces y materiales sin recorrer todo el caso.
 * Uso: [SRC=src/next] node tools/vista.js salida.png "query" '{"x":-2.6,"z":6.5,"yaw":0.4,"pitch":-0.1,"eye":1.65,"linterna":false,"luz":{"cielo":0.16}}' [ancho] [alto]
 * Varias vistas: pasar un arreglo JSON de objetos con "archivo" en cada uno (la salida es una carpeta).
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const { servir } = require('./servir');
const SRC = path.resolve(__dirname, '..', process.env.SRC || 'src/next');
const [out, query = 'caso=original', vistasJson = '{}', W = 1280, H = 800] = process.argv.slice(2);

(async () => {
  const server = await servir(SRC);
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await p.goto(server.url + '/index.html?' + query);
  await p.waitForFunction(() => !document.querySelector('#startBtn').disabled, null, { polling: 1000, timeout: 300000 });
  p.setDefaultTimeout(300000);
  await p.click('#startBtn', { timeout: 300000 });   // con WebGL por software y la escena completa, un cuadro tarda segundos
  await p.waitForTimeout(500);
  let vistas = JSON.parse(vistasJson);
  const varias = Array.isArray(vistas);
  if (!varias) vistas = [Object.assign({ archivo: out }, vistas)];
  else fs.mkdirSync(out, { recursive: true });
  for (const v of vistas) {
    await p.evaluate(v => {
      const d = window.__dbg;
      if (v.luz) { Object.assign(d.LUZ, v.luz); d.aplicarLuz(); }
      if (v.x !== undefined) Object.assign(d.player, { x: v.x, z: v.z });
      if (v.yaw !== undefined) d.player.yaw = v.yaw;
      if (v.pitch !== undefined) d.player.pitch = v.pitch;
      if (v.eye !== undefined) { d.player.eye = v.eye; d.player.crouch = v.eye < 1; }
      if (v.linterna !== undefined) d.setTorch(v.linterna);
      if (v.eval) (0, eval)(v.eval);
    }, v);
    await p.waitForTimeout(v.espera || 1500);
    const file = varias ? path.join(out, v.archivo) : v.archivo;
    await p.screenshot({ path: file });
    console.log('captura', file);
  }
  if (errs.length) console.log('consola:\n' + [...new Set(errs)].join('\n'));
  await b.close();
  server.cerrar();
})();
