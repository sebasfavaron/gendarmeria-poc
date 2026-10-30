/*
 * POC Puesto de control en ruta (Gendarmería Nacional)
 * Motor del simulador: jugador, detección de puntos de interés, UI y puntaje. La escena (cielo,
 * suelo, puesto, luces) está en escena.js; lo compartido, en nucleo.js.
 * El contenido del caso se define en escenario.js (window.ESCENARIO) y las reglas que arman
 * cada partida en caso.js (window.generarCaso). La camioneta se construye a partir del caso:
 * lo que se ve, se mide y se escucha sale del mismo modelo.
 * Módulo ES: three.js r186 llega por el importmap de index.html (vendor/three/).
 */
import * as THREE from 'three';
import { $, params, DEBUG, reduceMotion, coarse, canvas, renderer, scene, camera, std, glow, box, cyl, canvasTex, noiseRnd, sombras, disposeTree } from './nucleo.js';
import * as calidad from './calidad.js';
import { cargarManifest, cargar } from './cargador.js';
import { armarEscena, aplicarLuz, recalcularSombras, LUZ } from './escena.js';
import { crearConductor } from './conductor.js';
import { prepararHilux, camionetaCaso, camionetaGendarmeria } from './vehiculo3d.js';

const ESC = window.ESCENARIO;
let time = 0;
let CASE = null;

if (!renderer) {
  // three.js r186 necesita WebGL 2: sin eso no hay escena, así que se avisa en vez de quedar en negro
  const m = $('#introMsg');
  m.textContent = 'Este dispositivo o navegador no puede mostrar la escena 3D (hace falta WebGL 2). Probá con una versión reciente de Chrome, Safari o Firefox.';
  m.hidden = false;
  $('#startBtn').disabled = true;
}

/* ---------- Camionetas ---------- */
// La Hilux del caso y la de Gendarmería (vehiculo3d.js), las medidas de su malla (assets/hilux.medidas.js)
// y la geometría de los puntos de revisión (vehiculo.js)
const M = window.VEHICULO_MEDIDAS, VEH = window.VEHICULO(M);
let plantilla = null, camioneta = null, gendarmeria = null, recursosCargados = null;
function buildTruck() {
  if (!plantilla) return;   // hasta que termine la carga
  if (conductor && conductor.grupo.parent) conductor.grupo.parent.remove(conductor.grupo);   // no se desarma con la camioneta
  if (camioneta) { scene.remove(camioneta.grupo); camioneta.liberar(); }
  camioneta = camionetaCaso(plantilla, M, CASE, recursosCargados);
  scene.add(camioneta.grupo);
  if (conductor) conductor.sentar(camioneta.cuerpo, camioneta.cabina);
  recalcularSombras();
  if (DEBUG) renderDebug();
}

/* ---------- Jugador ---------- */
const STAND = 1.65, CROUCH = 0.55, RADIUS = 0.3;
const BOUNDS = { x0: -6, x1: 7.2, z0: -9.5, z1: 13 };
const OBST = [
  VEH.obstaculo,
  { x0: 2.8, x1: 4.8, z0: 6.5, z1: 11.95 },        // camioneta de Gendarmería
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

/* ---------- Conductor ---------- */
// La persona y su conducta están en conductor.js; acá se le pasa lo que pasa en la escena.
let conductor = null;
const ojosJugador = new THREE.Vector3();
function updateDriver(dt) {
  if (!conductor) return;
  const nervous = CASE && CASE.conducta === 'nervioso';
  const behind = state.mode === 'play' && player.z > M.caja.z0 - 0.4;
  // Si el conductor está nervioso y el gendarme se acerca a la caja, lo "vio" (sirve para la devolución)
  if (behind && nervous && Math.hypot(player.x, player.z - (M.caja.z0 + M.caja.z1) / 2) < 2.6) state.nearBed = true;
  camera.getWorldPosition(ojosJugador);
  conductor.actualizar(dt, { conducta: CASE ? CASE.conducta : 'calmo', jugador: ojosJugador, hablando: state.talking,
    pensando: state.pensando, jugadorAtras: behind, tiempo: time });
}

function updateLamps() {
  if (!gendarmeria) return;
  const on = Math.floor(time * (reduceMotion ? 0.8 : 1.6)) % 2 === 0;
  gendarmeria.luces[0].material.emissiveIntensity = on ? 9 : 0.4;
  gendarmeria.luces[1].material.emissiveIntensity = on ? 0.4 : 9;
  // La barra tiñe el suelo y lo que está cerca, alternando azul y rojo
  const [azul, rojo] = gendarmeria.destellos;
  azul.intensity = on ? 6 : 0; rojo.intensity = on ? 0 : 6;
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
// Cada punto junta su contenido (escenario.js) con su geometría para esta camioneta (vehiculo.js)
const POIS = ESC.pois.map(p => Object.assign({}, p, VEH.puntos[p.id])), QUESTIONS = ESC.preguntas, DECISIONS = ESC.decisiones;
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
    const pp = aMundo(p.p);
    const hd = Math.hypot(pp[0] - player.x, pp[2] - player.z);
    if (hd > p.range) continue;
    dir.set(pp[0] - camera.position.x, pp[1] - camera.position.y, pp[2] - camera.position.z).normalize();
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
// Los puntos y los encuadres están en coordenadas del cuerpo de la camioneta (vehiculo.js): se pasan al mundo
// con la inclinación de la suspensión de este caso, así el encuadre apunta a la pieza aunque el cuerpo esté bajo
const _w = new THREE.Vector3();
function aMundo(a) { return camioneta ? camioneta.cuerpo.localToWorld(_w.fromArray(a)).toArray() : a; }
function vistaMundo(v) { return v && { pos: aMundo(v.pos), mira: aMundo(v.mira), fov: v.fov, original: v }; }
function nearestVista(p) {
  const v = p.vistas.slice().sort((a, b) => Math.hypot(a.pos[0] - player.x, a.pos[2] - player.z) - Math.hypot(b.pos[0] - player.x, b.pos[2] - player.z))[0];
  return vistaMundo(v);
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
  if ((a.id === 'luzDel' || a.id === 'luzTras') && view.close && !p.vistas.includes(view.close.original)) setCloseView(nearestVista(p), view.insetTo);
  if (a.id === 'luzDel') { txt = `Entre el guardabarros y la cubierta hay ${d.gapF} cm.`; note('luzDel', 'Rueda delantera', `Luz: ${d.gapF} cm.`); showMeasure('gapF'); }
  if (a.id === 'luzTras') { txt = `Entre el guardabarros y la cubierta hay ${d.gapR} cm.`; note('luzTras', 'Rueda trasera', `Luz: ${d.gapR} cm.`); showMeasure('gapR'); }
  if (a.id === 'ballesta') {
    txt = e.rwheel === 'normal' ? 'La ballesta está arqueada, con las hojas separadas en las puntas.' : 'La ballesta está casi plana.';
    note('ballesta', 'Rueda trasera', txt);
    setCloseView(vistaMundo(VEH.vistasAccion.ballesta), view.insetTo);
  }
  if (a.id === 'interior') {
    txt = `Por dentro, del piso al borde: ${d.int} cm.`; note('interior', 'Caja', `Por dentro: ${d.int} cm.`); showMeasure('int');
    setCloseView(vistaMundo(VEH.vistasAccion.interior), view.insetTo);
  }
  if (a.id === 'exterior') {
    txt = `Por fuera, en el portón, del borde de abajo al de arriba: ${d.ext} cm.`; note('exterior', 'Caja', `Por fuera (portón): ${d.ext} cm.`); showMeasure('ext');
    setCloseView(vistaMundo(VEH.vistasAccion.exterior), view.insetTo);
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
    const v = VEH.vistasAccion.piso;
    setCloseView(vistaMundo({ pos: v.pos, mira: [v.mira[0], camioneta.pisoCaja, v.mira[2]], fov: v.fov }), view.insetTo);
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
  // Los extremos salen de la misma malla que se ve (vehiculo3d.js), ya con el cuerpo inclinado
  const { a, b } = camioneta.medida(kind);
  const label = (kind === 'gapF' ? CASE.datos.gapF : kind === 'gapR' ? CASE.datos.gapR : kind === 'int' ? CASE.datos.int : CASE.datos.ext) + ' cm';
  const g = new THREE.Group(), len = b.distanceTo(a), mid = a.clone().add(b).multiplyScalar(0.5);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.018, len, 0.004), new THREE.MeshBasicMaterial({ color: 0xf2c230, depthTest: false }));
  tape.position.copy(mid); tape.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  // La cinta mira a la cámara
  tape.rotateY(Math.atan2(camera.position.x - mid.x, camera.position.z - mid.z) - tape.rotation.y);
  tape.renderOrder = 10; g.add(tape);
  [a, b].forEach(p => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.05), new THREE.MeshBasicMaterial({ color: 0x222222, depthTest: false })); t.position.copy(p); t.renderOrder = 11; g.add(t); });
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, map: canvasTex(128, 48, (x, w, h) => {
    x.fillStyle = 'rgba(20,22,26,.85)'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2c230'; x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, w / 2, h / 2 + 1);
  }) }));
  // La etiqueta va al costado de la cinta, sin tapar lo que mide
  const costado = new THREE.Vector3().subVectors(camera.position, mid).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(0.13);
  spr.scale.set(0.16, 0.06, 1); spr.position.copy(mid).add(costado); spr.renderOrder = 12; g.add(spr);
  measureObj = g; scene.add(g);
}

/* ---------- Linterna ---------- */
let torch = null, TORCH = 0;   // la linterna se arma con la escena, al terminar la carga
function setTorch(on) {
  if (!torch || (state.torch === on && torch.intensity === (on ? TORCH : 0))) return;
  state.torch = on;
  torch.intensity = on ? TORCH : 0;
  torch.castShadow = on;
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
      state.pensando = slow && !reduceMotion;
      renderQuestions();
      const myRun = run;
      setTimeout(() => {
        if (myRun !== run) return;
        typing.lastChild.textContent = a;
        state.pensando = false;
        if (conductor) conductor.hablar(a);
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
  openView($('#talk'), vistaMundo(p.vistas[0]), '.q:not([disabled])');
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
  CASE = window.generarCaso(ESC, M, { semilla, perfil: params.get('perfil') });
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
  logEvent('inicio', { caso: CASE.semilla, calidad: calidad.nivel, assets: manifest ? manifest.version : null });
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
const perf = { cuadros: 0, desde: performance.now(), texto: '' };
function renderDebug() {
  let el = $('#debug');
  if (!el) { el = document.createElement('pre'); el.id = 'debug'; el.className = 'debug'; document.body.appendChild(el); }
  el.textContent = `calidad ${calidad.nivel}${perf.texto}\ncaso ${CASE.semilla} · ${CASE.perfil} · ${CASE.conducta}\n` + Object.entries(CASE.estados).map(([k, v]) => `${k}: ${v}`).join('\n');
}
// Con ?debug: cuadros por segundo, llamadas de dibujo y triángulos, para medir en un celular real
function updatePerf(now) {
  perf.cuadros++;
  if (now - perf.desde < 1000) return;
  const i = renderer.info.render;
  perf.texto = ` · ${Math.round(perf.cuadros * 1000 / (now - perf.desde))} fps · ${i.calls} dibujos · ${Math.round(i.triangles / 1000)} mil triángulos`;
  perf.cuadros = 0; perf.desde = now;
  if (CASE) renderDebug();
}

/* ---------- Bucle ---------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (renderer) { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, calidad.parametros.resolucionMax)); renderer.setSize(w, h, false); }
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
  if (escena) escena.actualizar(dt);
  if (renderer && !perdido) { renderer.render(scene, camera); if (DEBUG) updatePerf(now); }
  requestAnimationFrame(frame);
}

/* ---------- Carga de assets ---------- */
let manifest = null, perdido = false, escena = null;
const mb = b => (b / 1048576).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
async function cargarTodo() {
  const msg = $('#introMsg'), bar = $('#loadBar'), txt = $('#loadTxt'), start = $('#startBtn'), retry = $('#loadRetry');
  msg.hidden = true; retry.hidden = true; bar.hidden = false; txt.hidden = false;
  start.disabled = true;
  try {
    manifest = await cargarManifest();
    const total = manifest.niveles[calidad.nivel].total;
    txt.textContent = `Cargando la escena: 0 de ${mb(total)} MB`;
    const recursos = await cargar(manifest, calidad.nivel, (llevo, tot) => {
      bar.firstElementChild.style.width = (100 * llevo / tot).toFixed(1) + '%';
      bar.setAttribute('aria-valuenow', String(Math.round(100 * llevo / tot)));
      txt.textContent = `Cargando la escena: ${mb(llevo)} de ${mb(tot)} MB`;
    });
    const esc = escena = armarEscena(recursos, calidad.parametros);
    torch = esc.linterna; TORCH = esc.intensidadLinterna;
    OBST.push(...esc.obstaculos);
    recursosCargados = recursos;
    plantilla = prepararHilux(recursos.get('hilux').valor);
    gendarmeria = camionetaGendarmeria(plantilla, M);
    gendarmeria.grupo.position.set(3.8, 0, 9.2); scene.add(gendarmeria.grupo);
    conductor = crearConductor(recursos.get('conductor').valor, recursos.get('anim.sentado').valor.animations[0]);
    buildTruck();
    bar.hidden = true; txt.hidden = true;
    start.disabled = false;
  } catch (e) {
    console.warn(e);
    bar.hidden = true; txt.hidden = true;
    msg.textContent = 'No se pudo cargar la escena. Revisá la conexión y probá de nuevo.';
    msg.hidden = false; retry.hidden = false;
  }
}
$('#loadRetry').onclick = cargarTodo;
// En celulares con poca memoria el navegador puede descartar la imagen 3D: se avisa y se ofrece recargar
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault(); perdido = true;
  closeAll(); setPlayUI(false);
  $('#glLost').hidden = false;
  $('#glReload').focus({ preventScroll: true });
});
$('#glReload').onclick = () => location.reload();

newCase(params.get('caso') || undefined);
window.__dbg = { player, state, POIS, camera, view, blocked, renderer, scene, LUZ, aplicarLuz, calidad, get CASE() { return CASE; }, get conductor() { return conductor; }, get camioneta() { return camioneta; },
  abrir: id => openPoi(POIS.find(p => p.id === id)), accion: (id, a) => doAction(POIS.find(p => p.id === id), { id: a }), get tiempo() { return time; }, THREE, M, start, setTorch };
resize();
requestAnimationFrame(frame);
if (renderer) cargarTodo();
