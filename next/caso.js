/*
 * Reglas del caso: en cada partida decide qué pasa realmente con la camioneta y en qué
 * estado queda cada punto de ESCENARIO.pois. Es determinístico a partir de una semilla,
 * así que el mismo número de caso siempre arma la misma camioneta.
 *
 *   generarCaso(ESCENARIO, MEDIDAS, { semilla, perfil })   semilla: número | 'original'
 *
 * MEDIDAS son las del modelo 3D (assets/hilux.medidas.js): la luz de cada eje y las medidas de la
 * caja salen de la malla, así lo que se mide con la cinta coincide con lo que se ve.
 * Devuelve { semilla, perfil, sospechoso, estados, conducta, fisico, datos }.
 *  estados   estado de cada punto (claves de ESCENARIO.pois[].estados)
 *  conducta  'calmo' | 'nervioso'
 *  fisico    parámetros que usa el motor para armar la camioneta (luz de cada eje, doble fondo...)
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
// La luz de los ejes se da como diferencia con la nominal del modelo.
const ORIGINAL = {
  perfil: 'completo', conducta: 'nervioso',
  estados: { ticket: 'contradice', etch: 'distinto', vin: 'distinto', fwheel: 'normal', rwheel: 'baja', bed: 'dobleFondo',
             under: 'soldadura', plate: 'normal', rseat: 'sillita', mate: 'mate' },
  fisico: { difF: 0, difR: -0.075, dobleFondo: 0.12, tornillosNuevos: false }
};

function generarCaso(ESC, M, opts) {
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
  // Luz entre guardabarros y cubierta: la nominal del modelo, con una variación chica; baja es de 6 a 9 cm menos
  const nomF = M.arco.del.luzNominal, nomR = M.arco.tras.luzNominal;
  f.gapF = nomF + (rnd() - 0.5) * 0.015;
  f.gapR = e.rwheel === 'normal' ? nomR + (rnd() - 0.5) * 0.015 : Math.max(0.006, nomR - 0.06 - rnd() * 0.03);
  // Doble fondo de 10 a 14 cm, pero nunca tan alto que tape los pasarruedas: siempre asoman al menos 1 cm
  const maxFondo = Math.floor((M.caja.yTechoPasarruedas - M.caja.yPiso - 0.01) * 100) / 100;
  f.dobleFondo = oculto ? Math.min(maxFondo, 0.10 + Math.round(rnd() * 4) / 100) : 0;
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

  if (original) {
    perfil = ORIGINAL.perfil; conducta = ORIGINAL.conducta; Object.assign(e, ORIGINAL.estados);
    const o = ORIGINAL.fisico;
    Object.assign(f, { gapF: nomF + o.difF, gapR: Math.max(0.006, nomR + o.difR), dobleFondo: Math.min(maxFondo, o.dobleFondo), tornillosNuevos: o.tornillosNuevos });
  }
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
    // Caja: por fuera, del borde inferior de la pared al borde superior; por dentro, del piso al borde superior
    ext: cm(M.caja.yBordeSup - M.caja.yBordeInfExt),
    int: cm(M.caja.yBordeSup - M.caja.yPiso) - cm(f.dobleFondo)
  };
  datos.diff = datos.ext - datos.int;

  return { semilla, perfil, sospechoso, estados: e, conducta, fisico: f, datos };
}

root.generarCaso = generarCaso;
if (typeof module !== 'undefined' && module.exports) module.exports = { generarCaso };
})(typeof window !== 'undefined' ? window : globalThis);
