/*
 * Geometría de los puntos de revisión para la camioneta del caso (la Hilux de assets/hilux-*.glb).
 * El contenido de cada punto (rótulo, estados, textos, acciones) está en escenario.js; acá va dónde está,
 * desde dónde se revisa y cómo se encuadra de cerca. Todo se calcula a partir de las medidas de la malla
 * (assets/hilux.medidas.js), así que si se cambia la camioneta hay que revisar este archivo y nada más.
 *
 * VEHICULO(M) -> { puntos: { <id>: { p, range, side(pl), vistas, crouch? } }, vistasAccion: {...}, obstaculo, inicio }
 *  p        punto que hay que mirar para que aparezca el botón
 *  range    distancia horizontal máxima desde el jugador
 *  side     de qué lado tiene que estar el jugador (pl = { x, z })
 *  vistas   encuadres de cerca (pos, mira, fov); se usa el más cercano al jugador
 *
 * Coordenadas en metros: la camioneta mira hacia -z, el conductor está en -x y la caja hacia +z.
 */
(function (root) {
'use strict';

function VEHICULO(M) {
  const L = M.limites, A = M.asiento, C = M.caja, ejeD = M.ejes.del, ejeT = M.ejes.tras;
  const izq = pl => pl.x < L.x0 + 0.15, der = pl => pl.x > L.x1 - 0.15;
  const cabeza = [A.conductor[0], A.conductor[1] + 0.75, A.conductor[2] - 0.02];   // la cabeza del conductor sentado
  const tk = M.tablero.ticket.punto, vin = M.tablero.vin.punto, pb = M.parabrisas.punto;
  const zMedioCaja = (C.z0 + C.z1) / 2;
  const puntos = {
    driver: { p: cabeza, range: 2.2, side: izq,
      vistas: [{ pos: [L.x0 - 0.42, cabeza[1] - 0.02, cabeza[2] - 0.18], mira: cabeza, fov: 45 }] },
    // El ticket está del lado del acompañante: se ve por el parabrisas o por la ventanilla de ese lado
    ticket: { p: tk, range: 2.4, side: pl => der(pl) || pl.z < L.z0 - 0.2,
      vistas: [{ pos: [tk[0], 1.72, tk[2] - 0.62], mira: tk, fov: 30 }, { pos: [L.x1 - 0.05, 1.62, tk[2] + 0.4], mira: tk, fov: 32 }] },
    etch: { p: pb, range: 2.6, side: pl => pl.z < M.ejes.del + 0.1,
      vistas: [{ pos: [pb[0] + 0.02, pb[1] + 0.3, pb[2] - 0.42], mira: pb, fov: 28 }] },
    vin: { p: vin, range: 2.4, side: pl => pl.z < M.ejes.del + 0.1 || (izq(pl) && pl.z < -0.5),
      vistas: [{ pos: [vin[0] - 0.02, vin[1] + 0.38, vin[2] - 0.32], mira: vin, fov: 28 }] },
    fwheel: { p: [M.arco.del.x - 0.05, 0.8, ejeD], range: 2.0, side: pl => pl.x < L.x0 + 0.4,
      vistas: [{ pos: [L.x0 - 0.95, 0.95, ejeD], mira: [M.arco.del.x, 0.78, ejeD], fov: 40 }] },
    rwheel: { p: [M.arco.tras.x - 0.05, 0.8, ejeT], range: 2.0, side: pl => pl.x < L.x0 + 0.4,
      vistas: [{ pos: [L.x0 - 0.95, 0.95, ejeT], mira: [M.arco.tras.x, 0.78, ejeT], fov: 40 }] },
    bed: { p: [0, C.yBordeSup - 0.12, zMedioCaja], range: 2.5, side: pl => pl.z > ejeT - 1.0,
      vistas: [{ pos: [L.x0 - 0.35, 2.1, C.z1 + 0.5], mira: [C.x0 + 0.75, C.yPiso, zMedioCaja], fov: 55 }] },
    // Agachado detrás de la rueda trasera izquierda: se ve el larguero por debajo de la pared de la caja
    under: { p: [M.larguero.x, (M.larguero.y0 + M.larguero.y1) / 2, (M.larguero.z0 + M.larguero.z1) / 2], crouch: true, range: 2.7,
      side: pl => pl.z > ejeT + 0.45 || (pl.x < L.x0 && pl.z > ejeT),
      vistas: [{ pos: [L.x0 + 0.06, 0.3, M.larguero.z0 + 0.42], mira: [M.larguero.x, (M.larguero.y0 + M.larguero.y1) / 2, M.larguero.z0 + 0.22], fov: 60 }] },
    plate: { p: M.patente.tras.centro, range: 2.4, side: pl => pl.z > L.z1 - 0.1,
      vistas: [{ pos: [M.patente.tras.centro[0] + 0.05, M.patente.tras.centro[1] + 0.06, L.z1 + 0.6], mira: M.patente.tras.centro, fov: 35 }] },
    // Pegado al vidrio y mirando hacia abajo: así se ve el asiento por encima de la puerta
    rseat: { p: [A.trasero[0] - 0.2, A.trasero[1], A.trasero[2]], range: 2.0, side: izq,
      vistas: [{ pos: [L.x0 + 0.02, 1.62, A.trasero[2] + 0.02], mira: [A.trasero[0] - 0.1, A.trasero[1] - 0.12, A.trasero[2] - 0.02], fov: 55 }] },
    mate: { p: A.acompanante, range: 2.0, side: der,
      vistas: [{ pos: [L.x1 - 0.02, 1.6, A.acompanante[2] - 0.06], mira: [A.acompanante[0] - 0.05, A.acompanante[1] - 0.1, A.acompanante[2]], fov: 55 }] }
  };
  // Encuadres de algunas acciones (mirar la ballesta, medir la caja)
  const tapaZ = C.zExt, cintaInt = [C.xCinta, C.z1 - 0.2];
  const vistasAccion = {
    // Desde atrás de la rueda, bajo: la ballesta entre la rueda y el chasis
    ballesta: { pos: [M.ballesta.izq.x + 0.28, 0.24, ejeT + 0.45], mira: [M.ballesta.izq.x, M.ballesta.izq.yAncla, ejeT - 0.05], fov: 60 },
    interior: { pos: [C.x1 - 0.1, 1.75, cintaInt[1]], mira: [cintaInt[0], (C.yPiso + C.yBordeSup) / 2, cintaInt[1]], fov: 45 },
    exterior: { pos: [-0.95, 1.05, tapaZ + 0.95], mira: [-0.45, (C.yBordeInfExt + C.yTopePorton) / 2, tapaZ], fov: 45 },
    piso: { pos: [-0.35, 1.72, zMedioCaja + 0.45], mira: [0.05, C.yPiso, zMedioCaja - 0.1], fov: 45 }
  };
  // Para las colisiones del jugador: la huella de la carrocería
  const obstaculo = { x0: L.x0 - 0.02, x1: L.x1 + 0.02, z0: L.z0 - 0.02, z1: L.z1 + 0.02 };
  return { puntos, vistasAccion, obstaculo };
}

root.VEHICULO = VEHICULO;
if (typeof module !== 'undefined' && module.exports) module.exports = VEHICULO;
})(typeof window !== 'undefined' ? window : globalThis);
