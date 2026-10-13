/*
 * Recorrido automático con Chromium sin interfaz: abre un caso, revisa cada punto desde
 * una posición razonable, ejecuta las acciones y guarda capturas.
 * Uso: [SRC=src/next] node tools/smoke.js [salida] [query] [ancho] [alto]
 *   ej. SRC=src/next node tools/smoke.js /tmp/capturas "caso=original" 1280 800
 * Requiere playwright-core (npm i --prefix tools) y un Chromium (CHROMIUM=/ruta/al/binario).
 * Sirve la carpeta SRC (por defecto src) con un servidor local: los módulos no cargan por file://.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const { servir } = require('./servir');
const SRC = path.resolve(__dirname, '..', process.env.SRC || 'src');
const out = process.argv[2] || '/tmp/gpoc-shots';
const query = process.argv[3] || 'caso=original';
const W = +(process.argv[4] || 1280), H = +(process.argv[5] || 800);
const mobile = W < H;
fs.mkdirSync(out, { recursive: true });

// Desde dónde revisar cada punto: posición del jugador, si se agacha y acciones a ejecutar
const PLAN = [
  ['driver', -1.75, -0.2, false, []],
  ['ticket', -0.3, -3.6, false, []],
  ['etch', 0.6, -3.4, false, []],
  ['vin', -0.6, -3.4, false, []],
  ['fwheel', -2.1, -1.65, false, ['luzDel']],
  ['rwheel', -2.1, 1.5, false, ['luzTras', 'ballesta']],
  ['bed', -1.5, 1.9, false, ['interior', 'exterior', 'golpear', 'piso']],
  ['under', -1.0, 3.5, true, ['linterna']],
  ['plate', 0.1, 4.2, false, []],
  ['rseat', -1.5, 0.5, false, []],
  ['mate', 1.5, -0.35, false, []]
];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const server = await servir(SRC);
  const ctxOpts = { viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 };
  const errs = [];

  // Sin WebGL2 (three r186 lo exige): la pantalla de inicio lo dice en vez de quedar en negro
  {
    const c = await b.newContext(ctxOpts), q = await c.newPage();
    q.setDefaultTimeout(240000); q.setDefaultNavigationTimeout(240000);
    await q.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...r) { return t === 'webgl2' ? null : orig.call(this, t, ...r); };
    });
    await q.goto(server.url + '/index.html?' + query);
    await q.waitForTimeout(1500);
    const txt = await q.textContent('#intro').catch(() => '');
    if (!/no puede mostrar la escena 3D/.test(txt)) errs.push('sin WebGL2 no aparece el aviso');
    await c.close();
  }

  // Un asset que no carga: error claro con "Reintentar" y sin poder empezar.
  // Sin service worker: Playwright no intercepta lo que pide el service worker.
  {
    const c = await b.newContext(Object.assign({ serviceWorkers: 'block' }, ctxOpts)), q = await c.newPage();
    q.setDefaultTimeout(240000); q.setDefaultNavigationTimeout(240000);
    await q.route(/cielo-luz\./, r => r.abort());
    await q.goto(server.url + '/index.html?' + query);
    await q.waitForSelector('#loadRetry:not([hidden])', { timeout: 120000 }).catch(() => errs.push('sin "Reintentar" cuando falla un asset'));
    if (!(await q.$eval('#startBtn', el => el.disabled).catch(() => false))) errs.push('con un asset caído se puede empezar');
    await c.close();
  }
  // El nivel de calidad se puede forzar por la URL
  for (const nivel of ['alta', 'liviana']) {
    const c = await b.newContext(ctxOpts), q = await c.newPage();
    q.setDefaultTimeout(240000); q.setDefaultNavigationTimeout(240000);
    await q.goto(server.url + '/index.html?calidad=' + nivel);
    const n = await q.waitForFunction(() => window.__dbg && __dbg.calidad.nivel, null, { timeout: 30000 }).then(h => h.jsonValue()).catch(() => null);
    if (n !== nivel) errs.push(`?calidad=${nivel} dio ${n}`);
    await c.close();
  }
  // Si el navegador descarta el contexto WebGL: aviso con botón para recargar
  {
    const c = await b.newContext(ctxOpts), q = await c.newPage();
    q.setDefaultTimeout(240000); q.setDefaultNavigationTimeout(240000);
    await q.goto(server.url + '/index.html?' + query);
    await q.waitForFunction(() => window.__dbg && __dbg.renderer, null, { timeout: 30000 }).catch(() => {});
    await q.evaluate(() => __dbg.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await q.waitForSelector('#glLost:not([hidden]) #glReload', { timeout: 10000 }).catch(() => errs.push('sin aviso al perder el contexto WebGL'));
    await c.close();
  }

  // Sin conexión: después de una visita, la página vuelve a abrir y la partida arranca
  {
    const c = await b.newContext(ctxOpts), q = await c.newPage();
    q.setDefaultTimeout(240000); q.setDefaultNavigationTimeout(240000);
    const listo = () => q.waitForFunction(() => !document.querySelector('#startBtn').disabled, null, { polling: 1000, timeout: 180000 });
    await q.goto(server.url + '/index.html?' + query); await listo();
    await q.waitForTimeout(1500);   // que termine de guardar los assets
    await c.setOffline(true);
    await q.reload();
    const ok = await listo().then(() => true).catch(() => false);
    if (!ok) errs.push('sin conexión no vuelve a cargar');
    else {
      await q.click('#startBtn');
      if ((await q.evaluate(() => __dbg.state.mode)) !== 'play') errs.push('sin conexión no arranca la partida');
    }
    await c.close();
  }

  const ctx = await b.newContext(ctxOpts);
  const p = await ctx.newPage();
  // Con WebGL por software y la escena completa un cuadro puede tardar segundos: esperas largas
  p.setDefaultTimeout(240000); p.setDefaultNavigationTimeout(240000);
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await p.goto(server.url + '/index.html?' + query);
  await p.waitForTimeout(1200);
  // El service worker propio de la carpeta (y no el de otra versión) controla la página
  await p.reload(); await p.waitForTimeout(1200);
  const swUrl = await p.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : '');
  if (swUrl !== server.url + '/sw.js') errs.push('service worker inesperado: ' + (swUrl || 'ninguno'));
  await p.waitForFunction(() => !document.querySelector('#startBtn').disabled, null, { polling: 1000, timeout: 120000 }).catch(() => errs.push('Empezar no se habilitó'));
  await p.screenshot({ path: `${out}/00-inicio.png` });
  await p.click('#startBtn');
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/01-exploracion.png` });
  const perf = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r({ fps: (n / 2).toFixed(1) }); }; requestAnimationFrame(f); }));
  console.log('fps (software):', perf.fps);
  const caso = await p.evaluate(() => ({ semilla: __dbg.CASE.semilla, perfil: __dbg.CASE.perfil, estados: __dbg.CASE.estados, datos: __dbg.CASE.datos }));
  console.log(JSON.stringify(caso));
  let i = 2;
  for (const [id, x, z, crouch, acts] of PLAN) {
    const ok = await p.evaluate(([id, x, z, crouch]) => {
      const { player, POIS, state } = __dbg;
      const poi = POIS.find(q => q.id === id);
      if (player.crouch !== crouch) document.querySelector('#crouchBtn').click();
      // Busca la posición válida más cercana a la sugerida: del lado correcto, dentro del alcance y sin chocar
      let best = null;
      for (let gx = -6; gx <= 7; gx += 0.1) for (let gz = -9; gz <= 12; gz += 0.1) {
        const pl = { x: gx, z: gz };
        if (__dbg.blocked(gx, gz) || !poi.side(pl)) continue;
        const hd = Math.hypot(poi.p[0] - gx, poi.p[2] - gz);
        if (hd > poi.range - 0.15) continue;
        const d = Math.hypot(gx - x, gz - z);
        if (!best || d < best.d) best = { x: gx, z: gz, d };
      }
      if (!best) return false;
      x = best.x; z = best.z;
      player.x = x; player.z = z;
      player.yaw = Math.atan2(-(poi.p[0] - x), -(poi.p[2] - z));
      const eye = crouch ? 0.55 : 1.65;
      player.pitch = Math.atan2(poi.p[1] - eye, Math.hypot(poi.p[0] - x, poi.p[2] - z));
      player.eye = eye;
      state.nearKey = '';
      return [x, z];
    }, [id, x, z, crouch]);
    if (!ok) { errs.push(`sin posición válida para ${id}`); continue; }
    await p.waitForFunction(id => __dbg.state.near.some(q => q.id === id), id, { timeout: 30000 }).catch(() => {});
    const res = await p.evaluate(id => {
      const label = __dbg.POIS.find(q => q.id === id).label;
      const bs = [...document.querySelectorAll('#acts .act')];
      const b = bs.find(x => x.textContent.includes(label));
      if (b) b.click();
      return { ok: !!b, labels: bs.map(x => x.textContent) };
    }, id);
    if (!res.ok) { errs.push(`no aparece el botón de ${id} (botones: ${res.labels.join(' / ')})`); continue; }
    await p.waitForFunction(() => __dbg.view.close && __dbg.view.blend >= 1, null, { timeout: 8000 }).catch(() => errs.push('el encuadre no terminó: ' + id));
    await p.waitForTimeout(300);
    const n = String(i++).padStart(2, '0');
    await p.screenshot({ path: `${out}/${n}-${id}.png` });
    if (id === 'driver') {
      const nq = (await p.$$('#qs .q')).length;
      for (let k = 0; k < nq; k++) { await (await p.$$('#qs .q'))[k].click(); await p.waitForTimeout(1700); }
      await p.screenshot({ path: `${out}/${n}-${id}-charla.png` });
      await p.click('#talkClose');
    } else {
      for (const a of acts) {
        const want = { luzDel: 'Medir la luz', luzTras: 'Medir la luz', ballesta: 'ballesta', interior: 'por dentro', exterior: 'por fuera', golpear: 'Golpear', piso: 'piso de cerca', linterna: 'linterna' }[a];
        const clicked = await p.evaluate(want => { const c = [...document.querySelectorAll('#inActs .chipbtn')].find(x => x.textContent.includes(want)); if (c) c.click(); return !!c; }, want);
        if (!clicked) { errs.push(`no está la acción ${a} en ${id}`); continue; }
        await p.waitForTimeout(300);
        await p.waitForFunction(() => __dbg.view.blend >= 1, null, { timeout: 8000 }).catch(() => {});
        await p.waitForTimeout(300);
        await p.screenshot({ path: `${out}/${n}-${id}-${a}.png` });
      }
      await p.click(id === 'driver' ? '#talkClose' : (['bed', 'ticket', 'under'].includes(id) ? '#markIrr' : '#markOk'));
    }
    await p.waitForFunction(() => __dbg.view.blend >= 1, null, { timeout: 8000 }).catch(() => {});
  }
  await p.evaluate(() => { const { player } = __dbg; if (player.crouch) document.querySelector('#crouchBtn').click(); });
  await p.click('#notesBtn'); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/90-libreta.png` });
  await p.click('#notesClose');
  await p.click('#endBtn'); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/91-decision.png` });
  await (await p.$$('#decChoices .q'))[0].click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/92-resultado.png`, fullPage: false });
  const title = await p.textContent('#dbTitle');
  console.log('resultado:', title, '|', await p.textContent('#dbFound'), '|', await p.textContent('#dbCase'));
  console.log(errs.length ? 'ERRORES:\n' + errs.join('\n') : 'sin errores');
  await b.close();
  server.cerrar();
  process.exitCode = errs.length ? 1 : 0;
})();
