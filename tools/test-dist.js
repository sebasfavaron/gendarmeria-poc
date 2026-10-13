/*
 * Abre la versión de un solo archivo por file:// con la red bloqueada y verifica que cargue y arranque.
 * Uso: node tools/test-dist.js [archivo]   (por defecto dist/next/gendarmeria-poc.html)
 */
const path = require('path');
const { chromium } = require('playwright-core');
const file = path.resolve(__dirname, '..', process.argv[2] || 'dist/next/gendarmeria-poc.html');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  p.setDefaultTimeout(240000);
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_FAILED|ERR_INTERNET/.test(m.text())) errs.push(m.text()); });
  await p.route(/^https?:/, r => r.abort('internetdisconnected'));
  await p.goto('file://' + file);
  const ok = await p.waitForFunction(() => !document.querySelector('#startBtn').disabled, null, { polling: 1000, timeout: 180000 }).then(() => true).catch(() => false);
  if (!ok) errs.push('no terminó de cargar: ' + await p.textContent('#introMsg').catch(() => ''));
  else {
    await p.click('#startBtn'); await p.waitForTimeout(1500);
    if ((await p.evaluate(() => __dbg.state.mode)) !== 'play') errs.push('no arrancó la partida');
    await p.screenshot({ path: '/tmp/gpoc-dist.png' });
  }
  await b.close();
  console.log(errs.length ? 'ERRORES:\n' + errs.join('\n') : 'dist: abre sin red y arranca');
  process.exitCode = errs.length ? 1 : 0;
})();
