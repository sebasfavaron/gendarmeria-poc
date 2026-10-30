/*
 * Nivel de calidad: 'alta' para computadoras, 'liviana' para celulares y equipos con poca memoria.
 * ?calidad=alta o ?calidad=liviana lo fuerzan. Cada nivel descarga solo sus assets.
 */
const PARAMETROS = {
  alta: {
    carpeta: 'alta', texturas: 2048, antialias: true, resolucionMax: 2,
    sombraReflector: 2048, sombraLinterna: 1024, radioSombra: 3, vegetacion: 1
  },
  liviana: {
    carpeta: 'liviana', texturas: 1024, antialias: false, resolucionMax: 1.5,
    sombraReflector: 1024, sombraLinterna: 512, radioSombra: 1.5, vegetacion: 0.5
  }
};

function elegir() {
  // dist/ (un solo archivo) trae un único nivel adentro
  if (window.__ASSETS) return window.__ASSETS.nivel;
  const forzado = new URLSearchParams(location.search).get('calidad');
  if (PARAMETROS[forzado]) return forzado;
  const tactil = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const ladoMayor = Math.max(screen.width || 0, screen.height || 0);
  const memoria = navigator.deviceMemory;   // solo Chrome; en otros navegadores no se sabe
  if ((tactil && ladoMayor < 1400) || (memoria && memoria <= 4)) return 'liviana';
  return 'alta';
}

export const nivel = elegir();
export const parametros = PARAMETROS[nivel];
