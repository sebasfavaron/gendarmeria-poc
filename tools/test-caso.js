// Verifica que los casos generados sean coherentes con el contenido y con las medidas del modelo.
// Uso: [SRC=src/next] [MEDIDAS=ruta/a/hilux.medidas.js] node tools/test-caso.js
const path = require('path');
const assert = require('assert');
const SRC = path.resolve(__dirname, '..', process.env.SRC || 'src/next');
global.window = {};
require(path.join(SRC, 'escenario.js'));
const { generarCaso } = require(path.join(SRC, 'caso.js'));
const M = require(process.env.MEDIDAS ? path.resolve(process.env.MEDIDAS) : path.join(SRC, 'assets/hilux.medidas.js'));
const ESC = window.ESCENARIO;
const cm = v => Math.round(v * 100);
let minNormalR = 1, maxBajaR = 0;
const pois = Object.fromEntries(ESC.pois.filter(p => !p.talk).map(p => [p.id, p]));

const cuenta = {};
for (let s = 1; s <= 5000; s++) {
  const c = generarCaso(ESC, M, { semilla: s });
  const again = generarCaso(ESC, M, { semilla: s });
  assert.deepStrictEqual(c.estados, again.estados, 'misma semilla, mismo caso');
  for (const [id, st] of Object.entries(c.estados)) assert.ok(pois[id] && pois[id].estados[st], `estado inexistente ${id}:${st}`);
  for (const id of Object.keys(pois)) assert.ok(c.estados[id], `falta estado de ${id}`);
  const irr = Object.entries(c.estados).filter(([id, st]) => pois[id].estados[st].irr).map(([id]) => id);
  if (c.perfil === 'limpio') assert.strictEqual(irr.length, 0, `caso limpio con indicios: ${irr}`);
  else assert.ok(irr.length >= 1, `caso ${c.perfil} sin indicios (semilla ${s})`);
  if (c.estados.bed === 'dobleFondo') {
    assert.ok(c.fisico.dobleFondo >= 0.08 && c.fisico.dobleFondo <= 0.14, 'doble fondo fuera de rango: ' + c.fisico.dobleFondo);
    // Los pasarruedas internos siempre asoman al menos 1 cm sobre el doble fondo
    assert.ok(M.caja.yPiso + c.fisico.dobleFondo <= M.caja.yTechoPasarruedas - 0.01 + 1e-9, 'el doble fondo tapa los pasarruedas');
  } else assert.strictEqual(c.fisico.dobleFondo, 0);
  assert.strictEqual(c.sospechoso, c.perfil !== 'limpio');
  // La luz de cada eje sale de la luz nominal del modelo: normal cerca de la nominal, baja de 6 a 9 cm menos
  assert.ok(Math.abs(c.fisico.gapF - M.arco.del.luzNominal) <= 0.0075 + 1e-9, 'luz delantera fuera de rango');
  if (c.estados.rwheel === 'normal') { assert.ok(Math.abs(c.fisico.gapR - M.arco.tras.luzNominal) <= 0.0075 + 1e-9); minNormalR = Math.min(minNormalR, c.fisico.gapR); }
  else { assert.ok(c.fisico.gapR <= M.arco.tras.luzNominal - 0.06 + 1e-9 && c.fisico.gapR > 0.005, 'luz trasera baja fuera de rango'); maxBajaR = Math.max(maxBajaR, c.fisico.gapR); }
  assert.strictEqual(c.datos.gapF, cm(c.fisico.gapF)); assert.strictEqual(c.datos.gapR, cm(c.fisico.gapR));
  // Las medidas de la caja son las del modelo
  assert.strictEqual(c.datos.ext, cm(M.caja.yBordeSup - M.caja.yBordeInfExt));
  assert.strictEqual(c.datos.int, cm(M.caja.yBordeSup - M.caja.yPiso) - cm(c.fisico.dobleFondo));
  assert.strictEqual(c.datos.int + c.datos.diff, c.datos.ext);
  for (const q of ESC.preguntas) if (q.dep) assert.ok(q.a[c.estados[q.dep]], `respuesta faltante ${q.id}/${c.estados[q.dep]}`);
  cuenta[c.perfil] = (cuenta[c.perfil] || 0) + 1;
  cuenta['indicios_' + irr.length] = (cuenta['indicios_' + irr.length] || 0) + 1;
}
// Normal y baja se distinguen con la cinta: al menos 4 cm entre la menor normal y la mayor baja
assert.ok(minNormalR - maxBajaR >= 0.04, `luz normal y baja demasiado parecidas (${minNormalR} y ${maxBajaR})`);
// Datos del vehículo coherentes con el modelo 2021 (el carácter 10 del chasis indica el año: M = 2021)
assert.strictEqual(ESC.base.vehiculo.anio, '2021');
assert.strictEqual(ESC.base.chasis[9], 'M');
assert.ok(/^AE \d{3} [A-Z]{2}$/.test(ESC.base.dominio), 'dominio de la serie de 2020 y 2021');
const o = generarCaso(ESC, M, { semilla: 'original' });
assert.strictEqual(o.perfil, 'completo');
assert.strictEqual(o.estados.bed, 'dobleFondo');
const o2 = generarCaso(ESC, M, { semilla: 'original', perfil: 'limpio' });
assert.ok(o2.perfil === 'completo' && o2.sospechoso);
assert.strictEqual(generarCaso(ESC, M, { semilla: 7, perfil: 'limpio' }).perfil, 'limpio');
console.log('ok', cuenta);
