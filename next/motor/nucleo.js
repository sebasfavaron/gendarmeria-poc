/*
 * Lo que comparten todas las partes del motor: renderer, escena, cámara, parámetros de la URL
 * y ayudas para armar piezas con primitivas y texturas dibujadas en canvas.
 */
import * as THREE from 'three';
import { parametros } from './calidad.js';

export const $ = s => document.querySelector(s);
export const params = new URLSearchParams(location.search);
export const DEBUG = params.has('debug');
export const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
export const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

export const canvas = $('#scene');
// three.js r186 necesita WebGL 2; si no hay, renderer queda en null y main.js avisa
export let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: parametros.antialias, powerPreference: 'high-performance' }); } catch (e) { renderer = null; }
if (renderer) {
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 900);
camera.rotation.order = 'YXZ';
scene.add(camera);

/* ---------- Materiales ---------- */
// Material físico. o: cualquier opción de MeshStandardMaterial (roughness, metalness, map...)
export const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8, metalness: 0 }, o || {}));
export const basic = c => new THREE.MeshBasicMaterial({ color: c });
// Brillo que no depende de la luz (faros, pantallas, ventana iluminada)
export const glow = (c, k) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: k || 1, roughness: 0.4 });

/* ---------- Primitivas ---------- */
// UV en escala de mundo: la textura no se estira en piezas largas (largueros, paragolpes)
export function worldUV(g, k) {
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i));
    const a = ax > 0.5 ? pos.getZ(i) : pos.getX(i), b = ay > 0.5 ? pos.getZ(i) : pos.getY(i);
    uv.setXY(i, a * k, b * k);
  }
  uv.needsUpdate = true;
  return g;
}
export function box(parent, size, pos, mat) {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  if (mat.userData.wuv) worldUV(geo, mat.userData.wuv);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  parent.add(m);
  return m;
}
export function cyl(parent, rTop, rBot, h, seg, pos, mat, rot) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m);
  return m;
}
export function canvasTex(w, h, draw, lineal) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (!lineal) t.colorSpace = THREE.SRGBColorSpace;
  if (renderer) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
// Ruido determinístico para texturas (no depende de la semilla del caso)
export function noiseRnd(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

// Proyecta y recibe sombras todo lo que cuelga de obj
export function sombras(obj, proyecta, recibe) {
  obj.traverse(n => { if (n.isMesh) { n.castShadow = proyecta; n.receiveShadow = recibe; } });
  return obj;
}
export function disposeTree(obj) {
  obj.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) [].concat(n.material).forEach(m => { if (m.map && !m.map.userData.compartida) m.map.dispose(); m.dispose(); });
  });
}
