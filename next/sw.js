/*
 * Service worker: deja la app guardada en el dispositivo para abrirla sin conexión.
 *  - Código (html, css, js): red primero, así llegan los cambios; sin red o si tarda más de 3 s, lo guardado.
 *  - assets/ (modelos, texturas, cielo): lo guarda la página al bajarlos (cargador.js) en la caché
 *    "gpoc-assets:<carpeta>"; como el nombre lleva el hash del contenido, nunca hay uno viejo. Caché primero.
 * Cada versión (/, /v1/, /next/) tiene su alcance y sus cachés: acá solo se borran las propias.
 * Solo funciona en contexto seguro (https o localhost).
 */
const ALCANCE = new URL(self.registration.scope).pathname;
const CACHE = `gpoc-codigo:${ALCANCE}:v2`;
// Todo el código: tools/test-assets.js controla que no falte ningún archivo
const CODIGO = [
  './', 'index.html', 'styles.css', 'escenario.js', 'caso.js', 'vehiculo.js', 'assets/manifest.json', 'assets/hilux.medidas.js',
  'motor/main.js', 'motor/nucleo.js', 'motor/calidad.js', 'motor/cargador.js', 'motor/escena.js', 'motor/conductor.js', 'motor/vehiculo3d.js',
  'vendor/three/three.module.min.js', 'vendor/three/addons/loaders/GLTFLoader.js', 'vendor/three/addons/loaders/HDRLoader.js',
  'vendor/three/addons/libs/meshopt_decoder.module.js', 'vendor/three/addons/utils/BufferGeometryUtils.js',
  'vendor/three/addons/utils/SkeletonUtils.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CODIGO)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(`gpoc-codigo:${ALCANCE}:`) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const esAsset = url => url.pathname.startsWith(ALCANCE + 'assets/') && /\.(glb|hdr|jpg|webp)$/.test(url.pathname);

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(ALCANCE)) return;
  if (esAsset(url)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(c => c || fetch(req)));
    return;
  }
  const cached = () => caches.match(req, { ignoreSearch: true });
  const net = fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  });
  const slow = new Promise(r => setTimeout(r, 3000)).then(cached).then(c => c || net);
  e.respondWith(Promise.race([net.catch(cached), slow]));
});
