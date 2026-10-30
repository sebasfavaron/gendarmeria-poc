/*
 * El lugar: cielo HDRI (fondo e iluminación), suelo con texturas reales, garita, cartel, barrera,
 * conos, vegetación, el reflector del puesto y la linterna del gendarme.
 *   armarEscena(recursos, calidad) -> { reflector, linterna, luzLinterna, actualizar(dt, tiempo) }
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, camera, renderer, std, glow, box, canvasTex, noiseRnd, sombras } from './nucleo.js';

/* ---------- Luz ---------- */
// La foto del cielo es de un atardecer con el sol todavía arriba: a las 19:50 ya se puso, así que
// la luz del cielo se baja hasta que el reflector del puesto sea la luz principal.
export const LUZ = {
  cielo: 0.06,        // intensidad de la iluminación del cielo
  fondo: 0.08,        // brillo del cielo visible (algo más que la luz: el ojo lo ve más claro que la cámara)
  reflector: 260,     // candelas del reflector del puesto
  linterna: 6,        // candelas de la linterna en el centro del haz (más, y de cerca la chapa blanca encandila)
  exposicion: 1.0
};

let metaCielo = null, flood = null;
function cielo(recursos) {
  const luz = recursos.get('cielo.luz'), fondo = recursos.get('cielo.fondo');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(luz.valor).texture;
  pmrem.dispose(); luz.valor.dispose();
  fondo.valor.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = fondo.valor;
  metaCielo = fondo.meta;
  scene.environmentRotation.y = metaCielo.giro;
  scene.backgroundRotation.y = metaCielo.giro;
  scene.fog = new THREE.Fog(0x000000, 60, 520);
}
// Pide recalcular la sombra del reflector (después de cambiar lo que hay debajo de él)
export function recalcularSombras() { if (flood) flood.shadow.needsUpdate = true; }
// Aplica LUZ a la escena (se puede volver a llamar para ajustar en vivo desde __dbg)
export function aplicarLuz() {
  scene.environmentIntensity = LUZ.cielo;
  scene.backgroundIntensity = LUZ.fondo / metaCielo.escala;
  // Niebla del color del horizonte, con la misma intensidad que el fondo
  const h = metaCielo.horizonte.map(v => v * LUZ.fondo);
  scene.fog.color.setRGB(h[0], h[1], h[2], THREE.LinearSRGBColorSpace);
  if (flood) flood.intensity = LUZ.reflector;
  renderer.toneMappingExposure = LUZ.exposicion;
}

/* ---------- Suelo ---------- */
// Material PBR de Poly Haven repetido a escala real: lado = metros que cubre una repetición
function pbr(recursos, nombre, lado, ancho, largo, o) {
  const t = k => recursos.get(`tex.${nombre}.${k}`).valor;
  const color = t('color'), normal = t('normal'), arm = t('arm');
  [color, normal, arm].forEach(x => { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(ancho / lado, largo / lado); });
  return new THREE.MeshStandardMaterial(Object.assign({ map: color, normalMap: normal, aoMap: arm, roughnessMap: arm, roughness: 1, metalness: 0 }, o || {}));
}
function piso(w, l, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
}
// Pintura vial gastada: una textura de ruido como transparencia para que no se vea como una cinta
const pinturaGastada = canvasTex(64, 512, (x, w, h) => {
  const r = noiseRnd(41);
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2200; i++) { const v = r(); x.fillStyle = `rgba(0,0,0,${0.15 + v * 0.6})`; x.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 4); }
}, true);
pinturaGastada.wrapS = pinturaGastada.wrapT = THREE.RepeatWrapping;
function pintura(color, w, l, x, z) {
  const t = pinturaGastada.clone(); t.repeat.set(1, l / 2);
  const m = std(color, { roughness: 0.7, alphaMap: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  return piso(w, l, m, x, 0.004, z);
}

function suelo(recursos) {
  piso(900, 900, pbr(recursos, 'monte', 2, 900, 900), 0, -0.03, 0);                 // monte
  piso(8, 420, pbr(recursos, 'asfalto', 3, 8, 420), -2, 0, 0);                      // calzada (x de -6 a 2)
  piso(2.8, 420, pbr(recursos, 'banquina', 2, 2.8, 420), 3.4, -0.01, 0);           // banquina de ripio
  pintura(0xe8e6dc, 0.12, 420, 1.88, 0);
  pintura(0xe8e6dc, 0.12, 420, -5.88, 0);
  for (let z = -200; z <= 200; z += 9) pintura(0xe3bf3c, 0.12, 3, -2, z);
}

/* ---------- Vegetación y cerros ---------- */
// Cada planta es un "impostor": la foto de un árbol de Poly Haven en dos planos cruzados (ver tools/assets/vegetacion.mjs).
// Un InstancedMesh por variante: cientos de plantas en pocas llamadas de dibujo.
function cruz(lado, u0, u1) {
  const a = new THREE.PlaneGeometry(lado, lado), b = new THREE.PlaneGeometry(lado, lado);
  b.rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b]);
  g.translate(0, lado / 2, 0);
  const uv = g.attributes.uv, nor = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) { uv.setX(i, u0 + uv.getX(i) * (u1 - u0)); nor.setXYZ(i, 0, 1, 0); }   // normales hacia arriba: luz pareja como el follaje
  return g;
}
function plantas(recursos, nombre, cuantas, escala, lugar, rnd) {
  const r = recursos.get(`obj.${nombre}.color`), vars = r.meta.variantes, n = vars.length;
  const mat = std(0xffffff, { map: r.valor, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  vars.forEach((v, i) => {
    const k = Math.round(cuantas / n);
    const inst = new THREE.InstancedMesh(cruz(v.lado, i / n, (i + 1) / n), mat, k);
    for (let j = 0; j < k; j++) {
      const [x, z] = lugar(rnd), e = escala[0] + rnd() * (escala[1] - escala[0]);
      q.setFromAxisAngle(up, rnd() * Math.PI); s.set(e, e * (0.9 + rnd() * 0.2), e); p.set(x, -0.02, z);
      inst.setMatrixAt(j, m.compose(p, q, s));
    }
    inst.frustumCulled = false;
    scene.add(inst);
  });
}
function vegetacion(recursos, calidad) {
  const r = noiseRnd(3), k = calidad.vegetacion;
  const lado = rnd => (rnd() < 0.5 ? 1 : -1);
  // Monte: árboles a los dos lados de la ruta, más tupidos lejos del puesto
  const monte = rnd => { const sd = lado(rnd); return [sd > 0 ? 10 + rnd() * 70 : -9 - rnd() * 70, -200 + rnd() * 360]; };
  plantas(recursos, 'arbol2', 220 * k, [2.2, 3.2], monte, r);
  plantas(recursos, 'arbol1', 260 * k, [1.8, 2.8], monte, r);
  // Arbustos secos más cerca de la banquina, fuera del puesto y de la camioneta de Gendarmería
  const borde = rnd => { const sd = lado(rnd); return [sd > 0 ? 8.5 + rnd() * 6 : -7.2 - rnd() * 6, -120 + rnd() * 220]; };
  plantas(recursos, 'arbusto', 360 * k, [0.8, 1.3], borde, r);
  scene.add(sierras());
}

// Sierras lejanas: un anillo con alturas de ruido suave (al este, la serranía del Aguaragüe es la más alta)
function sierras() {
  const N = 256, R = 380, pos = [], idx = [];
  const r = noiseRnd(17), fases = [0, 1, 2, 3].map(() => r() * Math.PI * 2);
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2;
    const este = Math.max(0, -Math.cos(a));                       // -x es el este
    const h = 10 + 22 * este + 9 * Math.sin(a * 3 + fases[0]) + 6 * Math.sin(a * 7 + fases[1]) + 3 * Math.sin(a * 17 + fases[2]) + 1.5 * Math.sin(a * 41 + fases[3]);
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    pos.push(x, -2, z, x, Math.max(4, h), z);
    if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, std(0x1f2530, { roughness: 1, side: THREE.DoubleSide }));
}

/* ---------- Puesto ---------- */
function garita(recursos) {
  const g = new THREE.Group();
  // Paredes revocadas y pintadas, con zócalo verde; techo de chapa acanalada con alero
  const revoque = pbr(recursos, 'revoque', 2, 1, 1);
  const zocalo = revoque.clone(); zocalo.color = new THREE.Color(0x3c6a3e);
  box(g, [2.2, 2.4, 2.2], [0, 1.2, 0], revoque);
  box(g, [2.24, 0.42, 2.24], [0, 0.21, 0], zocalo);
  box(g, [2.24, 0.12, 2.24], [0, 0.95, 0], zocalo);
  const chapa = pbr(recursos, 'chapa', 1.12, 2.8, 2.8, { metalness: 1, metalnessMap: recursos.get('tex.chapa.arm').valor, color: 0xb7bcc2 });
  const techo = box(g, [2.8, 0.03, 2.8], [0, 2.5, 0], chapa); techo.rotation.z = 0.06;
  box(g, [0.05, 0.75, 1.4], [-1.11, 1.6, 0], glow(0xffc77a, 0.45));     // ventana con luz adentro
  box(g, [0.06, 0.06, 1.5], [-1.12, 1.98, 0], std(0x2a2d31, { roughness: 0.5, metalness: 0.7 }));   // marco
  box(g, [0.06, 0.06, 1.5], [-1.12, 1.22, 0], std(0x2a2d31, { roughness: 0.5, metalness: 0.7 }));
  box(g, [0.9, 2.0, 0.05], [0.4, 1.0, 1.11], std(0x5a4632, { roughness: 0.7 }));                    // puerta
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), std(0xffffff, {
    roughness: 0.5,
    map: canvasTex(512, 138, (x, w, h) => {
      x.fillStyle = '#2f5130'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = 'bold 46px Arial'; x.fillText('GENDARMERÍA NACIONAL', w / 2, 62);
      x.font = '30px Arial'; x.fillText('Puesto de control', w / 2, 108);
    })
  }));
  sign.position.set(-1.12, 2.95, 0); sign.rotation.y = -Math.PI / 2; g.add(sign);
  const poste = std(0x5b6270, { roughness: 0.5, metalness: 0.6 });
  box(g, [0.08, 0.6, 0.08], [-1.1, 2.6, 0.9], poste);
  box(g, [0.08, 0.6, 0.08], [-1.1, 2.6, -0.9], poste);
  g.position.set(6, 0, -3);
  scene.add(sombras(g, true, true));
}
// Barreras de hormigón al costado del puesto. Devuelve sus cajas para las colisiones.
function barrerasHormigon(recursos) {
  const modelo = recursos.get('obj.barrera').valor.scene, cajas = [];
  const caja = new THREE.Box3().setFromObject(modelo), tam = caja.getSize(new THREE.Vector3());
  const giro = tam.x > tam.z ? Math.PI / 2 : 0;    // el lado largo a lo largo de la ruta
  [[4.95, 0.6], [4.95, 2.25], [4.95, 3.9]].forEach(([x, z], i) => {
    const b = modelo.clone(true);
    b.rotation.y = giro + (i - 1) * 0.03; b.position.set(x, -caja.min.y, z);
    scene.add(sombras(b, true, true));
    const largo = Math.max(tam.x, tam.z) / 2, ancho = Math.min(tam.x, tam.z) / 2;
    cajas.push({ x0: x - ancho, x1: x + ancho, z0: z - largo, z1: z + largo });
  });
  return cajas;
}
function cartelPare() {
  const g = new THREE.Group();
  box(g, [0.08, 2.1, 0.08], [0, 1.05, 0], std(0x8a8f96, { roughness: 0.4, metalness: 0.7 }));
  const tex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#b71c1c'; x.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; x.lineTo(w / 2 + Math.cos(a) * 124, h / 2 + Math.sin(a) * 124); }
    x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 8; x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 76px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('PARE', w / 2, h / 2 - 12);
    x.font = 'bold 26px Arial'; x.fillText('CONTROL', w / 2, h / 2 + 50);
  });
  // Lámina retrorreflectiva: un poco de brillo propio para que se lea como de noche con luces
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), std(0xffffff, { map: tex, transparent: true, roughness: 0.35, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 }));
  s.position.set(0, 2.2, 0.05); g.add(s);
  g.position.set(2.6, 0, -20); scene.add(sombras(g, true, false));
}
function barrera() {
  box(scene, [0.2, 1.1, 0.2], [2.4, 0.55, -6], std(0x8a8f96, { roughness: 0.5, metalness: 0.6 })).castShadow = true;
  const stripes = canvasTex(256, 16, (x, w, h) => { for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#f4f4f0' : '#c62828'; x.fillRect(i * 16, 0, 16, h); } });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.09, 0.09), std(0xffffff, { map: stripes, roughness: 0.45 }));
  pole.position.set(0.2, 1.0, -6); pole.castShadow = true; scene.add(pole);
}
function conos() {
  const cm = std(0xff5a12, { roughness: 0.55 }), bm = std(0xf4f4f0, { roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.05 }), base = std(0x1a1a1a, { roughness: 0.9 });
  const geo = [new THREE.ConeGeometry(0.17, 0.55, 20), new THREE.CylinderGeometry(0.066, 0.093, 0.09, 20), new THREE.BoxGeometry(0.36, 0.04, 0.36)];
  const cone = (x, z) => {
    const g = new THREE.Group();
    const c = new THREE.Mesh(geo[0], cm); c.position.y = 0.3; g.add(c);
    const b = new THREE.Mesh(geo[1], bm); b.position.y = 0.33; g.add(b);
    const s = new THREE.Mesh(geo[2], base); s.position.y = 0.02; g.add(s);
    g.position.set(x, 0, z); scene.add(sombras(g, true, true));
  };
  for (let z = -16; z <= 22; z += 3.4) cone(-2.05, z);
  [-9, -12, -15, 16, 19].forEach(z => cone(1.9, z));
}

/* ---------- Compañero ---------- */
// Gendarme parado junto a la garita (Rocketbox, recoloreado al verde de Gendarmería), con una animación de espera
function companero(recursos) {
  const g = recursos.get('companero').valor.scene;
  g.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false; } });
  g.position.set(4.55, 0, -1.25); g.rotation.y = -Math.PI / 2 - 0.35;    // mira hacia la ruta y la camioneta
  scene.add(g);
  const mixer = new THREE.AnimationMixer(g);
  const clip = recursos.get('anim.espera').valor.animations[0];
  if (clip) mixer.clipAction(clip).play();
  return mixer;
}

/* ---------- Luces del puesto y del gendarme ---------- */
function reflector(calidad) {
  box(scene, [0.14, 7, 0.14], [3.3, 3.5, -1.5], std(0x5b6270, { roughness: 0.5, metalness: 0.6 })).castShadow = true;
  box(scene, [0.6, 0.2, 0.3], [3.05, 6.95, -1.5], glow(0xfff1d6, 6));
  flood = new THREE.SpotLight(0xfff1d6, LUZ.reflector, 40, 0.82, 0.55, 2);
  flood.position.set(3.0, 6.9, -1.5); flood.target.position.set(-0.6, 0, 0.1);
  flood.castShadow = true;
  flood.shadow.mapSize.set(calidad.sombraReflector, calidad.sombraReflector);
  flood.shadow.camera.near = 2; flood.shadow.camera.far = 24;
  flood.shadow.bias = -0.0004; flood.shadow.normalBias = 0.02; flood.shadow.radius = calidad.radioSombra;
  // La escena bajo el reflector casi no se mueve: la sombra se recalcula solo cuando cambia (camioneta nueva)
  flood.shadow.autoUpdate = false; flood.shadow.needsUpdate = true;
  scene.add(flood, flood.target);
  return flood;
}
function linterna(calidad) {
  const torch = new THREE.SpotLight(0xfff4e0, 0, 9, 0.45, 0.65, 2);
  torch.position.set(0.12, -0.12, 0);
  torch.target.position.set(0, 0, -1);
  torch.castShadow = false;   // solo proyecta sombra prendida (ver setTorch): apagada no cuesta nada
  torch.shadow.mapSize.set(calidad.sombraLinterna, calidad.sombraLinterna);
  torch.shadow.camera.near = 0.1; torch.shadow.camera.far = 9;
  torch.shadow.bias = -0.0005; torch.shadow.normalBias = 0.015; torch.shadow.radius = calidad.radioSombra;
  camera.add(torch, torch.target);
  return torch;
}

export function armarEscena(recursos, calidad) {
  cielo(recursos);
  suelo(recursos);
  vegetacion(recursos, calidad);
  garita(recursos); cartelPare(); barrera(); conos();
  const obstaculos = barrerasHormigon(recursos);
  reflector(calidad);
  const torch = linterna(calidad);
  aplicarLuz();
  const mixer = companero(recursos);
  return { reflector: flood, linterna: torch, intensidadLinterna: LUZ.linterna, obstaculos, actualizar(dt) { mixer.update(dt); } };
}
