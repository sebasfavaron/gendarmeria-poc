/*
 * Reglas del caso: en cada partida decide qué pasa realmente con la camioneta y en qué
 * estado queda cada punto de ESCENARIO.pois. Es determinístico a partir de una semilla,
 * así que el mismo número de caso siempre arma la misma camioneta.
 *
 *   generarCaso(ESCENARIO, { semilla, perfil })   semilla: número | 'original'
 *
 * Devuelve { semilla, perfil, sospechoso, estados, conducta, fisico, datos }.
 *  estados   estado de cada punto (claves de ESCENARIO.pois[].estados)
 *  conducta  'calmo' | 'nervioso'
 *  fisico    parámetros que usa main.js para armar la camioneta (luces de suspensión, doble fondo...)
 *  datos     valores para reemplazar {clave} en los textos
 *
 * Las probabilidades son supuestos para el prototipo: ajustarlas con instructores.
 */
(function (root) {
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// pesos: { clave: peso }
function sortear(rnd, pesos) {
  const keys = Object.keys(pesos);
  let r = rnd() * keys.reduce((s, k) => s + pesos[k], 0);
  for (const k of keys) { r -= pesos[k]; if (r < 0) return k; }
  return keys[keys.length - 1];
}
function fecha(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }

// El caso de la primera versión del prototipo, con todos los indicios a la vista.
const ORIGINAL = {
  perfil: 'completo', conducta: 'nervioso',
  estados: { ticket: 'contradice', etch: 'distinto', vin: 'distinto', fwheel: 'normal', rwheel: 'baja', bed: 'dobleFondo',
             under: 'soldadura', plate: 'normal', rseat: 'sillita', mate: 'mate' },
  fisico: { gapF: 0.10, gapR: 0.035, dobleFondo: 0.12, tornillosNuevos: false }
};

function generarCaso(ESC, opts) {
  opts = opts || {};
  const original = opts.semilla === 'original';
  const semilla = original ? 'original' : (Number(opts.semilla) || 10000 + Math.floor(Math.random() * 90000));
  const rnd = mulberry32(original ? 1 : semilla);
  const pesos = {};
  Object.keys(ESC.perfiles).forEach(k => { pesos[k] = ESC.perfiles[k].peso; });
  let perfil = sortear(rnd, pesos);
  if (opts.perfil && ESC.perfiles[opts.perfil]) perfil = opts.perfil;

  const oculto = perfil === 'oculto' || perfil === 'completo';
  const doblada = perfil === 'doblada' || perfil === 'completo';
  const e = {};
  const f = {};

  // Caja y suspensión. Si no hay compartimiento, a veces lleva carga a la vista (y la suspensión baja por eso).
  const cargaVisible = !oculto && rnd() < 0.3;
  e.bed = oculto ? 'dobleFondo' : cargaVisible ? 'conCarga' : 'vacia';
  if (oculto) e.rwheel = rnd() < 0.85 ? 'baja' : 'normal';   // con poca carga escondida, casi no se nota
  else e.rwheel = cargaVisible ? 'bajaConCarga' : 'normal';
  e.fwheel = 'normal';
  f.gapF = 0.095 + rnd() * 0.015;
  f.gapR = e.rwheel === 'normal' ? 0.115 + rnd() * 0.02 : 0.03 + rnd() * 0.015;
  f.dobleFondo = oculto ? 0.10 + Math.round(rnd() * 4) / 100 : 0;   // hasta 14 cm: los pasarruedas siempre asoman un poco
  f.tornillosNuevos = oculto && rnd() < 0.6;

  // Debajo de la caja. Una pieza nueva no siempre es un indicio.
  if (oculto) e.under = sortear(rnd, { soldadura: 55, pintura: 30, normal: 15 });
  else e.under = rnd() < 0.35 ? 'escapeNuevo' : 'normal';

  // Identidad del vehículo
  e.etch = doblada ? (rnd() < 0.75 ? 'distinto' : 'raspado') : 'coincide';
  e.vin = doblada ? 'distinto' : 'coincide';
  e.plate = doblada && rnd() < 0.5 ? 'cambiada' : 'normal';

  // Relato del conductor contra el ticket
  if (oculto) e.ticket = rnd() < 0.6 ? 'contradice' : 'coherente';
  else if (doblada) e.ticket = sortear(rnd, { contradice: 30, coherente: 50, viejo: 20 });
  else e.ticket = rnd() < 0.3 ? 'viejo' : 'coherente';

  // Distractores: siempre normales, pero cambian
  e.rseat = sortear(rnd, { sillita: 1, herramientas: 1, bolsos: 1 });
  e.mate = sortear(rnd, { mate: 1, gorra: 1 });

  let conducta = oculto || doblada ? (rnd() < 0.75 ? 'nervioso' : 'calmo') : (rnd() < 0.15 ? 'nervioso' : 'calmo');

  if (original) { perfil = ORIGINAL.perfil; conducta = ORIGINAL.conducta; Object.assign(e, ORIGINAL.estados); Object.assign(f, ORIGINAL.fisico); }
  const sospechoso = perfil !== 'limpio';

  // Datos para los textos
  const hoy = new Date();
  const hace3 = new Date(hoy.getTime() - 3 * 86400000);
  const B = ESC.base;
  const tickets = {
    coherente:  { lugar: 'Tartagal', fecha: fecha(hoy), hora: '17:52', litros: '61,40' },
    contradice: { lugar: 'Salvador Mazza', fecha: fecha(hoy), hora: '17:40', litros: '58,20' },
    viejo:      { lugar: 'Salvador Mazza', fecha: fecha(hace3), hora: '11:15', litros: '43,75' }
  };
  const t = tickets[e.ticket];
  const cm = v => Math.round(v * 100);
  const datos = {
    dominio: B.dominio, chasis: B.chasis, motor: B.motor, real: B.real.dominio, chasisReal: B.real.chasis,
    grabado: e.etch === 'distinto' ? B.real.dominio : B.dominio,
    chapaChasis: e.vin === 'distinto' ? B.real.chasis : B.chasis,
    ticketLugar: t.lugar, ticketFecha: t.fecha, ticketHora: t.hora, ticketLitros: t.litros,
    gapF: cm(f.gapF), gapR: cm(f.gapR),
    ext: 50, int: 47 - cm(f.dobleFondo), diff: 3 + cm(f.dobleFondo)
  };

  return { semilla, perfil, sospechoso, estados: e, conducta, fisico: f, datos };
}

root.generarCaso = generarCaso;
if (typeof module !== 'undefined' && module.exports) module.exports = { generarCaso };
})(typeof window !== 'undefined' ? window : globalThis);
