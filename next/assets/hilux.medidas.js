/* Medidas de la Hilux tomadas de la malla (generado por tools/assets/medir-hilux.mjs; no editar a mano).
 * Metros, coordenadas de la camioneta sin inclinar: mira hacia -z, el conductor en -x, el piso en y = 0
 * y el centro entre ejes en z = 0. Las usan caso.js, el motor (cinta, cabina, piezas agregadas) y las pruebas. */
(function (root) {
const VEHICULO_MEDIDAS = {
 "ejes": {
  "del": -1.498,
  "tras": 1.497
 },
 "trocha": {
  "del": 0.765,
  "tras": 0.763
 },
 "radioRueda": 0.372,
 "arco": {
  "del": {
   "yBorde": 0.863,
   "x": -0.895,
   "luzNominal": 0.12
  },
  "tras": {
   "yBorde": 0.854,
   "x": -0.868,
   "luzNominal": 0.111
  }
 },
 "caja": {
  "yBordeSup": 1.24,
  "yBordeInfExt": 0.712,
  "yTopePorton": 1.24,
  "yPiso": 0.778,
  "xCinta": -0.491,
  "yTechoPasarruedas": 1.008,
  "z0": 1.034,
  "z1": 2.557,
  "x0": -0.799,
  "x1": 0.801,
  "zExt": 2.659,
  "zMedida": 2.247
 },
 "larguero": {
  "x": -0.555,
  "y0": 0.616,
  "y1": 0.696,
  "z0": 1.797,
  "z1": 2.334
 },
 "limites": {
  "x0": -1.006,
  "x1": 1.009,
  "z0": -2.458,
  "z1": 2.718
 },
 "volante": {
  "centro": [
   -0.365,
   1.18,
   -0.603
  ],
  "radio": 0.152,
  "normal": [
   0.001,
   0.389,
   0.921
  ]
 },
 "asiento": {
  "conductor": [
   -0.365,
   0.857,
   -0.089
  ],
  "acompanante": [
   0.365,
   0.857,
   -0.089
  ],
  "trasero": [
   0,
   1.082,
   0.481
  ]
 },
 "espejo": [
  0,
  1.583,
  -0.562
 ],
 "espejoLateral": [
  -0.926,
  1.21,
  -0.813
 ],
 "patente": {
  "tras": {
   "centro": [
    -0.001,
    0.596,
    2.525
   ],
   "normal": [
    0,
    0,
    1
   ]
  },
  "del": {
   "centro": [
    -0.001,
    0.596,
    -2.455
   ],
   "normal": [
    0,
    0,
    -1
   ]
  }
 },
 "parabrisas": {
  "punto": [
   0.415,
   1.33,
   -1.099
  ],
  "normal": [
   -0.116,
   -0.811,
   0.573
  ]
 },
 "tablero": {
  "vin": {
   "punto": [
    -0.485,
    1.332,
    -0.803
   ],
   "normal": [
    -0.213,
    0.974,
    -0.074
   ]
  },
  "ticket": {
   "punto": [
    0.3,
    1.258,
    -0.783
   ],
   "normal": [
    0.064,
    0.926,
    0.372
   ]
  }
 },
 "escape": {
  "centro": [
   0.377,
   0.518,
   1.133
  ]
 },
 "tanque": {
  "centro": [
   -0.286,
   0.602,
   0.622
  ]
 },
 "ballesta": {
  "izq": {
   "x": -0.505,
   "zDel": 0.97,
   "zTras": 2.124,
   "yAncla": 0.454
  },
  "der": {
   "x": 0.545,
   "zDel": 0.97,
   "zTras": 2.124,
   "yAncla": 0.454
  }
 }
};
root.VEHICULO_MEDIDAS = VEHICULO_MEDIDAS;
if (typeof module !== 'undefined' && module.exports) module.exports = VEHICULO_MEDIDAS;
})(typeof window !== 'undefined' ? window : globalThis);
