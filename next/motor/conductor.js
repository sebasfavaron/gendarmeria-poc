/*
 * Conductor: persona de Rocketbox (assets conductor-*.glb) sentada al volante, con conducta.
 *   crearConductor(gltf, clipSentado) -> { grupo, sentar(padre, cabina), actualizar(dt, ctx), hablar(texto), callar(), estado }
 *   cabina = { asiento: [x,y,z], volante: { centro, radio, normal }, espejo: [x,y,z], espejoLateral: [x,y,z], frente: [x,y,z] }
 *            en coordenadas de `padre` (el cuerpo de la camioneta)
 *   ctx    = { conducta: 'calmo'|'nervioso', jugador: Vector3, hablando, pensando, jugadorAtras, tiempo }
 *
 * Capas, en orden: la animación sentada de base (respiración y peso), los brazos llevados al volante con
 * cinemática inversa de dos huesos, los dedos cerrados sobre el aro, y encima la conducta: hacia dónde mira
 * (huesos de los ojos y la cabeza), cuánto parpadea, la boca y las manos. Las señales son sutiles a propósito:
 * es lo que el gendarme tiene que aprender a leer.
 */
import * as THREE from 'three';

const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _id = new THREE.Quaternion();
const v3 = a => new THREE.Vector3().fromArray(a);
const azar = (a, b) => a + Math.random() * (b - a);
const suave = (actual, meta, k, dt) => actual + (meta - actual) * Math.min(1, k * dt);

// Gira el hueso (en mundo) para que su eje local `eje` apunte hacia `dir`, con un ángulo máximo y un peso
function apuntarDir(hueso, eje, dir, peso, max) {
  hueso.getWorldQuaternion(_q);
  _a.copy(eje).applyQuaternion(_q).normalize();
  _dq.setFromUnitVectors(_a, _d.copy(dir).normalize());
  const ang = 2 * Math.acos(Math.min(1, Math.abs(_dq.w)));
  const f = Math.min(1, max / Math.max(ang, 1e-6)) * peso;
  _dq.slerpQuaternions(_id, _dq, f);
  hueso.parent.getWorldQuaternion(_pq).invert();
  hueso.quaternion.copy(_pq.multiply(_dq.multiply(_q)));
  hueso.updateMatrixWorld(true);
}
// Gira el hueso para que su hijo quede en la dirección de `destino`
function apuntarHijo(hueso, hijo, destino) {
  hueso.getWorldPosition(_p); hijo.getWorldPosition(_e);
  hueso.getWorldQuaternion(_q);
  _dq.setFromUnitVectors(_a.subVectors(_e, _p).normalize(), _d.subVectors(destino, _p).normalize());
  hueso.parent.getWorldQuaternion(_pq).invert();
  hueso.quaternion.copy(_pq.multiply(_dq.multiply(_q)));
  hueso.updateMatrixWorld(true);
}
// Cinemática inversa de dos huesos (hombro, codo, muñeca) con un punto de referencia para el codo
function ikBrazo(b, objetivo, polo) {
  const S = b.brazo.getWorldPosition(new THREE.Vector3());
  const dir = _t.subVectors(objetivo, S); const d = Math.min(Math.max(dir.length(), 0.05), b.l1 + b.l2 - 0.002); dir.normalize();
  const cosA = (b.l1 * b.l1 + d * d - b.l2 * b.l2) / (2 * b.l1 * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const haciaPolo = new THREE.Vector3().subVectors(polo, S); haciaPolo.addScaledVector(dir, -haciaPolo.dot(dir)).normalize();
  const codo = S.clone().addScaledVector(dir, b.l1 * cosA).addScaledVector(haciaPolo, b.l1 * sinA);
  apuntarHijo(b.brazo, b.antebrazo, codo);
  apuntarHijo(b.antebrazo, b.mano, S.addScaledVector(dir, d));
}

export function crearConductor(gltf, clipSentado) {
  const grupo = new THREE.Group(), modelo = gltf.scene;
  grupo.add(modelo);
  let cabina = null, C = null, n = null, arriba = null, derecha = null, V = null;
  modelo.rotation.y = Math.PI;                        // Rocketbox mira hacia +z; en la camioneta, hacia -z
  modelo.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false; } });
  const H = n => modelo.getObjectByName('Bip01_' + n.replace(/ /g, '_'));
  const cabeza = modelo.getObjectByName('cabeza');
  const caraMesh = cabeza.isMesh ? cabeza : cabeza.children.find(c => c.isMesh);
  const morph = (nombre, v) => { const i = caraMesh.morphTargetDictionary[nombre]; if (i !== undefined) caraMesh.morphTargetInfluences[i] = v; };

  // Ejes "hacia adelante" de ojos y cabeza en su espacio local, tomados en la pose de reposo
  grupo.updateMatrixWorld(true);
  const adelante = new THREE.Vector3(0, 0, 1).applyQuaternion(modelo.getWorldQuaternion(new THREE.Quaternion()));
  const ejeLocal = h => adelante.clone().applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion()).invert());
  const ojos = [H('REye'), H('LEye')], head = H('Head'), neck = H('Neck'), spine2 = H('Spine2'), pelvis = H('Pelvis');
  const ejeOjo = ojos.map(ejeLocal), ejeCabeza = ejeLocal(head), ejeCuello = ejeLocal(neck);
  // Brazos: largo de cada hueso y, de la pose de reposo, los ejes de la mano (hacia los dedos y hacia
  // afuera de la palma) y el eje en que se cierra cada falange
  const pelvisRep = H('Pelvis').getWorldPosition(new THREE.Vector3());
  const brazos = ['L', 'R'].map(s => {
    const b = { brazo: H(s + ' UpperArm'), antebrazo: H(s + ' Forearm'), mano: H(s + ' Hand') };
    const P = h => h.getWorldPosition(new THREE.Vector3()), Q = h => h.getWorldQuaternion(new THREE.Quaternion());
    b.l1 = P(b.brazo).distanceTo(P(b.antebrazo));
    b.l2 = P(b.antebrazo).distanceTo(P(b.mano));
    b.dedos = [0, 1, 2, 3, 4].map(f => [H(`${s} Finger${f}`), H(`${s} Finger${f}1`), H(`${s} Finger${f}2`)]);
    const qm = Q(b.mano), qmi = qm.clone().invert();
    const haciaDedos = P(b.dedos[2][0]).sub(P(b.mano)).normalize();
    // En reposo las palmas miran al cuerpo
    const palma = pelvisRep.clone().setY(P(b.mano).y).sub(P(b.mano)); palma.addScaledVector(haciaDedos, -palma.dot(haciaDedos)).normalize();
    b.dedosLocal = haciaDedos.clone().applyQuaternion(qmi); b.palmaLocal = palma.clone().applyQuaternion(qmi);
    const ejeCierre = new THREE.Vector3().crossVectors(haciaDedos, palma).normalize();
    b.ejeFalange = b.dedos.map(f => f.map(h => h && ejeCierre.clone().applyQuaternion(Q(h).invert())));
    return b;
  });
  // Orienta la mano en mundo: los dedos hacia `dir` y la palma hacia `palma`
  const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  function orientarMano(b, dir, palma) {
    _x.copy(b.dedosLocal); _y.copy(b.palmaLocal); _z.crossVectors(_x, _y);
    _m1.makeBasis(_x, _y, _z);
    const d = dir.clone().normalize(), pl = palma.clone().addScaledVector(d, -palma.dot(d)).normalize();
    _m2.makeBasis(d, pl, _z.crossVectors(d, pl));
    const qw = new THREE.Quaternion().setFromRotationMatrix(_m2.multiply(_m1.transpose()));
    b.mano.quaternion.copy(b.mano.parent.getWorldQuaternion(_pq).invert().multiply(qw));
    b.mano.updateMatrixWorld(true);
  }
  const _qa = new THREE.Quaternion();

  // Animación sentada de base
  const mixer = new THREE.AnimationMixer(modelo);
  if (clipSentado) mixer.clipAction(clipSentado).play();

  // Lo sienta en la camioneta: la pelvis de la animación sobre el asiento. Los puntos de la cabina
  // vienen en coordenadas de `padre` (el cuerpo de la camioneta, que se inclina con la suspensión).
  function sentar(padre, cab) {
    if (grupo.parent) grupo.parent.remove(grupo);
    padre.add(grupo); grupo.position.set(0, 0, 0);
    padre.updateMatrixWorld(true);
    const W = p => padre.localToWorld(v3(p));
    cabina = { asiento: W(cab.asiento), espejo: W(cab.espejo), espejoLateral: W(cab.espejoLateral), frente: W(cab.frente) };
    V = cab.volante; C = W(V.centro);
    n = W(new THREE.Vector3().fromArray(V.centro).add(v3(V.normal)).toArray()).sub(C).normalize();
    arriba = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
    derecha = new THREE.Vector3().crossVectors(arriba, n).normalize();   // la derecha del conductor
    if (derecha.x < 0) derecha.negate();
    mixer.update(0); grupo.updateMatrixWorld(true);
    const pelvisW = pelvis.getWorldPosition(new THREE.Vector3());
    grupo.position.copy(padre.worldToLocal(cabina.asiento.clone())).sub(padre.worldToLocal(pelvisW));
    grupo.updateMatrixWorld(true);
    c.mirada.copy(cabina.frente); c.metaMirada.copy(cabina.frente);
  }
  // Volante: puntos de agarre a las 10 y a las 2, apenas delante del aro
  const agarre = s => C.clone().addScaledVector(arriba, V.radio * 0.5).addScaledVector(derecha, s * V.radio * 0.87).addScaledVector(n, 0.035);

  const estado = { parpadeos: 0, mirandoEspejo: 0, jawOpen: 0, mirada: 'frente' };
  const c = {
    mirada: new THREE.Vector3(), metaMirada: new THREE.Vector3(),
    proxMirada: 0, parpadeo: 0, proxParpadeo: 2, tamborileo: 0, acomodo: 0, proxAcomodo: azar(6, 10),
    habla: null, labios: 0, cejas: 0, sonrisa: 0, quijada: 0, visema: null
  };

  function elegirMirada(ctx) {
    const nervioso = ctx.conducta === 'nervioso', t = ctx.tiempo;
    const ojosJugador = ctx.jugador;
    let meta, dur;
    if (ctx.pensando) { meta = C.clone().add(new THREE.Vector3(-0.3, -0.2, 0.1)); dur = azar(0.6, 1.2); estado.mirada = 'abajo'; }
    else if (ctx.hablando) {
      // Tranquilo sostiene la mirada; nervioso la corre cada tanto
      if (nervioso && Math.random() < 0.35) { meta = ojosJugador.clone().add(new THREE.Vector3(azar(0.4, 0.9), azar(-0.6, -0.2), 0)); dur = azar(0.5, 1); estado.mirada = 'esquiva'; }
      else { meta = ojosJugador.clone(); dur = azar(1.5, 3.5); estado.mirada = 'jugador'; }
    } else if (ctx.jugadorAtras) {
      // Con el gendarme atrás: el nervioso lo sigue por los espejos; el tranquilo mira adelante y alguna vez al espejo
      const r = Math.random();
      if (nervioso ? r < 0.7 : r < 0.15) { meta = (Math.random() < 0.55 ? cabina.espejo : cabina.espejoLateral).clone(); dur = azar(0.8, 1.6); estado.mirada = 'espejo'; estado.mirandoEspejo++; }
      else { meta = cabina.frente.clone(); dur = azar(1, 3); estado.mirada = 'frente'; }
    } else {
      const cerca = ojosJugador.distanceTo(C) < 6;
      if (cerca && Math.random() < (nervioso ? 0.6 : 0.4)) { meta = ojosJugador.clone(); dur = azar(1, 2.5); estado.mirada = 'jugador'; }
      else { meta = cabina.frente.clone().add(new THREE.Vector3(azar(-2, 2), azar(-0.5, 0.5), 0)); dur = azar(1.5, 4); estado.mirada = 'frente'; }
    }
    c.metaMirada.copy(meta); c.proxMirada = t + dur;
    // Cambiar mucho la mirada suele venir con un parpadeo
    if (Math.random() < 0.3) c.proxParpadeo = Math.min(c.proxParpadeo, t + 0.05);
  }

  function actualizar(dt, ctx) {
    const nervioso = ctx.conducta === 'nervioso', t = ctx.tiempo;
    mixer.update(dt);
    // Respiración: más rápida si está nervioso
    spine2.rotation.x += Math.sin(t * (nervioso ? 2.6 : 1.6)) * 0.012;
    // Se acomoda en el asiento de vez en cuando (nervioso)
    if (nervioso && t > c.proxAcomodo) { c.acomodo = 1; c.proxAcomodo = t + azar(6, 11); }
    c.acomodo = Math.max(0, c.acomodo - dt);
    pelvis.rotation.y += Math.sin(c.acomodo * Math.PI) * 0.05;
    grupo.updateMatrixWorld(true);

    // Manos en el volante (a las 10 y a las 2); los codos hacia abajo y afuera
    brazos.forEach((b, i) => {
      const s = i === 0 ? -1 : 1;
      const S = b.brazo.getWorldPosition(new THREE.Vector3());
      const aro = C.clone().addScaledVector(arriba, V.radio * 0.5).addScaledVector(derecha, s * V.radio * 0.87);
      const radial = aro.clone().sub(C).normalize();
      // La muñeca queda del lado del conductor y un poco afuera del aro; los dedos lo rodean hacia adelante
      const muneca = aro.clone().addScaledVector(n, 0.05).addScaledVector(radial, 0.045);
      ikBrazo(b, muneca, S.clone().add(new THREE.Vector3(0, -0.6, 0)).addScaledVector(derecha, s * 0.35));
      orientarMano(b, aro.clone().addScaledVector(n, -0.03).sub(muneca), radial.clone().negate().addScaledVector(n, -0.5));
      // Dedos cerrados sobre el aro; el nervioso tamborilea con la derecha cuando no le hablan
      const tamborilea = i === 1 && nervioso && !ctx.hablando && Math.sin(t * 0.7) > 0;
      b.dedos.forEach((f, k) => {
        let cierre = k === 0 ? 0.25 : 0.95;
        if (tamborilea && k > 0) cierre -= Math.max(0, Math.sin(t * 9 - k * 0.9)) * 0.7;
        f.forEach((h, j) => { if (h) h.quaternion.multiply(_qa.setFromAxisAngle(b.ejeFalange[k][j], cierre * (j === 0 ? 0.8 : 1))); });
      });
    });

    // Mirada: los ojos van rápido al punto; la cabeza, más lenta y solo una parte del ángulo
    if (t > c.proxMirada || (ctx.hablando && estado.mirada !== 'jugador' && estado.mirada !== 'esquiva') || (ctx.pensando && estado.mirada !== 'abajo')) elegirMirada(ctx);
    if (estado.mirada === 'jugador') c.metaMirada.copy(ctx.jugador);
    c.mirada.lerp(c.metaMirada, Math.min(1, dt * (nervioso ? 9 : 6)));
    grupo.updateMatrixWorld(true);
    const ojoMedio = ojos[0].getWorldPosition(new THREE.Vector3()).add(ojos[1].getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(c.mirada, ojoMedio);
    apuntarDir(neck, ejeCuello, dir, 0.35, 0.6);
    apuntarDir(head, ejeCabeza, dir, 0.55, 0.9);
    ojos.forEach((o, i) => apuntarDir(o, ejeOjo[i], new THREE.Vector3().subVectors(c.mirada, o.getWorldPosition(new THREE.Vector3())), 1, 0.6));

    // Parpadeo: más seguido si está nervioso
    if (t > c.proxParpadeo) { c.parpadeo = 0.16; c.proxParpadeo = t + (nervioso ? azar(0.8, 2.2) : azar(2.5, 5.5)); estado.parpadeos++; }
    c.parpadeo = Math.max(0, c.parpadeo - dt);
    const cierre = c.parpadeo > 0 ? Math.sin((1 - c.parpadeo / 0.16) * Math.PI) : 0;

    // Boca: hablando, la mandíbula y los visemas siguen el texto; callado, el nervioso aprieta los labios
    let quijada = 0, visemas = { viseme_aa: 0, viseme_O: 0, viseme_E: 0, viseme_PP: 0 };
    if (c.habla) {
      const h = c.habla, k = Math.floor((t - h.inicio) / 0.11);
      if (k >= h.silabas.length) c.habla = null;
      else {
        const fase = ((t - h.inicio) / 0.11) % 1, v = h.silabas[k];
        quijada = v === 'viseme_PP' ? 0.05 : Math.sin(fase * Math.PI) * (v === 'viseme_aa' ? 0.45 : 0.28);
        visemas[v] = Math.sin(fase * Math.PI) * 0.8;
      }
    }
    c.quijada = suave(c.quijada, quijada, 25, dt);
    c.labios = suave(c.labios, !c.habla && nervioso && (ctx.hablando || ctx.pensando || ctx.jugadorAtras) ? 0.55 : 0, 3, dt);
    c.cejas = suave(c.cejas, nervioso && (ctx.hablando || ctx.pensando) ? 0.3 : 0, 3, dt);
    estado.jawOpen = c.quijada;
    morph('jawOpen', c.quijada);
    Object.entries(visemas).forEach(([k, v]) => morph(k, v));
    morph('mouthPressLeft', c.labios); morph('mouthPressRight', c.labios);
    morph('browInnerUp', c.cejas);
    morph('eyeBlinkLeft', cierre); morph('eyeBlinkRight', cierre);
    morph('eyeSquintLeft', nervioso ? 0.12 : 0); morph('eyeSquintRight', nervioso ? 0.12 : 0);
  }

  // Sílabas aproximadas: una por vocal, con su visema; m, b y p cierran los labios
  function hablar(texto) {
    const silabas = [];
    for (const ch of texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')) {
      if ('a'.includes(ch)) silabas.push('viseme_aa');
      else if ('ou'.includes(ch)) silabas.push('viseme_O');
      else if ('ei'.includes(ch)) silabas.push('viseme_E');
      else if ('mbp'.includes(ch)) silabas.push('viseme_PP');
    }
    c.habla = { inicio: c.ultimoTiempo || 0, silabas };
  }
  return {
    grupo, estado, hablar, sentar,
    callar() { c.habla = null; },
    actualizar(dt, ctx) { c.ultimoTiempo = ctx.tiempo; if (cabina) actualizar(dt, ctx); }
  };
}
