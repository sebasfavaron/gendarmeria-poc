/*
 * POC Puesto de control en ruta (Gendarmería Nacional)
 * Motor del simulador: escena 3D, jugador, detección de puntos de interés, UI y puntaje.
 * El contenido del caso se define en escenario.js (window.ESCENARIO) y las reglas que arman
 * cada partida en caso.js (window.generarCaso). La camioneta se construye a partir del caso:
 * lo que se ve, se mide y se escucha sale del mismo modelo.
 * Depende de three.js r128 cargado como script global (vendor/three.min.js).
 */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const ESC = window.ESCENARIO;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
let time = 0;
let CASE = null;

/* =========================================================
   ESCENA
   ========================================================= */
const canvas = $('#scene');
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { renderer = null; }
if (renderer) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; }
const scene = new THREE.Scene();
const FOG = 0x6f6a7c;
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.Fog(FOG, 35, 240);
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 520);
camera.rotation.order = 'YXZ';
scene.add(camera);

const lam = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
const phong = (c, o) => new THREE.MeshPhongMaterial(Object.assign({ color: c, shininess: 12, specular: 0x222222 }, o || {}));
const basic = c => new THREE.MeshBasicMaterial({ color: c });
// UV en escala de mundo: la textura no se estira en piezas largas (largueros, paragolpes)
function worldUV(g, k) {
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i));
    const a = ax > 0.5 ? pos.getZ(i) : pos.getX(i), b = ay > 0.5 ? pos.getZ(i) : pos.getY(i);
    uv.setXY(i, a * k, b * k);
  }
  uv.needsUpdate = true;
  return g;
}
function box(parent, size, pos, mat) {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  if (mat.userData.wuv) worldUV(geo, mat.userData.wuv);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  parent.add(m);
  return m;
}
function cyl(parent, rTop, rBot, h, seg, pos, mat, rot) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m);
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (renderer) t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}
// Ruido determinístico para texturas (no depende de la semilla del caso)
function noiseRnd(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

// Cielo después de la puesta del sol (19:50)
(() => {
  const R = 450, geo = new THREE.SphereGeometry(R, 32, 16), pos = geo.attributes.position, cols = [];
  const top = new THREE.Color(0x141d38), mid = new THREE.Color(0x4e5784), hor = new THREE.Color(0xd9875a), low = new THREE.Color(0x5d5868);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / R; let c;
    if (y > 0.3) c = mid.clone().lerp(top, (y - 0.3) / 0.7);
    else if (y > 0.015) c = hor.clone().lerp(mid, (y - 0.015) / 0.285);
    else c = low.clone().lerp(hor, Math.max(0, (y + 0.1) / 0.115));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  scene.userData.sky = sky;
})();

// Luz de crepúsculo: cielo frío arriba, poco rebote del suelo y un resto de luz cálida en el horizonte
scene.add(new THREE.HemisphereLight(0x9aa6c8, 0x2b2620, 0.62));
scene.add(new THREE.AmbientLight(0xffffff, 0.12));
const dusk = new THREE.DirectionalLight(0xffcfa8, 0.16);
dusk.position.set(-40, 8, 25);
scene.add(dusk);

function plane(w, l, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); return m;
}
const asphaltTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#4a4c50'; x.fillRect(0, 0, w, h);
  const r = noiseRnd(7);
  for (let i = 0; i < 2600; i++) { const v = 40 + r() * 40 | 0; x.fillStyle = `rgba(${v},${v},${v + 4},.55)`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping; asphaltTex.repeat.set(3, 120);
plane(600, 600, lam(0x46552f), 0, -0.03, 0);                                   // monte
plane(8, 320, phong(0xffffff, { map: asphaltTex, shininess: 4 }), -2, 0, 0);    // calzada (x -6 a 2)
plane(2.6, 320, phong(0x6a5f4e, { shininess: 2 }), 3.3, 0.01, 0);              // banquina de ripio
plane(0.14, 320, phong(0xd9d9d0), 1.9, 0.02, 0);
plane(0.14, 320, phong(0xd9d9d0), -5.9, 0.02, 0);
for (let z = -160; z <= 160; z += 9) plane(0.13, 3, phong(0xe0c64a), -2, 0.02, z);

// Vegetación y cerros
(() => {
  const N = 110;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1.8, 6), lam(0x3f2f22), N);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.7, 0), lam(0x2f4a26), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const r = noiseRnd(3);
  for (let i = 0; i < N; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side > 0 ? 11 + r() * 55 : -12 - r() * 55;
    const z = -170 + r() * 240;
    const k = 0.8 + r() * 1.0;
    s.set(k, k, k); p.set(x, 0.9 * k, z); m.compose(p, q, s); trunks.setMatrixAt(i, m);
    s.set(k * (0.9 + r() * 0.4), k * 0.8, k); p.set(x, 2.6 * k, z); m.compose(p, q, s); crowns.setMatrixAt(i, m);
  }
  scene.add(trunks, crowns);
  const hillMat = lam(0x39445a);
  [[-140, -230, 70, 45], [-60, -250, 60, 38], [20, -240, 80, 52], [110, -230, 65, 40], [180, -200, 55, 34], [-200, -180, 50, 30]]
    .forEach(([x, z, r2, h]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r2, h, 7), hillMat); c.position.set(x, h / 2 - 2, z); scene.add(c); });
})();

function plateTex(text, dirty) {
  return canvasTex(512, 160, (x, w, h) => {
    x.fillStyle = '#ebe8de'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1d3f9a'; x.fillRect(0, 0, w, 36);
    x.fillStyle = '#fff'; x.font = 'bold 22px Arial'; x.textAlign = 'center'; x.fillText('REPÚBLICA ARGENTINA', w / 2, 26);
    x.fillStyle = '#1a1a1a'; x.font = 'bold 88px Arial'; x.fillText(text, w / 2, 132);
    x.strokeStyle = '#222'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
    if (dirty) {
      const r = noiseRnd(11);
      for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(110,90,60,${0.05 + r() * 0.12})`; x.fillRect(r() * w, h * 0.35 + r() * h * 0.65, 2 + r() * 6, 2 + r() * 4); }
    }
  });
}
function mudTex(base, seed) {
  const t = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const r = noiseRnd(seed || 5);
    // Polvo fino y algunas manchas suaves
    for (let i = 0; i < 1400; i++) {
      const v = r(); x.fillStyle = v > 0.5 ? `rgba(150,128,96,${0.05 + r() * 0.1})` : `rgba(25,20,15,${0.05 + r() * 0.1})`;
      x.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    for (let i = 0; i < 14; i++) {
      const cx = r() * w, cy = r() * h, rad = 6 + r() * 14, g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, `rgba(${r() > 0.5 ? '120,100,72' : '30,24,18'},.18)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Garita y cartel
(() => {
  const g = new THREE.Group();
  box(g, [2.2, 2.4, 2.2], [0, 1.2, 0], phong(0xd9d4c7));
  box(g, [2.24, 0.3, 2.24], [0, 0.9, 0], phong(0x2f5130));
  box(g, [2.6, 0.12, 2.6], [0, 2.46, 0], phong(0x3a3d42));
  box(g, [0.04, 0.7, 1.4], [-1.11, 1.6, 0], basic(0xe8d9a8));    // ventana con luz adentro
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), new THREE.MeshBasicMaterial({
    map: canvasTex(512, 138, (x, w, h) => {
      x.fillStyle = '#2f5130'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = 'bold 46px Arial'; x.fillText('GENDARMERÍA NACIONAL', w / 2, 62);
      x.font = '30px Arial'; x.fillText('Puesto de control', w / 2, 108);
    })
  }));
  sign.position.set(-1.12, 2.95, 0); sign.rotation.y = -Math.PI / 2; g.add(sign);
  box(g, [0.08, 0.6, 0.08], [-1.1, 2.6, 0.9], lam(0x5b6270));
  box(g, [0.08, 0.6, 0.08], [-1.1, 2.6, -0.9], lam(0x5b6270));
  g.position.set(6, 0, -3);
  scene.add(g);
})();

// Cartel de PARE antes del puesto
(() => {
  const g = new THREE.Group();
  box(g, [0.08, 2.1, 0.08], [0, 1.05, 0], lam(0x8a8f96));
  const tex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#b71c1c'; x.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; x.lineTo(w / 2 + Math.cos(a) * 124, h / 2 + Math.sin(a) * 124); }
    x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 8; x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 76px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('PARE', w / 2, h / 2 - 12);
    x.font = 'bold 26px Arial'; x.fillText('CONTROL', w / 2, h / 2 + 50);
  });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  s.position.set(0, 2.2, 0.05); g.add(s);
  g.position.set(2.6, 0, -20); scene.add(g);
})();

// Barrera
(() => {
  box(scene, [0.2, 1.1, 0.2], [2.4, 0.55, -6], phong(0x8a8f96));
  const stripes = canvasTex(256, 16, (x, w, h) => { for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#f4f4f0' : '#c62828'; x.fillRect(i * 16, 0, 16, h); } });
  const pole = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.09, 0.09), new THREE.MeshPhongMaterial({ map: stripes }));
  pole.position.set(0.2, 1.0, -6); scene.add(pole);
})();

// Conos
(() => {
  const cm = phong(0xff6b1f, { emissive: 0x2a0e00 }), bm = phong(0xf4f4f0, { emissive: 0x222222 }), base = lam(0x1a1a1a);
  const cone = (x, z) => {
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.55, 14), cm); c.position.y = 0.3; g.add(c);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.093, 0.09, 14), bm); b.position.y = 0.33; g.add(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.36), base); s.position.y = 0.02; g.add(s);
    g.position.set(x, 0, z); scene.add(g);
  };
  for (let z = -16; z <= 22; z += 3.4) cone(-2.05, z);
  [-9, -12, -15, 16, 19].forEach(z => cone(1.9, z));
})();

// Reflector del puesto: ya es casi de noche y es la luz principal sobre la camioneta
box(scene, [0.14, 7, 0.14], [3.3, 3.5, -1.5], lam(0x5b6270));
box(scene, [0.6, 0.2, 0.3], [3.05, 6.95, -1.5], basic(0xfff1d6));
const flood = new THREE.SpotLight(0xfff1d6, 0.9, 34, 0.75, 0.55, 1);
flood.position.set(3.0, 6.9, -1.5); flood.target.position.set(-0.4, 0, 0.6);
scene.add(flood, flood.target);

// Linterna del gendarme: sigue a la cámara
const torch = new THREE.SpotLight(0xfff4e0, 0, 7, 0.4, 0.5, 1);
torch.position.set(0.12, -0.12, 0);
torch.target.position.set(0, 0, -1);
camera.add(torch, torch.target);
const TORCH = 1.1;

/* ---------- Camionetas ---------- */
/*
 * Medidas del modelo (coordenadas del cuerpo, antes de inclinarlo):
 *  ruedas de radio 0,4 m con centro a 0,4 m del piso, en z = FZ (delantera) y RZ (trasera)
 *  pasaruedas con centro a la altura del eje y radio ARCH: con el cuerpo en su lugar dejan 10 cm de luz
 *  caja: paredes de BED.wall0 a BED.top (50 cm por fuera) y piso original con la cara superior en BED.floor
 */
const FZ = -1.65, RZ = 1.5, WR = 0.4, ARCH = 0.5, NOMINAL_GAP = ARCH - WR;
const BED = { z0: 0.92, z1: 2.62, wall0: 0.80, top: 1.30, floor: 0.83, housingTop: 0.98 };

function extrudeSide(points, arcs, depth, mat) {
  // Perfil en el plano (z, y) extruido a lo ancho (x). arcs: [[zCentro, yCentro, radio]] recortes de pasaruedas
  const sh = new THREE.Shape();
  sh.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (pt.arc) {
      const [cz, cy, r] = pt.arc, a = Math.asin((pt.y - cy) / r);
      sh.lineTo(cz + Math.cos(a) * r, pt.y);
      sh.absarc(cz, cy, r, a, Math.PI - a, false);
      sh.lineTo(pt[0], pt[1]);
    } else sh.lineTo(pt[0], pt[1]);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 18 });
  g.rotateY(-Math.PI / 2);   // el perfil queda en z/y y la extrusión hacia -x
  return new THREE.Mesh(g, mat);
}
function archPoint(z, y, cz) { const p = [z, y]; p.arc = [cz, WR, ARCH]; p.y = y; return p; }

function tireTex() {
  return canvasTex(256, 32, (x, w, h) => {
    x.fillStyle = '#17181a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#0b0c0d';
    for (let i = 0; i < 32; i++) { x.fillRect(i * 8, 0, 3, h * 0.45); x.fillRect(i * 8 + 4, h * 0.55, 3, h * 0.45); }
  });
}

function makePickup(o) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  // Inclinación según la luz de cada eje: el cuerpo es rígido y las ruedas no se inclinan
  const gapF = o.gapF, gapR = o.gapR;
  const pitch = (gapF - gapR) / (RZ - FZ);
  body.rotation.x = pitch;
  body.position.y = gapF - NOMINAL_GAP + FZ * pitch;
  g.userData.lift = body.position.y; g.userData.pitch = pitch;

  const paint = phong(o.color, { shininess: 30, specular: 0x2a2a2a });
  const dark = phong(0x1d2026), trim = phong(0x2a2d33, { shininess: 30 });
  const under = shade(phong(0xc2b6a4, { map: mudTex('#5e5242', 5), shininess: 4, specular: 0x111111 }));
  under.userData.wuv = 2.5;

  // Capó y frente (macizo) con el pasarruedas delantero
  const hood = extrudeSide([[-2.7, 0.62], [-2.7, 1.02], [-2.6, 1.12], [-1.2, 1.25], [-1.15, 1.25], [-1.15, 0.62], archPoint(-2.7, 0.62, FZ)], null, 1.86, paint);
  hood.position.x = 0.93; body.add(hood);
  // Pasarruedas oscuros por dentro, para que la luz entre guardabarros y cubierta se lea como un hueco
  const liner = phong(0x121314, { side: THREE.DoubleSide, shininess: 2 });
  [[FZ, 0.62], [RZ, BED.wall0]].forEach(([z, y0]) => {
    const a = Math.asin((y0 - WR) / ARCH);
    [-1, 1].forEach(s => {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(ARCH - 0.006, ARCH - 0.006, 0.32, 20, 1, true, a, Math.PI - 2 * a), liner);
      l.rotation.z = Math.PI / 2; l.position.set(s * 0.77, WR, z); body.add(l);
    });
  });
  box(body, [1.24, 0.27, 0.9], [0, 0.765, FZ], liner);
  // Puertas (paredes laterales de la cabina) y zócalo
  [-0.93, 0.87].forEach(x => {
    const d = extrudeSide([[-1.15, 0.62], [-1.15, 1.25], [0.82, 1.25], [0.82, 0.62]], null, 0.06, paint);
    d.position.x = x + 0.06; body.add(d);
    box(body, [0.012, 0.5, 0.012], [x < 0 ? -0.935 : 0.935, 0.98, -0.2], trim);      // separación de puertas
    [-0.75, 0.25].forEach(z => box(body, [0.02, 0.025, 0.16], [x < 0 ? -0.94 : 0.94, 1.12, z], trim)); // manijas
    box(body, [0.16, 0.05, 1.9], [x < 0 ? -0.98 : 0.98, 0.56, -0.17], trim);       // estribo
  });
  box(body, [1.74, 0.06, 1.97], [0, 0.71, -0.17], dark);   // piso de la cabina
  box(body, [1.86, 0.63, 0.06], [0, 0.935, 0.85], paint);   // pared trasera de la cabina
  // Habitáculo vidriado
  const glass = new THREE.MeshPhongMaterial({ color: 0x1b2632, transparent: true, opacity: 0.32, shininess: 90, specular: 0x667788, depthWrite: false });
  const gh = extrudeSide([[-1.15, 1.25], [-0.6, 1.8], [0.74, 1.82], [0.82, 1.25]], null, 1.72, glass);
  gh.position.x = 0.86; gh.renderOrder = 2; body.add(gh);
  box(body, [1.76, 0.05, 1.36], [0, 1.835, 0.07], paint);  // techo
  [-0.865, 0.865].forEach(x => {
    const a = box(body, [0.06, 0.78, 0.07], [x, 1.525, -0.875], paint); a.rotation.x = Math.PI / 4;   // parante A
    box(body, [0.06, 0.58, 0.09], [x, 1.54, -0.2], paint);                                       // parante B
    box(body, [0.06, 0.58, 0.12], [x, 1.54, 0.77], paint);                                       // parante C
  });
  // Frente: parrilla, ópticas (encendidas) y paragolpes
  box(body, [1.2, 0.26, 0.03], [0, 0.93, -2.715], dark);
  for (let i = 0; i < 4; i++) box(body, [1.16, 0.015, 0.035], [0, 0.85 + i * 0.055, -2.72], trim);
  const headM = basic(0xfff3d2), tailM = basic(0xd01c1c), amber = basic(0xe08a1a);
  [-0.68, 0.68].forEach(x => { box(body, [0.36, 0.12, 0.04], [x, 1.03, -2.705], headM); box(body, [0.1, 0.05, 0.04], [x * 1.22, 1.03, -2.69], amber); });
  box(body, [1.92, 0.2, 0.14], [0, 0.72, -2.74], trim);
  // Espejos
  [-1.0, 1.0].forEach(x => { box(body, [0.16, 0.13, 0.06], [x, 1.38, -1.0], dark); box(body, [0.13, 0.1, 0.005], [x, 1.38, -0.968], phong(0x8fa2b6, { shininess: 90 })); });

  // Caja de carga
  [-1, 1].forEach(s => {
    const w = extrudeSide([[BED.z0, BED.wall0], [BED.z0, BED.top], [BED.z1, BED.top], [BED.z1, BED.wall0], archPoint(BED.z0, BED.wall0, RZ)], null, 0.06, paint);
    w.position.x = s < 0 ? -0.87 : 0.93; body.add(w);
    box(body, [0.09, 0.03, BED.z1 - BED.z0], [s * 0.9, BED.top + 0.012, (BED.z0 + BED.z1) / 2], trim);  // borde superior
  });
  box(body, [1.86, BED.top - BED.wall0, 0.06], [0, (BED.top + BED.wall0) / 2, BED.z0 + 0.03], paint);      // frente de la caja
  box(body, [1.86, BED.top - BED.wall0, 0.06], [0, (BED.top + BED.wall0) / 2, BED.z1 - 0.03], paint);      // portón
  box(body, [0.5, 0.05, 0.01], [0, 1.2, BED.z1 + 0.002], trim);                                           // manija del portón
  const bedFloorMat = phong(0x26292e, { shininess: 6 });
  box(body, [1.74, BED.floor - BED.wall0, BED.z1 - BED.z0 - 0.12], [0, (BED.floor + BED.wall0) / 2, (BED.z0 + BED.z1) / 2], bedFloorMat);
  // Pasaruedas internos: sobresalen del piso original
  [-0.72, 0.72].forEach(x => box(body, [0.27, BED.housingTop - BED.floor, 0.9], [x, (BED.housingTop + BED.floor) / 2, RZ], bedFloorMat));
  // Doble fondo: un piso más alto que tapa casi por completo los pasaruedas
  const ff = o.falseFloor || 0, floorTop = BED.floor + ff;
  if (ff) box(body, [1.74, 0.02, BED.z1 - BED.z0 - 0.12], [0, floorTop - 0.01, (BED.z0 + BED.z1) / 2], phong(0x1c1e22, { shininess: 10 }));
  // Tornillos del piso: los originales con óxido, algunos nuevos si se tocó el piso
  const rusty = phong(0x5a4632), shiny = phong(0xc9ccd1, { shininess: 110, specular: 0xffffff });
  for (let i = 0; i < 8; i++) [-0.55, 0, 0.55].forEach((x, j) => {
    const nuevo = o.newScrews && (i + j) % 3 === 0;
    cyl(body, 0.012, 0.012, 0.006, 8, [x, floorTop + 0.003, BED.z0 + 0.18 + i * 0.19], nuevo ? shiny : rusty);
  });
  // Carga a la vista: bolsas de cemento
  if (o.cargo) {
    const bag = phong(0xb9ad94, { map: canvasTex(128, 64, (x, w, h) => { x.fillStyle = '#c4b89c'; x.fillRect(0, 0, w, h); x.fillStyle = '#7b2a1d'; x.font = 'bold 20px Arial'; x.textAlign = 'center'; x.fillText('CEMENTO', w / 2, 30); x.font = '14px Arial'; x.fillText('50 kg', w / 2, 50); }) });
    for (let k = 0; k < 8; k++) {
      const b = box(body, [0.4, 0.13, 0.62], [k % 2 ? 0.3 : -0.3, floorTop + 0.065 + (k > 3 ? 0.13 : 0), k % 4 > 1 ? 2.0 : 1.35], bag);
      b.rotation.y = ((k * 0.37) % 0.12) - 0.06;
    }
  }
  // Ópticas traseras y paragolpes trasero
  [-0.9, 0.9].forEach(x => box(body, [0.07, 0.32, 0.06], [x, 1.08, BED.z1 - 0.01], tailM));
  const bumperM = phong(0xb0aaa2, { map: mudTex('#6a655e', 13), shininess: 6 }); bumperM.userData.wuv = 3;
  const bumperR = box(body, [1.86, 0.22, 0.16], [0, 0.73, 2.7], bumperM);
  g.userData.bumperR = bumperR;

  // Chasis (abajo, cubierto de tierra)
  [-0.45, 0.45].forEach(x => box(body, [0.08, 0.16, 5.0], [x, 0.6, -0.05], under));
  [-1.2, 0.2, 0.95, 2.5].forEach(z => box(body, [0.82, 0.1, 0.08], [0, 0.6, z], under));
  box(body, [1.1, 0.03, 3.7], [0, 0.69, 0.75], phong(0x2a2520, { shininess: 2 }));   // fondo de cabina y caja
  // Tanque de combustible
  box(body, [0.34, 0.24, 0.75], [0.7, 0.55, 0.3], shade(phong(0x9a9a96, { map: mudTex('#2c2c2a', 9), shininess: 4 })));
  // Escape: caño, silenciador y abrazaderas (nuevo o con óxido)
  const exM = shade(o.newExhaust ? phong(0x9da1a7, { shininess: 110, specular: 0xeeeeee }) : phong(0x9a7a66, { map: mudTex('#5b3a26', 21), shininess: 4 }));
  cyl(body, 0.03, 0.03, 2.5, 10, [0.25, 0.48, 0.05], exM, [Math.PI / 2, 0, 0]);
  cyl(body, 0.12, 0.12, 0.6, 16, [0.25, 0.48, 0.95], exM, [Math.PI / 2, 0, 0]);
  [0.64, 1.26].forEach(z => cyl(body, 0.128, 0.128, 0.03, 16, [0.25, 0.48, z], o.newExhaust ? shade(phong(0xc9ccd1, { shininess: 110, specular: 0xffffff })) : exM, [Math.PI / 2, 0, 0]));
  // Rueda de auxilio colgada bajo la caja
  cyl(body, 0.34, 0.34, 0.22, 20, [0, 0.46, 2.18], phong(0x17181a));
  // Modificación sobre el larguero izquierdo, detrás del eje
  if (o.weld) {
    const wm = shade(phong(0x8d9298, { shininess: 160, specular: 0xffffff }));
    for (let i = 0; i < 22; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), wm);
      s.scale.set(0.6, 1, 1.4); s.position.set(-0.496, 0.62 + Math.sin(i * 1.7) * 0.004, 2.0 + i * 0.021); body.add(s);
    }
    box(body, [0.004, 0.12, 0.42], [-0.4925, 0.6, 2.21], shade(phong(0x6a6f75, { shininess: 70, specular: 0x8a8a8a })));  // chapa agregada
  }
  if (o.paint) {
    // Pintura negra nueva: cubre la cara exterior y la de abajo del larguero, sin tierra
    const pm = shade(phong(0x1b1b1f, { shininess: 60, specular: 0xdddddd }));
    box(body, [0.006, 0.165, 0.6], [-0.4915, 0.6, 2.2], pm);
    box(body, [0.086, 0.006, 0.6], [-0.45, 0.5185, 2.2], pm);
  }

  // Ruedas, eje y ballestas (fuera del cuerpo inclinado)
  const tm = phong(0x1a1b1d, { map: tireTex(), shininess: 4 }), side = phong(0x141517, { shininess: 6 }), rim = phong(0xa9afb7, { shininess: 70, specular: 0x888888 });
  const tg = new THREE.CylinderGeometry(WR, WR, 0.27, 28, 1, true), sg = new THREE.CircleGeometry(WR, 28), rg = new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20);
  [[-0.8, FZ], [0.8, FZ], [-0.8, RZ], [0.8, RZ]].forEach(([x, z]) => {
    const w = new THREE.Mesh(tg, tm); w.rotation.z = Math.PI / 2; w.position.set(x, WR, z); g.add(w);
    [-1, 1].forEach(s => { const c = new THREE.Mesh(sg, side); c.rotation.y = s * Math.PI / 2; c.position.set(x + s * 0.135, WR, z); g.add(c); });
    const out = x < 0 ? -1 : 1;
    const r = new THREE.Mesh(rg, rim); r.rotation.z = Math.PI / 2; r.position.set(x + out * 0.137, WR, z); g.add(r);
    for (let k = 0; k < 6; k++) { const sp = box(g, [0.01, 0.17, 0.035], [x + out * 0.15, WR, z], rim); sp.rotation.x = k * Math.PI / 3; sp.position.y = WR + Math.cos(k * Math.PI / 3) * 0.1; sp.position.z = z + Math.sin(k * Math.PI / 3) * 0.1; }
    cyl(g, 0.05, 0.05, 0.02, 10, [x + out * 0.152, WR, z], phong(0x55595f), [0, 0, Math.PI / 2]);
  });
  cyl(g, 0.045, 0.045, 1.5, 10, [0, WR, RZ], phong(0x2a2622, { map: mudTex('#2a2622', 4) }), [0, 0, Math.PI / 2]);
  const diff = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), phong(0x2a2622)); diff.scale.set(1, 0.85, 1.1); diff.position.set(-0.05, WR, RZ); g.add(diff);
  // Ballestas: arqueadas sin carga, casi planas cuando hay peso
  const leafM = shade(phong(0x9a928a, { map: mudTex('#2b2724', 17), shininess: 8 }));
  [-0.45, 0.45].forEach(x => {
    for (let leaf = 0; leaf < 3; leaf++) {
      const half = 0.62 - leaf * 0.14, N = 9;
      const yEnd = (z) => 0.52 + body.position.y - z * pitch - leaf * 0.012;
      const yMid = WR + 0.06 - leaf * 0.012;
      for (let i = 0; i < N; i++) {
        const u0 = i / N, u1 = (i + 1) / N;
        const za = RZ - half + u0 * 2 * half, zb = RZ - half + u1 * 2 * half;
        const ya = yMid + (yEnd(za) - yMid) * Math.pow(Math.abs(u0 * 2 - 1), 2);
        const yb = yMid + (yEnd(zb) - yMid) * Math.pow(Math.abs(u1 * 2 - 1), 2);
        const len = Math.hypot(zb - za, yb - ya);
        const seg = box(g, [0.06, 0.011, len + 0.004], [x, (ya + yb) / 2, (za + zb) / 2], leafM);
        seg.rotation.x = -Math.atan2(yb - ya, zb - za);
      }
    }
  });

  // Asientos, tablero y volante
  const seat = phong(0x2b2e34);
  [-0.42, 0.42].forEach(x => { box(body, [0.5, 0.12, 0.5], [x, 1.08, -0.35], seat); box(body, [0.5, 0.62, 0.1], [x, 1.42, -0.06], seat); box(body, [0.26, 0.14, 0.08], [x, 1.8, -0.04], seat); });
  box(body, [1.5, 0.12, 0.5], [0, 1.08, 0.42], seat); box(body, [1.5, 0.6, 0.1], [0, 1.4, 0.7], seat);
  box(body, [1.66, 0.18, 0.3], [0, 1.21, -0.92], dark);
  box(body, [1.66, 0.04, 0.16], [0, 1.28, -1.04], dark);
  const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 24), trim);
  wheelS.position.set(-0.42, 1.35, -0.7); wheelS.rotation.x = 0.35; body.add(wheelS);
  g.userData.steering = wheelS;

  if (o.label) {
    const tex = canvasTex(512, 96, (x, w, h) => { x.fillStyle = '#fff'; x.font = 'bold 60px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(o.label, w / 2, 50); });
    [-1, 1].forEach(s => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.26), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      m.position.set(0.94 * s, 1.0, -0.2); m.rotation.y = s * Math.PI / 2; body.add(m);
    });
    box(body, [1.1, 0.1, 0.3], [0, 1.9, -0.3], lam(0x222831));
    g.userData.lamps = [box(body, [0.5, 0.1, 0.28], [-0.28, 1.99, -0.3], basic(0x0d1f4a)), box(body, [0.5, 0.1, 0.28], [0.28, 1.99, -0.3], basic(0x4a0d12))];
  }
  g.userData.body = body;
  g.userData.floorTop = floorTop;
  scene.add(g);
  return g;
}

// Materiales que quedan a la sombra de la camioneta: oscuros y sin brillo, salvo con la linterna
let SHADED = [];
function shade(m) { m.userData.color = m.color.clone(); m.userData.specular = m.specular.clone(); SHADED.push(m); applyShade(m, state0.torch); return m; }
const state0 = { torch: false };
function applyShade(m, lit) {
  m.color.copy(m.userData.color).multiplyScalar(lit ? 1 : 0.26);
  m.specular.copy(m.userData.specular).multiplyScalar(lit ? 1 : 0);
}
function setShade(lit) { state0.torch = lit; SHADED.forEach(m => applyShade(m, lit)); }

function disposeTree(obj) {
  obj.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) [].concat(n.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}

// Texturas legibles que dependen del caso
function etchTex(text, scratched) {
  return canvasTex(256, 64, (x, w, h) => {
    if (scratched) {
      x.fillStyle = 'rgba(225,230,236,.38)'; x.fillRect(14, 10, w - 28, h - 20);
      const r = noiseRnd(29); x.strokeStyle = 'rgba(240,244,248,.75)'; x.lineWidth = 1.3;
      for (let i = 0; i < 70; i++) { const a = r() * w, b = r() * h; x.beginPath(); x.moveTo(a, b); x.lineTo(a + 20 + r() * 40, b + (r() - 0.5) * 22); x.stroke(); }
      return;
    }
    x.fillStyle = 'rgba(235,240,245,.82)'; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2);
  });
}
function vinTex(vin) {
  return canvasTex(512, 96, (x, w, h) => {
    x.fillStyle = '#b8bcc0'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#6b7075'; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4);
    x.fillStyle = '#1c1f22'; x.font = 'bold 44px "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(vin, w / 2, h / 2 + 2);
  });
}
function ticketTex(d) {
  return canvasTex(160, 288, (x, w, h) => {
    x.fillStyle = '#f3f0e6'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#222'; x.textAlign = 'center';
    x.font = 'bold 20px "Courier New", monospace'; x.fillText('ESTACIÓN RN34', w / 2, 30);
    x.font = '16px "Courier New", monospace'; x.fillText(d.ticketLugar.toUpperCase(), w / 2, 54);
    x.fillText(d.ticketFecha, w / 2, 92); x.fillText(d.ticketHora, w / 2, 112);
    x.fillText('GASOIL G3', w / 2, 150); x.fillText(d.ticketLitros + ' L', w / 2, 170);
    x.fillText('- - - - - - - -', w / 2, 200); x.font = 'bold 18px "Courier New", monospace'; x.fillText('TOTAL', w / 2, 228);
  });
}

/* ---------- Construcción de la camioneta del caso ---------- */
let truck = null, tb = null, driver = null, headG = null, eyes = [], pupils = [], handL = null;
function buildTruck() {
  if (truck) { scene.remove(truck); disposeTree(truck); }
  SHADED = SHADED.filter(m => m.userData.keep);
  const e = CASE.estados, f = CASE.fisico, d = CASE.datos;
  truck = makePickup({
    color: 0xd6d6d0, gapF: f.gapF, gapR: f.gapR, falseFloor: f.dobleFondo, newScrews: f.tornillosNuevos,
    cargo: e.bed === 'conCarga', weld: e.under === 'soldadura', paint: e.under === 'pintura', newExhaust: e.under === 'escapeNuevo'
  });
  tb = truck.userData.body;
  // Patentes. La trasera, si la cambiaron, tiene un rectángulo limpio alrededor y tornillos nuevos.
  const plateMat = new THREE.MeshPhongMaterial({ map: plateTex(d.dominio, true), shininess: 20 });
  const plateR = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.125), plateMat);
  plateR.position.set(0, 0.73, 2.783); tb.add(plateR);
  if (e.plate === 'cambiada') {
    box(tb, [0.47, 0.17, 0.004], [0, 0.73, 2.7805], phong(0x2a2c30, { shininess: 30 }));
    [-0.16, 0.16].forEach(x => cyl(tb, 0.008, 0.008, 0.008, 8, [x, 0.73, 2.788], phong(0xd5d8dc, { shininess: 120, specular: 0xffffff }), [Math.PI / 2, 0, 0]));
  } else {
    [-0.16, 0.16].forEach(x => cyl(tb, 0.008, 0.008, 0.008, 8, [x, 0.73, 2.788], phong(0x5a4632), [Math.PI / 2, 0, 0]));
  }
  const plateF = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.125), new THREE.MeshPhongMaterial({ map: plateTex(d.dominio, false), shininess: 20 }));
  plateF.position.set(0, 0.72, -2.815); plateF.rotation.y = Math.PI; tb.add(plateF);
  // Grabado del parabrisas (lado del acompañante), apoyado sobre el vidrio inclinado
  const ws = (y) => -1.15 + (y - 1.25) * (0.55 / 0.55);   // z del parabrisas a la altura y
  const etch = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: etchTex(d.grabado, e.etch === 'raspado') }));
  etch.rotation.order = 'YXZ'; etch.rotation.set(-Math.PI / 4, Math.PI, 0);
  etch.position.set(0.62, 1.32, ws(1.32) - 0.006); tb.add(etch);
  etch.renderOrder = 3;
  // Chapa con el número de chasis, sobre el tablero del lado del conductor
  const vin = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.032), new THREE.MeshBasicMaterial({ map: vinTex(d.chapaChasis), color: 0xbbbbbb }));
  vin.rotation.order = 'YXZ'; vin.rotation.set(-1.2, Math.PI, 0);
  vin.position.set(-0.55, 1.306, -1.06); tb.add(vin);
  // Ticket en el tablero
  const ticket = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.135), new THREE.MeshBasicMaterial({ map: ticketTex(d), color: 0xcfcfcf }));
  ticket.rotation.set(-Math.PI / 2, 0, Math.PI + 0.4); ticket.position.set(-0.15, 1.303, -0.98); tb.add(ticket);
  // Asiento trasero
  const r = e.rseat;
  if (r === 'sillita') {
    const sm = phong(0x46607a), pad = phong(0x2f3e52);
    box(tb, [0.38, 0.1, 0.36], [-0.42, 1.19, 0.42], sm); box(tb, [0.38, 0.5, 0.08], [-0.42, 1.45, 0.6], sm);
    [-1, 1].forEach(k => box(tb, [0.05, 0.3, 0.3], [-0.42 + k * 0.17, 1.33, 0.48], sm));
    box(tb, [0.26, 0.04, 0.26], [-0.42, 1.25, 0.41], pad);
    [-0.07, 0.07].forEach(x => box(tb, [0.03, 0.3, 0.012], [-0.42 + x, 1.38, 0.555], phong(0x111111)));
    box(tb, [0.45, 0.22, 0.3], [0.38, 1.25, 0.42], phong(0x8b2f2f));
  }
  else if (r === 'herramientas') { box(tb, [0.48, 0.2, 0.24], [-0.4, 1.24, 0.42], phong(0xb3261e, { shininess: 40 })); box(tb, [0.4, 0.12, 0.35], [0.35, 1.2, 0.45], phong(0x3b4a2f)); box(tb, [0.12, 0.12, 0.26], [0.05, 1.2, 0.4], phong(0x5a3f2a)); }
  else { box(tb, [0.45, 0.24, 0.3], [-0.42, 1.26, 0.42], phong(0x2f3d5c)); box(tb, [0.4, 0.22, 0.28], [0.1, 1.25, 0.44], phong(0x4f4f4f)); box(tb, [0.25, 0.22, 0.2], [0.45, 1.25, 0.42], phong(0xe8e4dc)); }
  // Asiento del acompañante
  if (e.mate === 'mate') {
    cyl(tb, 0.045, 0.045, 0.3, 12, [0.5, 1.29, -0.38], phong(0x2f6a3d, { shininess: 60 }));
    cyl(tb, 0.04, 0.035, 0.08, 12, [0.34, 1.18, -0.3], phong(0x7a5230));
    box(tb, [0.1, 0.16, 0.06], [0.42, 1.22, -0.45], phong(0xd8b13a));
  } else {
    box(tb, [0.3, 0.2, 0.22], [0.42, 1.24, -0.38], phong(0x2f62a8, { shininess: 40 }));
    box(tb, [0.07, 0.008, 0.14], [0.3, 1.145, -0.25], phong(0x111111, { shininess: 80 }));
  }
  buildDriver();
  if (DEBUG) renderDebug();
}

/* ---------- Conductor ---------- */
function buildDriver() {
  driver = new THREE.Group();
  const jacket = phong(0x5b4a3a), skin = phong(0xb98a6a, { shininess: 8 }), hairM = phong(0x1e1814), dk = basic(0x1a1a1a);
  box(driver, [0.42, 0.52, 0.26], [0, 0.26, 0], jacket);
  box(driver, [0.12, 0.08, 0.1], [0, 0.55, 0], skin);  // cuello
  headG = new THREE.Group(); headG.position.y = 0.67; driver.add(headG);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), skin); skull.scale.set(1, 1.16, 1.05); headG.add(skull);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.122, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), hairM); hair.position.y = 0.03; hair.scale.set(1, 1.1, 1.08); headG.add(hair);
  [-1, 1].forEach(s => { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * 0.115, 0.0, 0.0); headG.add(ear); });
  const nose = box(headG, [0.026, 0.045, 0.03], [0, -0.012, -0.12], skin);
  nose.rotation.x = 0.2;
  box(headG, [0.05, 0.008, 0.01], [0, -0.065, -0.112], phong(0x7a4a3a));   // boca
  eyes = []; pupils = [];
  [-0.04, 0.04].forEach(x => {
    const eg = new THREE.Group(); eg.position.set(x, 0.022, -0.103); headG.add(eg);
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), basic(0xe9e4dc)); w.scale.z = 0.5; eg.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), dk); p.position.z = -0.008; eg.add(p);
    box(headG, [0.036, 0.007, 0.01], [x, 0.048, -0.108], hairM);  // cejas
    eyes.push(eg); pupils.push(p);
  });
  // Brazos hacia el volante
  [-1, 1].forEach(s => {
    const sh = new THREE.Group(); sh.position.set(0.24 * s, 0.48, 0); driver.add(sh);
    box(sh, [0.1, 0.3, 0.1], [0, -0.15, 0], jacket); sh.rotation.x = 0.35; sh.rotation.z = -s * 0.15;
    const el = new THREE.Group(); el.position.set(0, -0.3, 0); sh.add(el);
    box(el, [0.09, 0.28, 0.09], [0, -0.14, 0], jacket); el.rotation.x = 1.83;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), skin); hand.position.y = -0.3; el.add(hand);
    if (s < 0) handL = el;
  });
  driver.position.set(-0.42, 0.98, -0.35);
  tb.add(driver);
}

// Camioneta de Gendarmería (fija)
const gnaTruck = makePickup({ color: 0x34472f, gapF: 0.1, gapR: 0.12, label: 'GENDARMERÍA' });
gnaTruck.position.set(3.8, 0, 9.2);
SHADED.forEach(m => { m.userData.keep = true; });

// Compañero en la garita
(() => {
  const g = new THREE.Group(), uni = phong(0x4d5a3a), skin = phong(0xa8795a);
  box(g, [0.36, 0.55, 0.24], [0, 1.2, 0], uni); box(g, [0.34, 0.8, 0.2], [0, 0.45, 0], phong(0x3f4a30));
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), skin); h.position.y = 1.62; g.add(h);
  box(g, [0.25, 0.06, 0.25], [0, 1.72, 0], phong(0x3a4530));
  box(g, [0.38, 0.14, 0.26], [0, 1.0, 0], phong(0xc9d23a, { emissive: 0x3a3d10 }));  // chaleco reflectivo
  g.position.set(4.6, 0, -1.2); g.rotation.y = -1.9; scene.add(g);
})();

/* ---------- Jugador ---------- */
const STAND = 1.65, CROUCH = 0.55, RADIUS = 0.3;
const BOUNDS = { x0: -6, x1: 7.2, z0: -9.5, z1: 13 };
const OBST = [
  { x0: -1.02, x1: 1.02, z0: -2.85, z1: 2.8 },
  { x0: 2.8, x1: 4.8, z0: 6.35, z1: 12.0 },
  { x0: 4.9, x1: 7.1, z0: -4.1, z1: -1.9 },
  { x0: 3.2, x1: 3.4, z0: -1.6, z1: -1.4 },
  { x0: -2.0, x1: 2.5, z0: -6.08, z1: -5.92 }
];
const START = { x: -2.6, z: 6.5 };
const player = { x: START.x, z: START.z, yaw: Math.atan2(-2.6, 6.5), pitch: -0.08, eye: STAND, crouch: false, walk: 0 };

function blocked(x, z) {
  if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return true;
  for (const b of OBST) if (x > b.x0 - RADIUS && x < b.x1 + RADIUS && z > b.z0 - RADIUS && z < b.z1 + RADIUS) return true;
  return false;
}

const input = { jx: 0, jy: 0, keys: new Set() };
function move(dt) {
  let ix = input.jx, iy = input.jy;
  const k = input.keys;
  if (k.has('KeyW') || k.has('ArrowUp')) iy += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) iy -= 1;
  if (k.has('KeyA')) ix -= 1;
  if (k.has('KeyD')) ix += 1;
  if (k.has('ArrowLeft')) player.yaw += 1.8 * dt;
  if (k.has('ArrowRight')) player.yaw -= 1.8 * dt;
  const len = Math.hypot(ix, iy);
  if (len > 1) { ix /= len; iy /= len; }
  const speed = (player.crouch ? 0.9 : 2.1) * dt;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  const dx = (fx * iy + rx * ix) * speed, dz = (fz * iy + rz * ix) * speed;
  if (dx || dz) {
    if (!blocked(player.x + dx, player.z)) player.x += dx;
    if (!blocked(player.x, player.z + dz)) player.z += dz;
    player.walk += Math.hypot(dx, dz) * 5.5;
    state.dist += Math.hypot(dx, dz);
  }
}

/* ---------- Cámara: primera persona o encuadre de cerca al revisar ---------- */
const reticle = $('#reticle');
const view = { close: null, blend: 1, from: null, dyaw: 0, dpitch: 0, inset: { r: 0, b: 0 }, insetFrom: { r: 0, b: 0 }, insetTo: { r: 0, b: 0 } };
const cam = { x: player.x, y: STAND, z: player.z, yaw: player.yaw, pitch: player.pitch, fov: 60 };
const baseFov = () => (window.innerWidth < window.innerHeight ? 70 : 60);
function lookAngles(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
function poseTarget() {
  if (view.close) {
    const v = view.close, a = lookAngles(v.pos, v.mira);
    // De cerca se acerca la vista (como quien se inclina a mirar). Si el panel tapa la parte de abajo,
    // se abre el ángulo para que la franja visible muestre lo mismo que mostraría la pantalla entera.
    const h = window.innerHeight, b = Math.min(view.insetTo.b, h * 0.7), want = (v.fov || 40) * Math.PI / 180;
    const fov = 2 * Math.atan(Math.tan(want / 2) * (h + b) / (h - b)) * 180 / Math.PI;
    return { x: v.pos[0], y: v.pos[1], z: v.pos[2], yaw: a.yaw + view.dyaw, pitch: a.pitch + view.dpitch, fov };
  }
  const bob = reduceMotion ? 0 : Math.sin(player.walk) * 0.02;
  return { x: player.x, y: player.eye + bob, z: player.z, yaw: player.yaw, pitch: player.pitch, fov: baseFov() };
}
function setCloseView(v, inset) {
  view.from = Object.assign({}, cam);
  view.insetFrom = Object.assign({}, view.inset);
  view.insetTo = inset || { r: 0, b: 0 };
  view.close = v; view.blend = 0; view.dyaw = 0; view.dpitch = 0;
}
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function updateCamera(dt, rdt) {
  const target = player.crouch ? CROUCH : STAND;
  player.eye += (target - player.eye) * Math.min(1, dt * 8);
  const t = poseTarget();
  if (view.blend < 1) {
    view.blend = reduceMotion ? 1 : Math.min(1, view.blend + rdt / 0.5);   // en tiempo real, aunque el celular vaya lento
    const e = ease(view.blend), f = view.from;
    cam.x = f.x + (t.x - f.x) * e; cam.y = f.y + (t.y - f.y) * e; cam.z = f.z + (t.z - f.z) * e;
    cam.yaw = f.yaw + wrapAngle(t.yaw - f.yaw) * e; cam.pitch = f.pitch + (t.pitch - f.pitch) * e;
    cam.fov = f.fov + (t.fov - f.fov) * e;
    view.inset.r = view.insetFrom.r + (view.insetTo.r - view.insetFrom.r) * e;
    view.inset.b = view.insetFrom.b + (view.insetTo.b - view.insetFrom.b) * e;
    applyViewOffset();
  } else Object.assign(cam, t);
  camera.position.set(cam.x, cam.y, cam.z);
  camera.rotation.set(cam.pitch, cam.yaw, 0);
  reticle.style.visibility = view.close ? 'hidden' : '';
  if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  scene.userData.sky.position.copy(camera.position);
}
// Corre el centro de la imagen para que lo que se revisa quede en la parte visible, fuera del panel
function applyViewOffset() {
  const w = window.innerWidth, h = window.innerHeight, r = view.inset.r, b = view.inset.b;
  if (r < 1 && b < 1) {
    camera.aspect = w / h;
    if (camera.view && camera.view.enabled) camera.clearViewOffset(); else camera.updateProjectionMatrix();
    return;
  }
  // El cuadro virtual es más grande que la pantalla; el aspecto tiene que ser el del cuadro completo
  camera.aspect = (w + r) / (h + b);
  camera.setViewOffset(w + r, h + b, r, b, w, h);
}

/* ---------- Comportamiento del conductor ---------- */
let blinkT = 0, blinkNext = 2, avertT = 0;
function updateDriver(dt) {
  if (!headG) return;
  const nervous = CASE && CASE.conducta === 'nervioso';
  const behind = state.mode === 'play' && player.z > 0.6;
  const toPlayer = Math.atan2(-(cam.x + 0.42), -(cam.z + 0.35));
  let target, tpitch = 0;
  if (state.talking) {
    target = toPlayer;
    // Nervioso: corre la mirada cada tanto mientras le hablan
    if (nervous) { avertT += dt; const ph = avertT % 3.4; if (ph > 2.6) { target = toPlayer - 0.55; tpitch = 0.25; } }
  } else if (behind && nervous) {
    // Cuando el gendarme está atrás, mira por el espejo y gira la cabeza
    target = Math.sin(time * 1.7) > 0 ? 0.72 : 1.5;
    if (Math.hypot(player.x, player.z - 1.78) < 2.6) state.nearBed = true;
  } else if (behind) {
    target = Math.sin(time * 0.25) > 0.6 ? 0.72 : 0.1;   // tranquilo: alguna mirada al espejo y vuelve al frente
  } else {
    target = toPlayer;
  }
  target = Math.max(-1.5, Math.min(1.5, target));
  target += Math.sin(time * 2.3) * (nervous && behind ? 0.08 : 0.025);
  const speed = nervous && behind ? 6 : 2.5;
  headG.rotation.y += (target - headG.rotation.y) * Math.min(1, dt * speed);
  headG.rotation.x += (tpitch - headG.rotation.x) * Math.min(1, dt * 4);
  // Parpadeo (más seguido si está nervioso)
  blinkT += dt;
  if (blinkT > blinkNext) { blinkT = 0; blinkNext = nervous ? 0.9 + Math.random() * 1.2 : 2.5 + Math.random() * 3; }
  const closed = blinkT < 0.12;
  eyes.forEach(e => { e.scale.y = closed ? 0.15 : 1; });
  // Dedos que tamborilean sobre el volante
  if (handL) handL.rotation.x = 1.83 + (nervous && !state.talking ? Math.max(0, Math.sin(time * 9)) * 0.12 : 0);
}

function updateLamps() {
  const lamps = gnaTruck.userData.lamps; if (!lamps) return;
  const on = Math.floor(time * (reduceMotion ? 0.8 : 1.6)) % 2 === 0;
  lamps[0].material.color.setHex(on ? 0x3a6bff : 0x0d1f4a);
  lamps[1].material.color.setHex(on ? 0x4a0d12 : 0xff2a3a);
}

/* =========================================================
   SONIDO (generado, sin archivos)
   ========================================================= */
const audio = { ctx: null, on: true, master: null, engine: null };
function audioInit() {
  if (audio.ctx || !(window.AudioContext || window.webkitAudioContext)) return;
  const ctx = audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.master = ctx.createGain(); audio.master.gain.value = audio.on ? 0.8 : 0; audio.master.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  audio.noise = noise;
  // Motor en ralentí: ruido grave pulsando
  const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
  const puls = ctx.createGain(); puls.gain.value = 0.5;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 27; const lfoG = ctx.createGain(); lfoG.gain.value = 0.35;
  lfo.connect(lfoG); lfoG.connect(puls.gain);
  const eng = ctx.createGain(); eng.gain.value = 0;
  src.connect(lp); lp.connect(puls); puls.connect(eng); eng.connect(audio.master);
  src.start(); lfo.start();
  audio.engine = eng;
  // Grillos
  const cr = ctx.createOscillator(); cr.frequency.value = 4300;
  const crAM = ctx.createGain(); crAM.gain.value = 0.5;
  const am = ctx.createOscillator(); am.type = 'square'; am.frequency.value = 22; const amG = ctx.createGain(); amG.gain.value = 0.5;
  am.connect(amG); amG.connect(crAM.gain);
  const crG = ctx.createGain(); crG.gain.value = 0;
  cr.connect(crAM); crAM.connect(crG); crG.connect(audio.master); cr.start(); am.start();
  audio.crickets = crG;
}
function audioToggle(on) {
  audio.on = on;
  if (audio.master) audio.master.gain.value = on ? 0.8 : 0;
}
function updateAudio() {
  if (!audio.ctx) return;
  const dist = Math.hypot(cam.x, cam.z + 1.9);
  audio.engine.gain.value = state.mode === 'play' || state.mode === 'intro' ? Math.min(0.5, 0.9 / (1 + dist * dist * 0.25)) : 0;
  // Grillos que van y vienen
  audio.crickets.gain.value = Math.sin(time * 0.7) > 0.2 ? 0.012 : 0.0;
}
// Golpe sobre el piso de la caja: seco y corto si es macizo, grave y con resonancia si está hueco
function knockSound(hollow) {
  if (!audio.ctx || !audio.on) return;
  const ctx = audio.ctx, t0 = ctx.currentTime;
  for (let k = 0; k < 3; k++) {
    const t = t0 + k * 0.22;
    const n = ctx.createBufferSource(); n.buffer = audio.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hollow ? 240 : 900; bp.Q.value = hollow ? 6 : 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + (hollow ? 0.45 : 0.07));
    n.connect(bp); bp.connect(g); g.connect(audio.master); n.start(t); n.stop(t + 0.5);
    const o = ctx.createOscillator(); o.frequency.value = hollow ? 118 : 70;
    const og = ctx.createGain(); og.gain.setValueAtTime(hollow ? 0.6 : 0.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + (hollow ? 0.55 : 0.06));
    o.connect(og); og.connect(audio.master); o.start(t); o.stop(t + 0.6);
  }
}

/* =========================================================
   CONTENIDO DEL ESCENARIO (se define en escenario.js)
   ========================================================= */
const POIS = ESC.pois, QUESTIONS = ESC.preguntas, DECISIONS = ESC.decisiones;
const fill = s => String(s).replace(/\{(\w+)\}/g, (m, k) => (CASE && CASE.datos[k] !== undefined ? CASE.datos[k] : m));
const byPerfil = (v, perfil) => (v && typeof v === 'object' ? (v[perfil] !== undefined ? v[perfil] : v.otro) : v);
const poiState = p => p.estados[CASE.estados[p.id]];
const isIrr = p => !p.talk && !!poiState(p).irr;

/* =========================================================
   ESTADO Y UI
   ========================================================= */
const state = {
  mode: 'intro', paused: false, talking: false, marks: {}, inspected: new Set(), asked: new Set(), done: new Set(),
  talkStarted: false, start: 0, dist: 0, nearBed: false, near: [], nearKey: '', torch: false, torchUsedUnder: false,
  notes: [], events: []
};
function logEvent(type, data) { state.events.push(Object.assign({ t: Math.round((Date.now() - state.start) / 100) / 10, type }, data || {})); }

const toastEl = $('#toast'); let toastT = 0;
function toast(msg, ms) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), ms || 2400);
}
function updateCounts() {
  $('#cInspected').textContent = state.inspected.size;
  $('#cMarked').textContent = Object.values(state.marks).filter(v => v === 'irr').length;
  $('#cNotes').textContent = state.notes.length;
}

function openOverlay(node, focusSel) {
  state.paused = true; input.jx = input.jy = 0; input.keys.clear(); resetKnob();
  node.hidden = false;
  requestAnimationFrame(() => node.classList.add('open'));
  setTimeout(() => { const f = node.querySelector(focusSel || 'button'); if (f) f.focus({ preventScroll: true }); }, 60);
}
const OVERLAYS = ['#inspect', '#talk', '#decide', '#notes'];
function hideNode(node) { node.classList.remove('open'); node.hidden = true; if (node.id === 'talk') state.talking = false; }
function closeOverlay(node) {
  hideNode(node);
  if (view.close && (node.id === 'inspect' || node.id === 'talk')) { clearMeasure(); setCloseView(null); }
  state.paused = OVERLAYS.some(s => !$(s).hidden);
}
function closeAll() { OVERLAYS.forEach(s => { const n = $(s); if (!n.hidden) closeOverlay(n); }); }
// Cuánto tapa el panel: abajo en el celular, a la derecha en pantallas anchas
function panelInset(node) {
  // offsetTop/offsetLeft no incluyen la transformación de la animación de entrada
  const p = node.querySelector('.panel'); if (!p) return { r: 0, b: 0 };
  if (window.innerWidth >= 900) return { r: Math.max(0, node.clientWidth - p.offsetLeft), b: 0 };
  return { r: 0, b: Math.max(0, node.clientHeight - p.offsetTop) };
}
function openView(node, v, focusSel) {
  ['#inspect', '#talk'].forEach(s => { const n = $(s); if (n !== node && !n.hidden) hideNode(n); });
  clearMeasure();
  openOverlay(node, focusSel);
  requestAnimationFrame(() => { if (!node.hidden) setCloseView(v, panelInset(node)); });
}
// Si el panel crece (por ejemplo, al mostrar una medida), reacomoda el encuadre sin mover la cámara
function refit(node) {
  requestAnimationFrame(() => {
    if (!view.close || node.hidden) return;
    view.from = Object.assign({}, cam); view.insetFrom = Object.assign({}, view.inset);
    view.insetTo = panelInset(node); view.blend = 0;
  });
}

/* ---------- Libreta: lo que el gendarme fue anotando ---------- */
function note(key, src, text) {
  const n = state.notes.find(x => x.key === key);
  if (n) { n.text = text; if (!$('#notes').hidden) renderNotes(); return; }
  state.notes.push({ key, src, text });
  updateCounts();
  if (!$('#notes').hidden) renderNotes();
  const b = $('#notesBtn'); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
}
function openNotes() {
  renderNotes();
  openOverlay($('#notes'), '#notesClose');
  logEvent('libreta');
}
function renderNotes() {
  const list = $('#notesList'); list.innerHTML = '';
  if (!state.notes.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Todavía no anotaste nada. Lo que mirás, medís y te responden se anota acá.'; list.appendChild(li); }
  state.notes.forEach(n => {
    const li = document.createElement('li');
    const s = document.createElement('span'); s.className = 'who'; s.textContent = n.src;
    const t = document.createElement('span'); t.textContent = n.text;
    li.append(s, t); list.appendChild(li);
  });
}
$('#notesBtn').onclick = openNotes;
$('#notesClose').onclick = () => closeOverlay($('#notes'));

/* ---------- Puntos de interés cercanos ---------- */
const fwd = new THREE.Vector3(), dir = new THREE.Vector3();
let nearTimer = 0;
function updateNearby(dt) {
  nearTimer += dt; if (nearTimer < 0.12) return; nearTimer = 0;
  camera.getWorldDirection(fwd);
  const pl = { x: player.x, z: player.z };
  const list = [];
  for (const p of POIS) {
    if (p.crouch && !player.crouch) continue;
    if (!p.side(pl)) continue;
    const hd = Math.hypot(p.p[0] - player.x, p.p[2] - player.z);
    if (hd > p.range) continue;
    dir.set(p.p[0] - camera.position.x, p.p[1] - camera.position.y, p.p[2] - camera.position.z).normalize();
    const dot = dir.dot(fwd);
    if (dot < 0.72) continue;
    list.push({ p, dot });
  }
  list.sort((a, b) => b.dot - a.dot);
  // Los dos más centrados, en un orden fijo para que los botones no salten de lugar
  const top = list.slice(0, 2).map(x => x.p).sort((a, b) => POIS.indexOf(a) - POIS.indexOf(b));
  state.focus = list.length ? list[0].p : null;   // el más centrado: es el que abre la tecla E
  const key = top.map(p => p.id + (state.inspected.has(p.id) ? '*' : '')).join('|');
  if (key === state.nearKey) return;
  state.nearKey = key; state.near = top;
  const acts = $('#acts'); acts.innerHTML = '';
  top.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'act';
    b.textContent = (p.talk ? 'Hablar: ' : 'Revisar: ') + p.label;
    if (!p.talk && state.inspected.has(p.id)) {
      const s = document.createElement('span'); s.className = 'seen'; s.textContent = ' (revisado)'; b.appendChild(s);
    }
    b.onclick = () => openPoi(p);
    acts.appendChild(b);
  });
}
function openPoi(p) { if (p.talk) openTalk(p); else openInspect(p); }
function nearestVista(p) {
  return p.vistas.slice().sort((a, b) => Math.hypot(a.pos[0] - player.x, a.pos[2] - player.z) - Math.hypot(b.pos[0] - player.x, b.pos[2] - player.z))[0];
}

/* ---------- Inspección ---------- */
let currentPoi = null;
function markLabel(v) { return v === 'irr' ? 'Lo marcaste como irregular.' : v === 'ok' ? 'Lo marcaste como no irregular.' : 'Todavía no lo marcaste.'; }
function poiText(p) {
  if (p.oscuro && !state.torch) return p.textoOscuro;
  const st = poiState(p);
  return fill(st.text || p.text);
}
function visualHTML(p) {
  const d = CASE.datos, esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (p.visual === 'plate') return `<div class="plate${CASE.estados.plate === 'cambiada' ? ' plate-new' : ''}" role="img" aria-label="Patente ${esc(d.dominio)}"><div class="plate-band">REPÚBLICA ARGENTINA</div><div class="plate-num">${esc(d.dominio)}</div></div>`;
  if (p.visual === 'etch') return CASE.estados.etch === 'raspado'
    ? '<div class="etch etch-scratched" role="img" aria-label="Grabado raspado, ilegible"><span>&nbsp;</span></div>'
    : `<div class="etch" role="img" aria-label="Grabado ${esc(d.grabado)}">${esc(d.grabado)}</div>`;
  if (p.visual === 'vin') return `<div class="vin" role="img" aria-label="Número de chasis ${esc(d.chapaChasis)}">${esc(d.chapaChasis)}</div>`;
  if (p.visual === 'ticket') return `<div class="ticket" role="img" aria-label="Ticket de ${esc(d.ticketLugar)}, ${esc(d.ticketFecha)}, ${esc(d.ticketHora)}"><strong>ESTACIÓN RN34</strong><span>${esc(d.ticketLugar.toUpperCase())}</span><span>${esc(d.ticketFecha)} ${esc(d.ticketHora)}</span><span>GASOIL G3</span><span>${esc(d.ticketLitros)} L</span></div>`;
  return '';
}
// Lo que se anota en la libreta al leer algo
function readNote(p) {
  const d = CASE.datos;
  if (p.id === 'ticket') note('ticket', 'Tablero', `Ticket de ${d.ticketLugar}, ${d.ticketFecha} a las ${d.ticketHora}.`);
  if (p.id === 'etch') note('etch', 'Parabrisas', CASE.estados.etch === 'raspado' ? 'Grabado del dominio raspado, ilegible.' : `Grabado: ${d.grabado}.`);
  if (p.id === 'vin') note('vin', 'Chasis', `Chapa del chasis: ${d.chapaChasis}.`);
  if (p.id === 'plate') note('plate', 'Patente', `Patente trasera: ${d.dominio}.`);
  if (p.id === 'under' && state.torch) note('under', 'Debajo', poiText(p));
}
function openInspect(p) {
  currentPoi = p;
  state.inspected.add(p.id); state.nearKey = '';
  if (p.id === 'under' && state.torch) state.torchUsedUnder = true;
  logEvent('revisar', { poi: p.id, linterna: state.torch });
  $('#inTitle').textContent = p.label;
  $('#inText').textContent = poiText(p);
  $('#inResult').hidden = true; $('#inResult').textContent = '';
  $('#inState').textContent = markLabel(state.marks[p.id]);
  const vis = $('#inVisual'), html = visualHTML(p);
  vis.hidden = !html; vis.innerHTML = html;
  renderActions(p);
  readNote(p);
  updateCounts();
  openView($('#inspect'), nearestVista(p), '#inActs button, #markIrr');
}
function renderActions(p, focusId) {
  const box = $('#inActs');
  const hadFocus = box.contains(document.activeElement);
  box.innerHTML = '';
  const acts = (p.acciones || []).slice();
  if (p.oscuro && !state.torch) acts.unshift({ id: 'linterna', label: 'Prender la linterna' });
  box.hidden = !acts.length;
  acts.forEach(a => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chipbtn'; b.textContent = a.label;
    if (state.done.has(p.id + ':' + a.id)) b.classList.add('done');
    b.onclick = () => doAction(p, a);
    b.dataset.id = a.id;
    box.appendChild(b);
  });
  // Mantener el foco del teclado en la acción que se acaba de usar (o en la primera)
  if (hadFocus || focusId) {
    const f = box.querySelector(`[data-id="${focusId}"]`) || box.querySelector('button') || $('#markIrr');
    if (f) f.focus({ preventScroll: true });
  }
}
function showResult(text) { const r = $('#inResult'); r.hidden = false; r.textContent = text; }
function doAction(p, a) {
  const e = CASE.estados, d = CASE.datos;
  state.done.add(p.id + ':' + a.id);
  logEvent('accion', { poi: p.id, accion: a.id });
  let txt = '';
  if (a.id === 'linterna') { setTorch(true); return; }
  if ((a.id === 'luzDel' || a.id === 'luzTras') && view.close && !p.vistas.includes(view.close)) setCloseView(nearestVista(p), view.insetTo);
  if (a.id === 'luzDel') { txt = `Entre el guardabarros y la cubierta hay ${d.gapF} cm.`; note('luzDel', 'Rueda delantera', `Luz: ${d.gapF} cm.`); showMeasure('gapF'); }
  if (a.id === 'luzTras') { txt = `Entre el guardabarros y la cubierta hay ${d.gapR} cm.`; note('luzTras', 'Rueda trasera', `Luz: ${d.gapR} cm.`); showMeasure('gapR'); }
  if (a.id === 'ballesta') {
    txt = e.rwheel === 'normal' ? 'La ballesta está arqueada, con las hojas separadas en las puntas.' : 'La ballesta está casi plana.';
    note('ballesta', 'Rueda trasera', txt);
    setCloseView({ pos: [-1.25, 0.3, 2.75], mira: [-0.45, 0.5, 1.95], fov: 50 }, view.insetTo);
  }
  if (a.id === 'interior') {
    txt = `Por dentro, del piso al borde: ${d.int} cm.`; note('interior', 'Caja', `Por dentro: ${d.int} cm.`); showMeasure('int');
    setCloseView({ pos: [0.2, 1.8, 2.35], mira: [-0.8, 1.02, 2.35], fov: 45 }, view.insetTo);
  }
  if (a.id === 'exterior') {
    txt = `Por fuera, del borde inferior de la pared al borde superior: ${d.ext} cm.`; note('exterior', 'Caja', `Por fuera: ${d.ext} cm.`); showMeasure('ext');
    setCloseView({ pos: [-1.95, 1.12, 2.35], mira: [-0.93, 1.02, 2.35], fov: 45 }, view.insetTo);
  }
  if (a.id === 'golpear') {
    const hollow = e.bed === 'dobleFondo';
    txt = hollow ? 'Golpeás el piso con los nudillos: suena grave y resuena, como si abajo hubiera un hueco.' : 'Golpeás el piso con los nudillos: suena seco y corto, macizo.';
    knockSound(hollow); note('golpear', 'Caja', hollow ? 'El piso suena hueco.' : 'El piso suena macizo.');
  }
  if (a.id === 'piso') {
    txt = e.bed === 'dobleFondo'
      ? (CASE.fisico.tornillosNuevos ? 'El piso está pintado de negro. Algunos tornillos son nuevos, sin óxido y con marcas de herramienta.' : 'El piso está pintado de negro. Los tornillos tienen el mismo óxido que el resto.')
      : 'Chapa original del piso. Los tornillos tienen el mismo óxido que el resto.';
    note('piso', 'Caja', txt);
    setCloseView({ pos: [-0.45, 1.6, 2.3], mira: [-0.15, truck.userData.floorTop, 1.8], fov: 45 }, view.insetTo);
  }
  showResult(txt);
  renderActions(p, a.id);
  refit($('#inspect'));
}
function setMark(v) {
  if (!currentPoi) return;
  state.marks[currentPoi.id] = v; updateCounts();
  logEvent('marca', { poi: currentPoi.id, valor: v });
  closeOverlay($('#inspect'));
  toast(v === 'irr' ? currentPoi.label + ': marcado como irregular' : currentPoi.label + ': marcado como no irregular', 1800);
}
$('#markIrr').onclick = () => setMark('irr');
$('#markOk').onclick = () => setMark('ok');
$('#inClose').onclick = () => closeOverlay($('#inspect'));

/* ---------- Cinta métrica ---------- */
let measureObj = null;
function clearMeasure() { if (measureObj) { scene.remove(measureObj); disposeTree(measureObj); measureObj = null; } }
function showMeasure(kind) {
  clearMeasure();
  const g = new THREE.Group(), lift = truck.userData.lift, pitch = truck.userData.pitch;
  const worldY = (y, z) => y + lift - z * pitch;
  let a, b, label;
  if (kind === 'gapF' || kind === 'gapR') {
    const z = kind === 'gapF' ? FZ : RZ;
    a = [-0.95, WR * 2, z]; b = [-0.95, worldY(WR + ARCH, z), z]; label = (kind === 'gapF' ? CASE.datos.gapF : CASE.datos.gapR) + ' cm';
  } else if (kind === 'int') {
    a = [-0.78, worldY(truck.userData.floorTop, 2.35), 2.35]; b = [-0.78, worldY(BED.top, 2.35), 2.35]; label = CASE.datos.int + ' cm';
  } else {
    a = [-0.95, worldY(BED.wall0, 2.35), 2.35]; b = [-0.95, worldY(BED.top, 2.35), 2.35]; label = CASE.datos.ext + ' cm';
  }
  const len = b[1] - a[1];
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.018, len, 0.004), new THREE.MeshBasicMaterial({ color: 0xf2c230, depthTest: false }));
  tape.position.set(a[0], a[1] + len / 2, a[2]); tape.rotation.y = Math.PI / 2; tape.renderOrder = 10; g.add(tape);
  [a, b].forEach(p => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, 0.05), new THREE.MeshBasicMaterial({ color: 0x222222, depthTest: false })); t.position.set(p[0], p[1], p[2]); t.renderOrder = 11; g.add(t); });
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, map: canvasTex(128, 48, (x, w, h) => {
    x.fillStyle = 'rgba(20,22,26,.85)'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2c230'; x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, w / 2, h / 2 + 1);
  }) }));
  // La etiqueta va al costado de la cinta, sin tapar lo que mide
  spr.scale.set(0.16, 0.06, 1); spr.position.set(a[0] - 0.02, a[1] + len / 2, a[2] + 0.13); spr.renderOrder = 12; g.add(spr);
  measureObj = g; scene.add(g);
}

/* ---------- Linterna ---------- */
function setTorch(on) {
  if (state.torch === on && torch.intensity === (on ? TORCH : 0)) return;
  state.torch = on;
  torch.intensity = on ? TORCH : 0;
  setShade(on);
  const b = $('#torchBtn'); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Apagar linterna' : 'Linterna';
  logEvent('linterna', { on });
  if (currentPoi && !$('#inspect').hidden) {
    if (on && currentPoi.id === 'under') state.torchUsedUnder = true;
    $('#inText').textContent = poiText(currentPoi); readNote(currentPoi); renderActions(currentPoi);
    refit($('#inspect'));
  }
}
$('#torchBtn').onclick = () => setTorch(!state.torch);

/* ---------- Charla ---------- */
function logLine(who, text, them) {
  const li = document.createElement('li'); if (them) li.className = 'them';
  const w = document.createElement('span'); w.className = 'who'; w.textContent = who;
  const m = document.createElement('span'); m.textContent = text;
  li.append(w, m); $('#log').appendChild(li);
  return li;
}
function docsCards() {
  const d = document.createElement('div'); d.className = 'cards';
  ESC.documentos.forEach(doc => {
    const art = document.createElement('article'); art.className = 'card card-' + doc.tipo;
    const h = document.createElement('h3'); h.textContent = doc.titulo;
    const dl = document.createElement('dl');
    doc.campos.forEach(([k, v]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = fill(v);
      if (k === 'Chasis' || k === 'Motor') dd.className = 'mono';
      row.append(dt, dd); dl.appendChild(row);
    });
    art.append(h, dl); d.appendChild(art);
  });
  const li = document.createElement('li'); li.className = 'them'; li.appendChild(d); $('#log').appendChild(li);
  const c = CASE.datos;
  note('docs', 'Cédula', `Dominio ${c.dominio}. Chasis ${c.chasis}. Titular: Núñez, Javier Omar.`);
}
function answerOf(q) {
  const nerv = CASE.conducta === 'nervioso';
  if (!q.dep) return q.a;
  const k = CASE.estados[q.dep];
  return (nerv && q.nervioso && q.nervioso[k]) || q.a[k];
}
let answering = false, run = 0;
function renderQuestions(focus) {
  const qs = $('#qs'); qs.innerHTML = '';
  QUESTIONS.forEach(q => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'q'; b.textContent = q.q;
    b.disabled = answering || state.asked.has(q.id);
    b.onclick = () => {
      state.asked.add(q.id); answering = true;
      logEvent('pregunta', { id: q.id });
      logLine('Vos', q.q, false);
      const a = answerOf(q);
      // Un nervioso tarda más en contestar lo que le incomoda
      const slow = CASE.conducta === 'nervioso' && (q.id === 'cargo' || q.id === 'service');
      const typing = logLine('Conductor', '…', true);
      renderQuestions();
      const myRun = run;
      setTimeout(() => {
        if (myRun !== run) return;
        typing.lastChild.textContent = a;
        note('q-' + q.id, 'Conductor', `${q.q} "${a}"`);
        if (q.docs) docsCards();
        const wasHere = !$('#talk').hidden && (document.activeElement === document.body || $('#talk').contains(document.activeElement));
        answering = false; renderQuestions(wasHere);
        const panel = $('#talk .panel'); panel.scrollTop = panel.scrollHeight;
        refit($('#talk'));
      }, reduceMotion ? 0 : (slow ? 1500 : 550));
      const panel = $('#talk .panel'); panel.scrollTop = panel.scrollHeight;
    };
    qs.appendChild(b);
  });
  if (focus) { const f = qs.querySelector('.q:not([disabled])') || $('#talkClose'); f.focus({ preventScroll: true }); }
}
function openTalk(p) {
  state.talking = true;
  logEvent('charla');
  if (!state.talkStarted) {
    state.talkStarted = true;
    ESC.charla.apertura.forEach(([who, text]) => logLine(who, text, who !== 'Vos'));
  }
  renderQuestions();
  openView($('#talk'), p.vistas[0], '.q:not([disabled])');
}
$('#talkClose').onclick = () => closeOverlay($('#talk'));

/* ---------- Decisión ---------- */
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function openDecide() {
  ['#inspect', '#talk', '#notes'].forEach(s => { const n = $(s); if (!n.hidden) closeOverlay(n); });
  const marked = POIS.filter(p => state.marks[p.id] === 'irr');
  const box = $('#decMarked'); box.innerHTML = '';
  const p = document.createElement('p'); p.className = 'muted';
  if (marked.length) {
    p.textContent = `Marcaste ${marked.length} ${marked.length === 1 ? 'cosa' : 'cosas'} como irregular:`;
    const ul = document.createElement('ul'); ul.className = 'marked';
    marked.forEach(m => { const li = document.createElement('li'); li.textContent = m.label; ul.appendChild(li); });
    box.append(p, ul);
  } else { p.textContent = 'No marcaste nada como irregular.'; box.appendChild(p); }
  const ch = $('#decChoices'); ch.innerHTML = '';
  shuffle(DECISIONS).forEach(d => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'q'; b.textContent = d.t;
    b.onclick = () => { closeOverlay($('#decide')); finish(d); };
    ch.appendChild(b);
  });
  openOverlay($('#decide'), '.q');
}
$('#endBtn').onclick = openDecide;
$('#decBack').onclick = () => closeOverlay($('#decide'));

/* ---------- Resultado ---------- */
function chip(cls, text) { const s = document.createElement('span'); s.className = 'chip ' + cls; s.textContent = text; return s; }
function para(label, text) {
  const p = document.createElement('p');
  if (label) { const s = document.createElement('strong'); s.textContent = label; p.appendChild(s); }
  p.appendChild(document.createTextNode(text)); return p;
}
function finish(d) {
  closeAll();
  state.mode = 'debrief';
  if (player.crouch) toggleCrouch();
  Object.assign(player, { x: START.x, z: START.z, yaw: Math.atan2(-2.6, 6.5), pitch: -0.08 });
  setPlayUI(false);
  setTorch(false);
  const perfil = CASE.perfil;
  const items = POIS.filter(p => !p.talk);
  const irrTotal = items.filter(isIrr).length;
  const found = items.filter(p => isIrr(p) && state.marks[p.id] === 'irr').length;
  const falsePos = items.filter(p => !isIrr(p) && state.marks[p.id] === 'irr').length;
  const v = byPerfil(d.v, perfil);
  const best = DECISIONS.find(x => byPerfil(x.v, perfil) === 'best');
  logEvent('decision', { id: d.id, calificacion: v, detectados: found, total: irrTotal, falsosPositivos: falsePos });
  let title;
  if (v === 'best') {
    if (CASE.sospechoso) title = found >= Math.ceil(irrTotal * ESC.umbral) ? 'Procedimiento correcto' : 'Decisión correcta, con indicios sin detectar';
    else title = falsePos ? 'Decisión correcta, con falsos positivos' : 'Control correcto';
  } else title = byPerfil(d.titulo, perfil) || 'Decisión mejorable';
  $('#dbTitle').textContent = title;
  $('#dbText').textContent = fill(byPerfil(d.end, perfil));
  $('#dbFound').textContent = irrTotal ? `${found} de ${irrTotal}` : 'No había';
  $('#dbFalse').textContent = String(falsePos);
  const secs = Math.round((Date.now() - state.start) / 1000);
  $('#dbTime').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('#dbCase').textContent = `Caso ${CASE.semilla}: ${ESC.perfiles[perfil].nombre.toLowerCase()}.`;

  const dec = $('#dbDecision'); dec.innerHTML = '';
  const dli = document.createElement('li');
  const dh = document.createElement('div'); dh.className = 'head';
  const dn = document.createElement('strong'); dn.textContent = 'Cómo seguiste';
  dh.append(dn, chip(v === 'best' ? 'good' : v === 'partial' ? 'warn' : 'bad', v === 'best' ? 'Correcto' : v === 'partial' ? 'Parcial' : 'Incorrecto'));
  dli.append(dh, para('Elegiste: ', d.t), para('', fill(byPerfil(d.fb, perfil))));
  if (v !== 'best' && best) dli.appendChild(para('La mejor opción en este caso: ', best.t));
  dec.appendChild(dli);

  const list = $('#dbList'); list.innerHTML = '';
  const order = items.slice().sort((a, b) => (isIrr(b) ? 1 : 0) - (isIrr(a) ? 1 : 0));
  order.forEach(p => {
    const li = document.createElement('li');
    const h = document.createElement('div'); h.className = 'head';
    const n = document.createElement('strong'); n.textContent = p.label; h.appendChild(n);
    const seen = state.inspected.has(p.id), mark = state.marks[p.id];
    let c;
    if (isIrr(p)) {
      if (mark === 'irr') c = chip('good', 'Detectado');
      else if (mark === 'ok') c = chip('bad', 'Lo descartaste');
      else if (seen) c = chip('warn', 'Lo viste sin marcarlo');
      else c = chip('bad', 'No lo revisaste');
    } else {
      if (mark === 'irr') c = chip('warn', 'Falso positivo');
      else if (seen) c = chip('good', 'Bien descartado');
      else { c = chip('none', 'Sin revisar'); li.className = 'quiet'; }
    }
    h.appendChild(c);
    li.append(h, para('', fill(poiState(p).why)));
    list.appendChild(li);
  });

  const notes = $('#dbNotes'); notes.innerHTML = '';
  const addNote = t => { const n = document.createElement('p'); n.className = 'note'; n.textContent = t; notes.appendChild(n); };
  const e = CASE.estados, N = ESC.notas, has = id => state.done.has(id);
  if (e.ticket === 'contradice' && !state.asked.has('route')) addNote(N.sinRuta);
  if ((e.etch !== 'coincide' || e.vin === 'distinto') && !state.asked.has('docs')) addNote(N.sinDocs);
  if (state.inspected.has('under') && !state.torchUsedUnder && e.under !== 'normal') addNote(N.sinLinterna);
  if (e.bed === 'dobleFondo' && !(has('bed:interior') && has('bed:exterior'))) addNote(N.sinMedirCaja);
  if (e.rwheel === 'baja' && !(has('fwheel:luzDel') && has('rwheel:luzTras'))) addNote(N.sinComparar);
  if (e.under !== 'normal' && !state.asked.has('service')) addNote(N.sinService);
  const C = ESC.notaConducta;
  if (CASE.conducta === 'nervioso') addNote(CASE.sospechoso ? (state.nearBed ? C.vista : C.noVista) : C.nerviosoLimpio);
  else if (CASE.sospechoso) addNote(C.calmoSospechoso);

  $('#debrief').hidden = false;
  $('#debrief').scrollTop = 0;
  setTimeout(() => $('#newBtn').focus({ preventScroll: true }), 60);
}
function downloadLog() {
  const data = { caso: CASE.semilla, perfil: CASE.perfil, estados: CASE.estados, conducta: CASE.conducta, fecha: new Date().toISOString(), eventos: state.events };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `control-ruta-caso-${CASE.semilla}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#logBtn').onclick = downloadLog;

/* ---------- Inicio ---------- */
function setPlayUI(on) {
  $('#hud').hidden = !on;
  $('#actionsCol').hidden = !on;
  $('#stick').hidden = !(on && coarse);
  $('#reticle').hidden = !on;
}
function newCase(semilla) {
  CASE = window.generarCaso(ESC, { semilla, perfil: params.get('perfil') });
  buildTruck();
}
function start(semilla) {
  if (semilla !== undefined) newCase(semilla);
  run++; answering = false;
  audioInit(); if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  Object.assign(state, { mode: 'play', paused: false, talking: false, marks: {}, inspected: new Set(), asked: new Set(), done: new Set(),
    talkStarted: false, start: Date.now(), dist: 0, nearBed: false, near: [], focus: null, nearKey: '', torchUsedUnder: false, notes: [], events: [] });
  Object.assign(player, { x: START.x, z: START.z, yaw: Math.atan2(-2.6, 6.5), pitch: -0.08, crouch: false });
  view.close = null; view.blend = 1; view.inset = { r: 0, b: 0 }; applyViewOffset();
  setTorch(false);
  $('#crouchBtn').setAttribute('aria-pressed', 'false'); $('#crouchBtn').textContent = 'Agacharse';
  $('#log').innerHTML = ''; $('#acts').innerHTML = '';
  updateCounts();
  $('#intro').hidden = true; $('#debrief').hidden = true;
  setPlayUI(true);
  logEvent('inicio', { caso: CASE.semilla });
  toast('Caminá alrededor de la camioneta. Acercate y mirá lo que quieras revisar.', 4200);
}
$('#startBtn').onclick = () => start();
$('#retryBtn').onclick = () => start(CASE.semilla);
$('#newBtn').onclick = () => start(null);
$('#soundChk').onchange = e => audioToggle(e.target.checked);

$('#controlsHelp').innerHTML = coarse
  ? '<span>Mové el joystick para caminar y arrastrá en la pantalla para mirar.</span><span>Cuando mires algo de cerca, aparece un botón para revisarlo. Usá Agacharse para ver debajo del vehículo y Linterna cuando falte luz.</span>'
  : '<span>W A S D para caminar y arrastrá con el mouse para mirar.</span><span>E para revisar lo que tenés enfrente, C para agacharte, F para la linterna y L para la libreta.</span>';

function toggleCrouch() {
  player.crouch = !player.crouch;
  const b = $('#crouchBtn');
  b.setAttribute('aria-pressed', String(player.crouch));
  b.textContent = player.crouch ? 'Pararse' : 'Agacharse';
  state.nearKey = '';
  logEvent('agacharse', { on: player.crouch });
}
$('#crouchBtn').onclick = toggleCrouch;

/* ---------- Entrada ---------- */
const stick = $('#stick'), knob = $('#knob');
let stickId = null;
function resetKnob() { knob.style.transform = ''; }
stick.addEventListener('pointerdown', e => {
  if (state.mode !== 'play' || state.paused) return;
  stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); e.preventDefault();
});
stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
const stickEnd = e => { if (e.pointerId === stickId) { stickId = null; input.jx = input.jy = 0; resetKnob(); } };
stick.addEventListener('pointerup', stickEnd);
stick.addEventListener('pointercancel', stickEnd);
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = 46, len = Math.hypot(dx, dy);
  if (len > max) { dx *= max / len; dy *= max / len; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  input.jx = dx / max; input.jy = -dy / max;
}

// Arrastrar para mirar. Con un encuadre de cerca abierto, se puede mirar un poco alrededor.
let lookId = null, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', e => {
  if (state.mode !== 'play' || lookId !== null) return;
  if (state.paused && !view.close) return;
  lookId = e.pointerId; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== lookId) return;
  const s = e.pointerType === 'mouse' ? 0.0042 : 0.0065;
  if (view.close) {
    view.dyaw = Math.max(-0.7, Math.min(0.7, view.dyaw - (e.clientX - lx) * s));
    view.dpitch = Math.max(-0.5, Math.min(0.5, view.dpitch - (e.clientY - ly) * s));
  } else {
    player.yaw -= (e.clientX - lx) * s;
    player.pitch = Math.max(-1.25, Math.min(1.1, player.pitch - (e.clientY - ly) * s));
  }
  lx = e.clientX; ly = e.clientY;
});
const lookEnd = e => { if (e.pointerId === lookId) lookId = null; };
canvas.addEventListener('pointerup', lookEnd);
canvas.addEventListener('pointercancel', lookEnd);

window.addEventListener('keydown', e => {
  if (state.mode !== 'play') return;
  if (e.code === 'Escape') {
    // Cierra solo el panel de arriba (la libreta puede estar sobre una inspección)
    const top = ['#notes', '#decide', '#inspect', '#talk'].map(s => $(s)).find(n => !n.hidden);
    if (top) closeOverlay(top);
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
  if (e.code === 'KeyF') { setTorch(!state.torch); return; }
  if (e.code === 'KeyM') { audioToggle(!audio.on); $('#soundChk').checked = audio.on; toast(audio.on ? 'Sonido activado' : 'Sonido desactivado', 1400); return; }
  if (state.paused) return;
  if (e.code === 'KeyC') { toggleCrouch(); return; }
  if (e.code === 'KeyL') { openNotes(); return; }
  if (e.code === 'KeyE' && state.focus) { openPoi(state.focus); return; }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { input.keys.add(e.code); e.preventDefault(); }
});
window.addEventListener('keyup', e => input.keys.delete(e.code));
window.addEventListener('blur', () => { input.keys.clear(); input.jx = input.jy = 0; resetKnob(); });

/* ---------- Depuración (?debug) ---------- */
function renderDebug() {
  let el = $('#debug');
  if (!el) { el = document.createElement('pre'); el.id = 'debug'; el.className = 'debug'; document.body.appendChild(el); }
  el.textContent = `caso ${CASE.semilla} · ${CASE.perfil} · ${CASE.conducta}\n` + Object.entries(CASE.estados).map(([k, v]) => `${k}: ${v}`).join('\n');
}

/* ---------- Bucle ---------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (renderer) { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h, false); }
  if (!view.close) cam.fov = baseFov(); camera.fov = cam.fov;
  for (const id of ['inspect', 'talk']) { const n = $('#' + id); if (!n.hidden && view.close) { view.insetTo = panelInset(n); view.inset = Object.assign({}, view.insetTo); } }
  applyViewOffset();
}
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(raw, 0.05); last = now; time += dt;
  if (state.mode === 'play' && !state.paused) { move(dt); updateNearby(dt); }
  if (state.mode === 'intro' && !reduceMotion) { player.yaw = Math.atan2(-2.6, 6.5) + Math.sin(time * 0.2) * 0.12; }
  updateCamera(dt, Math.min(raw, 0.25)); updateDriver(dt); updateLamps(); updateAudio();
  if (renderer) renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
newCase(params.get('caso') || undefined);
window.__dbg = { player, state, POIS, camera, view, blocked, renderer, get CASE() { return CASE; }, start, setTorch };
resize();
requestAnimationFrame(frame);
})();
