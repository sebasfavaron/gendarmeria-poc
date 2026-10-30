/*
 * La Hilux en la escena (assets hilux-*.glb, preparada por tools/assets/hilux.mjs y medida por medir-hilux.mjs).
 *   prepararHilux(gltf) -> plantilla (materiales ajustados una vez: suciedad, oclusión de lo de abajo)
 *   camionetaCaso(plantilla, M, caso) -> { grupo, cuerpo, medida(tipo) -> { a, b }, cabina, liberar() }
 *   camionetaGendarmeria(plantilla, M) -> { grupo, luces: [azul, rojo], destellos: [PointLight, PointLight] }
 * M son las medidas de la malla (assets/hilux.medidas.js). Todo lo que cambia según el caso se agrega acá,
 * sobre las piezas reales del modelo, y cuelga del cuerpo para inclinarse con la suspensión.
 */
import * as THREE from 'three';
import { std, glow, box, cyl, canvasTex, noiseRnd, sombras } from './nucleo.js';

const v3 = a => new THREE.Vector3().fromArray(a);

/* ---------- Suciedad ---------- */
// Polvo de ripio salteño: aclara y apaga el color hacia abajo, con manchas. Se agrega al shader del material.
function ensuciar(m, fuerza, alto) {
  if (m.userData.sucio) return;
  m.userData.sucio = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.uPolvo = { value: new THREE.Color(0x8a7a62) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMundo;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vMundo; uniform vec3 uPolvo;
      float hashP(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float ruidoP(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hashP(i), hashP(i + vec3(1,0,0)), f.x), mix(hashP(i + vec3(0,1,0)), hashP(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hashP(i + vec3(0,0,1)), hashP(i + vec3(1,0,1)), f.x), mix(hashP(i + vec3(0,1,1)), hashP(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      float manchas = ruidoP(vMundo * 7.0) * 0.6 + ruidoP(vMundo * 23.0) * 0.4;
      float polvo = smoothstep(${alto.toFixed(2)}, 0.15, vMundo.y) * (0.45 + 0.55 * manchas) * ${fuerza.toFixed(2)};
      diffuseColor.rgb = mix(diffuseColor.rgb, uPolvo, clamp(polvo, 0.0, 0.85));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 1.0, clamp(polvo * 1.4, 0.0, 1.0));`);
  };
  m.customProgramCacheKey = () => 'polvo' + fuerza + alto;
  m.needsUpdate = true;
}

export function prepararHilux(gltf) {
  const raiz = gltf.scene;
  raiz.traverse(n => {
    if (!n.isMesh) return;
    n.castShadow = true; n.receiveShadow = true;
    const m = n.material;
    if (/glass/i.test(m.name)) return;
    const caja = new THREE.Box3().setFromObject(n);
    const interior = /_int|seat|velvet|leather|plastic_roof|ind_|Android|stitch/.test(m.name);
    if (interior) return;
    const rueda = /tire|Material_342|Material_348|silver|DRUM|TYRE/i.test(m.name);
    if (rueda) ensuciar(m, 0.3, 0.45);   // cubiertas y llantas: algo de polvo abajo
    else if (caja.max.y < 0.78) {
      // Lo de abajo: casi no le llega la luz del cielo (oclusión fija) y está cubierto de tierra
      m.envMapIntensity = 0.2;
      ensuciar(m, 0.95, 0.95);
    } else ensuciar(m, m.name === 'pintura' ? 0.7 : 0.5, 0.75);
  });
  // Vidrios: el modelo trae vidrios polarizados casi negros; en la ruta los de una Hilux son claros
  raiz.traverse(n => {
    if (!n.isMesh || !/glass/i.test(n.material.name) || /r_glass|o_glass|dashboard/.test(n.material.name)) return;
    const m = n.material; m.transparent = true; m.opacity = Math.min(m.opacity, 0.22); m.depthWrite = false;
    m.color = new THREE.Color(0x2a3540); m.roughness = 0.05; m.metalness = 0;
  });
  // Ventanilla del conductor bajada: para el control, la baja (el gendarme le habla por ahí)
  raiz.traverse(n => {
    if (!n.isMesh || !/glass/i.test(n.material.name)) return;
    const c = new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3());
    if (c.x < -0.6 && c.y > 1.0 && c.z > -1.05 && c.z < -0.15) n.visible = false;
  });
  // Luces encendidas: ópticas delanteras y cristales de las traseras (rojo) y de los giros (ámbar)
  raiz.traverse(n => {
    if (!n.isMesh) return;
    const m = n.material;
    if (m.name === 'light') { m.emissive = new THREE.Color(0xfff1d8); m.emissiveMap = m.map || null; m.emissiveIntensity = 1.4; }
    if (m.name === 'r_glass') { m.emissive = new THREE.Color(0xff1a10); m.emissiveIntensity = 0.55; }
    if (m.name === 'o_glass') { m.emissive = new THREE.Color(0xff8a20); m.emissiveIntensity = 0.15; }
  });
  const pintura = buscarMaterial(raiz, 'pintura');
  if (pintura) { pintura.clearcoat = 1; pintura.clearcoatRoughness = 0.08; pintura.roughness = Math.max(pintura.roughness, 0.3); }
  return { gltf, raiz };
}
function buscarMaterial(obj, nombre) { let r = null; obj.traverse(n => { if (n.isMesh && n.material.name === nombre) r = n.material; }); return r; }

/* ---------- Texturas que dependen del caso ---------- */
// Patente Mercosur argentina: 40 × 13 cm, banda azul con "REPÚBLICA ARGENTINA"
function patenteTex(texto, sucia) {
  return canvasTex(512, 166, (x, w, h) => {
    x.fillStyle = '#f2f1ec'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1b3f95'; x.fillRect(0, 0, w, 40);
    x.fillStyle = '#fff'; x.font = 'bold 22px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('REPÚBLICA ARGENTINA', w / 2, 21);
    x.fillStyle = '#9fc7ea'; x.fillRect(20, 10, 26, 18); x.fillStyle = '#fff'; x.fillRect(20, 16, 26, 6);   // bandera
    x.fillStyle = '#121212'; x.font = 'bold 92px "DejaVu Sans Mono", "Courier New", monospace'; x.fillText(texto, w / 2, 108);
    x.strokeStyle = '#1a1a1a'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
    if (sucia) {
      const r = noiseRnd(11);
      for (let i = 0; i < 1100; i++) { x.fillStyle = `rgba(120,98,66,${0.04 + r() * 0.13})`; x.fillRect(r() * w, h * 0.3 + r() * h * 0.7, 2 + r() * 7, 2 + r() * 4); }
    }
  });
}
function grabadoTex(texto, raspado) {
  return canvasTex(256, 64, (x, w, h) => {
    if (raspado) {
      x.fillStyle = 'rgba(225,230,236,.4)'; x.fillRect(14, 10, w - 28, h - 20);
      const r = noiseRnd(29); x.strokeStyle = 'rgba(240,244,248,.8)'; x.lineWidth = 1.3;
      for (let i = 0; i < 70; i++) { const a = r() * w, b = r() * h; x.beginPath(); x.moveTo(a, b); x.lineTo(a + 20 + r() * 40, b + (r() - 0.5) * 22); x.stroke(); }
      return;
    }
    x.fillStyle = 'rgba(235,240,245,.85)'; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(texto, w / 2, h / 2);
  });
}
function chapaVinTex(vin) {
  return canvasTex(512, 96, (x, w, h) => {
    x.fillStyle = '#b8bcc0'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#6b7075'; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4);
    x.fillStyle = '#1c1f22'; x.font = 'bold 44px "DejaVu Sans Mono", "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(vin, w / 2, h / 2 + 2);
  });
}
function ticketTex(d) {
  return canvasTex(160, 288, (x, w, h) => {
    x.fillStyle = '#f3f0e6'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#222'; x.textAlign = 'center';
    x.font = 'bold 20px "DejaVu Sans Mono", "Courier New", monospace'; x.fillText('ESTACIÓN RN34', w / 2, 30);
    x.font = '16px "DejaVu Sans Mono", "Courier New", monospace'; x.fillText(d.ticketLugar.toUpperCase(), w / 2, 54);
    x.fillText(d.ticketFecha, w / 2, 92); x.fillText(d.ticketHora, w / 2, 112);
    x.fillText('GASOIL G3', w / 2, 150); x.fillText(d.ticketLitros + ' L', w / 2, 170);
    x.fillText('- - - - - - - -', w / 2, 200); x.font = 'bold 18px "DejaVu Sans Mono", "Courier New", monospace'; x.fillText('TOTAL', w / 2, 228);
  });
}

// Un plano apoyado en un punto, mirando hacia `normal`, con su "arriba" lo más cerca posible de `arriba`
function calco(padre, tam, punto, normal, arriba, mat, despegue) {
  const n = v3(normal).normalize(), up = v3(arriba).addScaledVector(n, -v3(arriba).dot(n)).normalize();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(tam[0], tam[1]), mat);
  m.matrix.makeBasis(new THREE.Vector3().crossVectors(up, n), up, n);
  m.quaternion.setFromRotationMatrix(m.matrix); m.matrixAutoUpdate = true;
  m.position.copy(v3(punto)).addScaledVector(n, despegue || 0.003);
  padre.add(m);
  return m;
}

/* ---------- Camioneta del caso ---------- */
export function camionetaCaso(plantilla, M, caso, recursos) {
  const e = caso.estados, f = caso.fisico, d = caso.datos;
  const grupo = plantilla.raiz.clone(true);
  const O = n => grupo.getObjectByName(n);
  const cuerpo = O('cuerpo');
  const propios = [];   // geometrías y materiales creados para este caso (los del modelo son compartidos)
  const propio = o => { propios.push(o); return o; };

  // Suspensión: el cuerpo es rígido y las ruedas no se mueven. A partir de la luz de cada eje se calcula
  // cuánto baja el cuerpo adelante y atrás.
  const dF = f.gapF - M.arco.del.luzNominal, dR = f.gapR - M.arco.tras.luzNominal;
  const pitch = (dF - dR) / (M.ejes.tras - M.ejes.del);
  const lift = dF + M.ejes.del * pitch;
  cuerpo.rotation.x = pitch; cuerpo.position.y = lift;
  const bajaEn = z => lift - z * pitch;
  // Ballestas: cada mitad gira en el eje para que su otro extremo acompañe al chasis (con peso, quedan planas)
  ['I', 'D'].forEach(s => ['del', 'tras'].forEach(k => {
    const b = O(`ballesta_${s}_${k}`); if (!b) return;
    const lado = M.ballesta[s === 'I' ? 'izq' : 'der'], zExt = k === 'del' ? lado.zDel : lado.zTras;
    const largo = zExt - b.position.z;     // con signo: la mitad delantera va hacia -z
    b.rotation.x = -Math.asin(Math.max(-0.5, Math.min(0.5, bajaEn(zExt) / largo)));
  }));

  // Rueda de auxilio colgada bajo la caja (el modelo no la trae): copia de una rueda trasera, acostada
  const ruedaT = O('rueda_TI');
  if (ruedaT) {
    const aux = ruedaT.clone(true); aux.name = 'auxilio';
    aux.position.set(-0.05, 0.46, M.caja.zMedida - 0.2);   // delante del paragolpes trasero
    aux.rotation.set(0, 0, Math.PI / 2);
    cuerpo.add(aux);
  }

  // Escape: nuevo (brillante, sin tierra) o con óxido y hollín
  const escape = O('escape');
  if (escape) escape.traverse(n => {
    if (!n.isMesh) return;
    n.material = propio(e.under === 'escapeNuevo'
      ? new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 1, roughness: 0.22 })
      : new THREE.MeshStandardMaterial({ color: 0x5a4636, metalness: 0.5, roughness: 0.85, envMapIntensity: 0.2 }));
    if (e.under !== 'escapeNuevo') ensuciar(n.material, 0.6, 0.9);
  });

  // Patentes (la trasera, si la cambiaron: contorno limpio y tornillos nuevos)
  const brillo = propio(std(0xd5d8dc, { metalness: 1, roughness: 0.2 })), oxido = propio(std(0x5a4632, { roughness: 0.9 }));
  const pT = M.patente.tras, pD = M.patente.del;
  // Delante del marco del modelo (que sobresale unos centímetros)
  calco(cuerpo, [0.4, 0.13], pT.centro, pT.normal, [0, 1, 0], propio(std(0xffffff, { map: patenteTex(d.dominio, true), roughness: 0.45 })), 0.032);
  calco(cuerpo, [0.4, 0.13], pD.centro, pD.normal, [0, 1, 0], propio(std(0xffffff, { map: patenteTex(d.dominio, false), roughness: 0.45 })), 0.032);
  if (e.plate === 'cambiada') calco(cuerpo, [0.47, 0.17], pT.centro, pT.normal, [0, 1, 0], propio(std(0x23252a, { roughness: 0.35, metalness: 0.4 })), 0.028);
  [-0.16, 0.16].forEach(x => cyl(cuerpo, 0.008, 0.008, 0.01, 10, [pT.centro[0] + x, pT.centro[1], pT.centro[2] + 0.037], e.plate === 'cambiada' ? brillo : oxido, [Math.PI / 2, 0, 0]));

  // Grabado del dominio en el parabrisas (del lado del acompañante): se lee desde afuera
  const pb = M.parabrisas;
  calco(cuerpo, [0.2, 0.05], pb.punto, v3(pb.normal).negate().toArray(), [0, 1, 0],
    propio(std(0xffffff, { transparent: true, depthWrite: false, roughness: 0.6, side: THREE.DoubleSide, map: grabadoTex(d.grabado, e.etch === 'raspado') })), 0.006);
  // Chapa con el número de chasis, sobre el tablero del lado del conductor: se lee desde afuera, por el parabrisas
  calco(cuerpo, [0.17, 0.032], M.tablero.vin.punto, M.tablero.vin.normal, [0, 0, 1], propio(std(0xcccccc, { map: chapaVinTex(d.chapaChasis), roughness: 0.35, metalness: 0.6 })), 0.004);
  // Ticket sobre el tablero
  const tk = calco(cuerpo, [0.075, 0.135], M.tablero.ticket.punto, M.tablero.ticket.normal, [0.35, 0, 1], propio(std(0xe6e3da, { map: ticketTex(d), roughness: 0.85 })), 0.003);
  tk.rotateZ(0.35);

  // Caja: doble fondo (chapa negra lisa más alta, que tapa las nervaduras y casi todo el pasarruedas),
  // carga de cemento a la vista y tornillos del piso (nuevos si se tocó el piso)
  const C = M.caja, piso = C.yPiso + f.dobleFondo, zc = (C.z0 + C.z1) / 2, largo = C.z1 - C.z0 - 0.04;
  if (f.dobleFondo) box(cuerpo, [C.x1 - C.x0 - 0.04, 0.012, largo], [(C.x0 + C.x1) / 2, piso - 0.006, zc], propio(std(0x16181b, { roughness: 0.4, metalness: 0.3 })));
  for (let i = 0; i < 8; i++) [-0.5, 0, 0.5].forEach((x, j) => {
    const nuevo = f.tornillosNuevos && (i + j) % 3 === 0;
    cyl(cuerpo, 0.012, 0.012, 0.006, 8, [x, piso + 0.003, C.z0 + 0.12 + i * (largo - 0.16) / 7], nuevo ? brillo : oxido);
  });
  if (e.bed === 'conCarga' && recursos && recursos.get('obj.cemento')) {
    const bolsa = recursos.get('obj.cemento').valor.scene;
    const tb = new THREE.Box3().setFromObject(bolsa), t = tb.getSize(new THREE.Vector3());
    const giro = t.x > t.z ? Math.PI / 2 : 0, alto = t.y;
    // Dos columnas por dos filas, en capas (la caja mide unos 1,5 m de largo)
    for (let k = 0; k < 10; k++) {
      const b = bolsa.clone(true), col = k % 2, fila = Math.floor(k / 2) % 2, capa = Math.floor(k / 4);
      b.rotation.y = giro + ((k * 0.37) % 0.12) - 0.06;
      b.position.set(col ? 0.27 : -0.27, piso - tb.min.y + capa * alto * 0.92, C.z0 + 0.4 + fila * 0.72 + capa * 0.05);
      cuerpo.add(sombras(b, true, true));
    }
  }

  // Debajo de la caja, sobre el larguero izquierdo detrás del eje: soldadura con una chapa agregada, o pintura nueva
  const L = M.larguero, yL = (L.y0 + L.y1) / 2, zL = L.z0 + 0.25;
  if (e.under === 'soldadura') {
    const wm = propio(std(0x9aa0a6, { metalness: 1, roughness: 0.25 }));
    const gota = propio(new THREE.SphereGeometry(0.011, 6, 4));
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Mesh(gota, wm); s.scale.set(0.6, 1, 1.4);
      s.position.set(L.x - 0.004, yL + 0.016 + Math.sin(i * 1.7) * 0.003, zL - 0.22 + i * 0.019); cuerpo.add(s);
    }
    box(cuerpo, [0.004, (L.y1 - L.y0) * 0.9, 0.44], [L.x - 0.003, yL, zL], propio(std(0x6a6f75, { metalness: 0.9, roughness: 0.35 })));
  } else if (e.under === 'pintura') {
    const pm = propio(std(0x15151a, { roughness: 0.25, metalness: 0.2 }));
    box(cuerpo, [0.004, L.y1 - L.y0 + 0.004, 0.6], [L.x - 0.003, yL, zL], pm);
    box(cuerpo, [0.07, 0.004, 0.6], [L.x + 0.033, L.y0 - 0.002, zL], pm);
  }

  // Asiento trasero y del acompañante: objetos del caso (distractores)
  const A = M.asiento, at = v3(A.trasero), ac = v3(A.acompanante);
  const prop = (clave, pos, giro, escala) => {
    const r = recursos && recursos.get(clave); if (!r) return null;
    const o = r.valor.scene.clone(true), b = new THREE.Box3().setFromObject(o);
    o.scale.setScalar(escala || 1); o.rotation.y = giro || 0;
    o.position.set(pos.x, pos.y - b.min.y * (escala || 1), pos.z);
    cuerpo.add(sombras(o, true, true)); return o;
  };
  const tela = c => propio(std(c, { roughness: 0.95 }));
  if (e.rseat === 'sillita') {
    const sm = tela(0x46607a), pad = tela(0x2f3e52), x0 = -0.35;
    box(cuerpo, [0.38, 0.1, 0.36], [x0, at.y + 0.02, at.z - 0.05], sm); box(cuerpo, [0.38, 0.5, 0.08], [x0, at.y + 0.28, at.z + 0.14], sm);
    [-1, 1].forEach(k => box(cuerpo, [0.05, 0.3, 0.3], [x0 + k * 0.17, at.y + 0.16, at.z + 0.0], sm));
    box(cuerpo, [0.26, 0.04, 0.26], [x0, at.y + 0.08, at.z - 0.06], pad);
    prop('obj.caja', at.clone().add(new THREE.Vector3(0.3, -0.08, 0)), 0.3, 0.8);
  } else if (e.rseat === 'herramientas') {
    prop('obj.bidon', at.clone().add(new THREE.Vector3(-0.35, -0.08, -0.02)), 0.4, 1);
    prop('obj.cajon', at.clone().add(new THREE.Vector3(0.25, -0.08, 0)), -0.2, 0.9);
  } else {
    box(cuerpo, [0.45, 0.24, 0.28], [-0.35, at.y + 0.06, at.z], tela(0x2f3d5c));
    box(cuerpo, [0.4, 0.22, 0.26], [0.12, at.y + 0.05, at.z + 0.02], tela(0x4f4f4f));
    prop('obj.caja', at.clone().add(new THREE.Vector3(0.45, -0.08, 0)), 0.1, 0.7);
  }
  if (e.mate === 'mate') {
    prop('obj.termo', ac.clone().add(new THREE.Vector3(0.1, -0.1, 0.02)), 0.3, 1);
    cyl(cuerpo, 0.04, 0.035, 0.08, 14, [ac.x - 0.12, ac.y - 0.06, ac.z + 0.05], propio(std(0x7a5230, { roughness: 0.6 })));
  } else {
    box(cuerpo, [0.24, 0.12, 0.2], [ac.x, ac.y - 0.04, ac.z], tela(0x2f62a8));
    box(cuerpo, [0.07, 0.008, 0.14], [ac.x - 0.12, ac.y - 0.09, ac.z + 0.08], propio(std(0x111111, { roughness: 0.2 })));
  }
  prop('obj.cigarrillos', v3(A.acompanante).add(new THREE.Vector3(-0.15, -0.09, -0.12)), 0.6, 1);

  grupo.traverse(n => { if (n.isMesh && n.castShadow === false) { n.castShadow = true; n.receiveShadow = true; } });

  // Puntos de la cinta en coordenadas de mundo (el cuerpo inclinado)
  grupo.updateMatrixWorld(true);
  const enCuerpo = (x, y, z) => cuerpo.localToWorld(new THREE.Vector3(x, y, z));
  function medida(tipo) {
    if (tipo === 'gapF' || tipo === 'gapR') {
      const a = tipo === 'gapF' ? M.arco.del : M.arco.tras, z = tipo === 'gapF' ? M.ejes.del : M.ejes.tras;
      const tope = new THREE.Vector3(a.x, 2 * M.radioRueda, z).applyMatrix4(grupo.matrixWorld);
      return { a: tope, b: enCuerpo(a.x, a.yBorde, z) };
    }
    if (tipo === 'int') return { a: enCuerpo(C.xCinta, piso, C.z1 - 0.2), b: enCuerpo(C.xCinta, C.yBordeSup, C.z1 - 0.2) };   // apoyada en una nervadura
    return { a: enCuerpo(-0.45, C.yBordeInfExt, C.zExt + 0.008), b: enCuerpo(-0.45, C.yTopePorton, C.zExt + 0.008) };
  }
  // Luz de techo encendida: de noche, en un control, se le pide al conductor que la prenda
  const techo = new THREE.PointLight(0xffe2b8, 2.2, 3, 2); techo.position.set(0, 1.5, -0.1); cuerpo.add(techo);
  // La pelvis va un poco más abajo que el punto medido (que es el borde delantero del almohadón)
  const cabina = {
    asiento: [A.conductor[0], A.conductor[1] - 0.08, A.conductor[2]], volante: M.volante, espejo: M.espejo, espejoLateral: M.espejoLateral,
    frente: [A.conductor[0], 1.5, -30]
  };
  return {
    grupo, cuerpo, medida, cabina, pisoCaja: piso, lift, pitch,
    // Libera solo lo creado para este caso: la geometría y los materiales del modelo y de los objetos se comparten
    liberar() {
      propios.forEach(p => { if (p.map) p.map.dispose(); if (p.dispose) p.dispose(); });
      grupo.traverse(n => { if (n.geometry && n.geometry.type !== 'BufferGeometry') n.geometry.dispose(); });
    }
  };
}

/* ---------- Camioneta de Gendarmería ---------- */
export function camionetaGendarmeria(plantilla, M) {
  const grupo = plantilla.raiz.clone(true), cuerpo = grupo.getObjectByName('cuerpo');
  // Verde oliva: se clona el material de la pintura solo para esta camioneta
  const pinturaGN = buscarMaterial(grupo, 'pintura').clone(); pinturaGN.color.setHex(0x3c4a2f); pinturaGN.name = 'pinturaGN';
  grupo.traverse(n => { if (n.isMesh && n.material.name === 'pintura') n.material = pinturaGN; });
  const letras = canvasTex(512, 96, (x, w, h) => { x.fillStyle = '#f2f2ee'; x.font = 'bold 58px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('GENDARMERÍA', w / 2, 50); });
  const lim = M.limites;
  [[lim.x0 + 0.004, [-1, 0, 0]], [lim.x1 - 0.004, [1, 0, 0]]].forEach(([x, n]) =>
    calco(cuerpo, [1.15, 0.2], [x, 0.98, -0.35], n, [0, 1, 0], std(0xffffff, { map: letras, transparent: true, roughness: 0.5 }), 0.02));
  // Patentes oficiales (tapan las del modelo original)
  [M.patente.tras, M.patente.del].forEach(pt => calco(cuerpo, [0.4, 0.13], pt.centro, pt.normal, [0, 1, 0], std(0xffffff, { map: patenteTex('AD 418 KZ', false), roughness: 0.45 }), 0.012));
  // Barra de luces en el techo
  const techo = 1.73;
  box(cuerpo, [1.15, 0.08, 0.28], [0, techo + 0.04, -0.3], std(0x222831, { roughness: 0.4 }));
  const luces = [box(cuerpo, [0.52, 0.09, 0.26], [-0.28, techo + 0.12, -0.3], glow(0x2f5bff, 0.4)), box(cuerpo, [0.52, 0.09, 0.26], [0.28, techo + 0.12, -0.3], glow(0xff2433, 0.4))];
  const destellos = [0x3a6bff, 0xff2a3a].map((c, i) => { const l = new THREE.PointLight(c, 0, 9, 2); l.position.set(i ? 0.28 : -0.28, techo + 0.25, -0.3); cuerpo.add(l); return l; });
  return { grupo, luces, destellos };
}
