# Modelos fotorrealistas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los modelos de primitivas por un Hilux importado, personas de Rocketbox y escena PBR con cielo HDRI, manteniendo las reglas del caso, las medidas que salen del modelo y el uso sin conexión.

**Architecture:** La versión nueva se arma en `src/next/` (servida en `/gendarmeria/next/`) con three.js r186 como módulos ES e importmap. Los assets se generan con scripts reproducibles en `tools/assets/` (Poly Haven, Rocketbox, Hilux) hacia `src/next/assets/{alta,liviana}/` con un `manifest.json`. `caso.js` y `escenario.js` siguen siendo scripts comunes; la geometría de los puntos de revisión pasa a `vehiculo.js` y las medidas de la malla a `assets/hilux.medidas.js`.

**Tech Stack:** three.js r186 (WebGLRenderer), Node 22 (scripts), glTF Transform + meshoptimizer + sharp, Blender 4.3 sin interfaz (desempaquetado de Debian en `tools/.cache/blender`), esbuild, Playwright con Chromium (`/usr/bin/chromium`, SwiftShader).

**Spec:** `docs/superpowers/specs/2026-10-13-modelos-fotorrealistas-design.md`

## Global Constraints

- Sin git: el usuario pidió que el proyecto no sea un repositorio. En lugar de commits, al cerrar cada tarea: `cd /mnt/rpi/dev/archive/humand && tar czf ~/.cache/gpoc-snapshots/<NN>-<tarea>.tgz --exclude=node_modules --exclude=.cache --exclude=gendarmeria-poc/src/v1 gendarmeria-poc`.
- No tocar `src/` fuera de `src/next/` y `src/v1/` hasta que el usuario apruebe el pase. El enlace principal sigue mostrando la versión actual.
- No tocar la configuración de `tailscale serve` ni usar `sudo`.
- Textos de la interfaz en español rioplatense (voseo). Procedimiento y contenido marcados como pendientes de validación.
- `caso.js` determinístico: misma semilla, mismo caso.
- Las medidas que se muestran salen de la geometría que se dibuja.
- Nada se carga de una CDN; todo lo que usa la página está en `src/next/`.
- Presupuesto aproximado: `alta` unos 27 MB, `liviana` unos 15 MB; un archivo no puede pasar su presupuesto en más de 20 %.
- Licencias: cada asset en `CREDITOS.md` con autor, enlace y licencia; la Hilux con su texto de atribución CC-BY.

## Review Focus

1. **Un asset no carga o la red es lenta (Funnel, 15 a 27 MB):** se ve el progreso y, si falla, un error claro con "Reintentar"; nunca arranca con la escena incompleta. Prueba en la Tarea 3.
2. **Dispositivo sin WebGL2** (three r186 lo exige): mensaje claro en la pantalla de inicio en vez de pantalla negra. Prueba en la Tarea 1.
3. **El service worker de la versión actual** (alcance `/gendarmeria/`) sirve archivos viejos de `/next/` con red lenta: `/next/` registra su propio service worker para quedar fuera del alcance del viejo. Prueba en la Tarea 1.
4. **La medida no coincide con la malla** al inclinar el cuerpo: la luz medida por rayos sobre la malla cargada coincide con `datos.gapF/gapR` con 0,5 cm de tolerancia. Prueba en la Tarea 7.
5. **Pérdida del contexto WebGL** en celulares con poca memoria: mensaje con botón para recargar. Prueba en la Tarea 3.

---

## Etapa 1: Base

### Tarea 1: Congelar v1 y portar a three r186 con módulos

**Files:**
- Create: `src/v1/` (copia exacta de `src/` actual), `src/next/` (copia inicial), `src/next/vendor/three/` (r186: `three.module.min.js`, `three.core.min.js`, `addons/` usados, `LICENSE`), `src/next/sw.js` (paso directo, red siempre), `tools/servir.js`
- Modify: `src/next/index.html` (importmap, `<script type="module" src="motor/main.js">`), `src/next/main.js` → `src/next/motor/main.js`, `tools/smoke.js`, `tools/test-caso.js`, `tools/package.json`
- Delete: `src/next/vendor/three.min.js`, `src/next/vendor/LICENSE-three.txt`

**Interfaces:**
- Produces: `tools/servir.js` exporta `servir(dir) -> Promise<{ url, cerrar() }>` (servidor estático en un puerto libre). `SRC` (variable de entorno) elige la carpeta para `smoke.js` y `test-caso.js`; por defecto `src`.

- [ ] **Step 1:** Copiar `src/` a `src/v1/` y a `src/next/` (sin incluirse a sí mismas). Comprobar con `curl` que `https://ballbox-first.emperor-ratio.ts.net/gendarmeria/v1/` responde 200.
- [ ] **Step 2:** `npm i --prefix tools` con `playwright-core`, `three@0.186.1`, `esbuild`, `sharp`, `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `meshoptimizer`. Copiar de `three/build` y `three/examples/jsm` a `src/next/vendor/three/`.
- [ ] **Step 3: Prueba que falla:** `smoke.js` sirve `SRC` con `servir()` (ya no `file://`), y agrega dos chequeos: (a) con `addInitScript` que hace devolver `null` a `getContext('webgl2')`, `#intro` muestra el texto "no puede mostrar la escena 3D"; (b) después de cargar dos veces, `navigator.serviceWorker.controller.scriptURL` termina en `/sw.js` de la carpeta servida. Correr `SRC=src/next node tools/smoke.js /tmp/gpoc/t1 caso=original 1280 800`. Esperado: falla (módulos sin portar).
- [ ] **Step 4:** Portar `motor/main.js` a módulo: `import * as THREE from 'three'`, sacar el IIFE, `CanvasTexture.colorSpace = SRGBColorSpace`, intensidades de luces reajustadas a unidades físicas para que la escena se vea como en v1, mensaje sin WebGL2, registro de `sw.js` propio.
- [ ] **Step 5:** Correr el smoke en 390 × 844 y 1280 × 800. Esperado: sin errores de consola, los 10 puntos revisables, capturas parecidas a las de v1.
- [ ] **Step 6:** Snapshot `01-base-r186`.

### Tarea 2: Herramientas de assets y primeros assets de Poly Haven

**Files:**
- Create: `tools/assets/polyhaven.mjs`, `tools/assets/escena.mjs`, `tools/assets/manifest.mjs`, `tools/test-assets.js`, `CREDITOS.md`
- Output: `src/next/assets/{alta,liviana}/` (cielo y texturas), `src/next/assets/manifest.json`

**Interfaces:**
- Produces: `manifest.json` = `{ version, niveles: { alta: { archivos: { <clave>: { url, bytes } }, total }, liviana: {…} } }`. Claves de esta tarea: `cielo.luz` (`.hdr` 1K), `cielo.fondo` (JPG 4K o 2K), y por material `tex.<nombre>.{color,normal,arm}` (WebP; `arm` = oclusión, rugosidad y metal en R, G, B). Nombres con hash de 6 caracteres.
- `polyhaven.mjs` exporta `bajar(id, tipo, resolucion, formato) -> Promise<ruta>` con caché en `tools/.cache/polyhaven/`.

- [ ] **Step 1:** Elegir el HDRI: bajar las miniaturas de los candidatos del spec, mirarlas y elegir según el criterio del spec. Elegir las texturas de pasto seco y tierra del monte buscando en la API.
- [ ] **Step 2: Prueba que falla:** `test-assets.js` controla que cada archivo del manifest exista, que su tamaño coincida con `bytes`, que el total de cada nivel entre en su presupuesto más 20 % y que cada asset figure en `CREDITOS.md`. Correr `node tools/test-assets.js`. Esperado: falla (no hay manifest).
- [ ] **Step 3:** Implementar `escena.mjs` (baja, convierte con sharp a WebP 2K y 1K, arma el `arm`, copia con hash) y `manifest.mjs`. Completar `CREDITOS.md`.
- [ ] **Step 4:** `node tools/assets/escena.mjs && node tools/test-assets.js`. Esperado: pasa.
- [ ] **Step 5:** Snapshot `02-assets-escena`.

### Tarea 3: Escena PBR, cielo, sombras, calidad y carga

**Files:**
- Create: `src/next/motor/nucleo.js` (renderer, escena, cámara y ayudas `box`, `cyl`, `canvasTex`, `std`), `src/next/motor/calidad.js`, `src/next/motor/cargador.js`, `src/next/motor/escena.js`
- Modify: `src/next/motor/main.js`, `src/next/index.html`, `src/next/styles.css`, `tools/smoke.js`

**Interfaces:**
- `calidad.js` exporta `nivel: 'alta'|'liviana'` y `parametros: { texturas, sombraReflector, sombraLinterna, resolucionMax, vegetacion, carpeta }` con los valores de la tabla del spec. Regla: `liviana` si `pointer: coarse` y lado mayor de pantalla menor a 1400 px, o `navigator.deviceMemory <= 4`; `?calidad=` la fuerza.
- `cargador.js` exporta `cargar(manifest, nivel, alProgresar(bytes, total)) -> Promise<Map<clave, recurso>>`; rechaza con `Error` si algo falla. Lee `window.__ASSETS` (dist) si existe.
- `escena.js` exporta `armarEscena(recursos, calidad) -> { reflector, linterna, actualizar(dt, tiempo) }`.

- [ ] **Step 1: Prueba que falla:** en `smoke.js`: (a) con `page.route` que aborta `cielo.luz`, aparece el error con el botón "Reintentar" y "Empezar" sigue deshabilitado; (b) `?calidad=liviana` y `?calidad=alta` se reflejan en `__dbg.calidad.nivel`; (c) forzar `WEBGL_lose_context.loseContext()` muestra el mensaje de pérdida con botón "Recargar". Esperado: falla.
- [ ] **Step 2:** Implementar `nucleo.js` y mover allí las ayudas de `main.js`. Materiales `MeshStandardMaterial`; pintura con `MeshPhysicalMaterial` y `clearcoat`. Tone mapping AgX.
- [ ] **Step 3:** Implementar `calidad.js` y `cargador.js`. Pantalla de inicio: barra de progreso en MB, "Empezar" deshabilitado hasta terminar, error con "Reintentar". Mensaje y botón "Recargar" ante `webglcontextlost`.
- [ ] **Step 4:** Implementar `escena.js`: cielo HDRI (`scene.environment` desde el `.hdr` con PMREM, `scene.background` desde el JPG), niebla del color del horizonte, suelo con texturas PBR (asfalto con líneas, banquina, monte), reflector y linterna con sombras según calidad. Sacar `shade()`: lo de abajo de la camioneta se oscurece por la sombra del reflector y por oclusión ambiental fija (`envMapIntensity` bajo en las piezas de abajo), no según la linterna.
- [ ] **Step 5:** Con `?debug`, mostrar nivel, cuadros por segundo, llamadas de dibujo y triángulos. El evento `inicio` del registro agrega `calidad` y `assets` (la `version` del manifest).
- [ ] **Step 6:** Correr el smoke en las dos medidas y los dos niveles; mirar las capturas de exploración, rueda trasera, debajo sin y con linterna. Esperado: pasa; debajo de la caja se ve oscuro sin linterna y se lee con linterna.
- [ ] **Step 7:** Snapshot `03-escena-pbr`. **Punto de demostración 1** en `/next/`.

## Etapa 2: Hilux

### Tarea 4: Preparar la Hilux y medirla

**Files:**
- Create: `tools/assets/blender.sh` (desempaqueta Blender 4.3 de Debian en `tools/.cache/blender` y expone `blender -b`), `tools/assets/hilux_prep.py` (Blender), `tools/assets/hilux.mjs` (bajar, preparar, niveles), `tools/assets/medir-hilux.mjs`
- Output: `src/next/assets/{alta,liviana}/hilux.<hash>.glb`, `src/next/assets/hilux.medidas.js`
- Modify: `tools/test-assets.js`, `CREDITOS.md`

**Interfaces:**
- El GLB preparado: origen en el piso entre ejes como hoy (mirando a -z, conductor en -x). Nodos con nombres estables: `rueda_DI`, `rueda_DD`, `rueda_TI`, `rueda_TD` (delantera/trasera, izquierda/derecha), `eje_trasero`, `ballesta_I`, `ballesta_D`, `escape`, `tanque`, `cuerpo` (todo lo que se inclina), `portapatente_T`, `portapatente_D`, `volante`. Sin `Object037`.
- `hilux.medidas.js` define `VEHICULO_MEDIDAS = { ejes: { del: z, tras: z }, radioRueda, arco: { del: { yBorde, luzNominal }, tras: {…} }, caja: { yBordeSup, yBordeInfExt, yPiso, yTechoPasarruedas, z0, z1, x0, x1 }, larguero: { x, y0, y1, z0, z1 }, limites: { x0, x1, z0, z1 }, volante: { centro, radio, normal } }` en metros, como script común (`window` y `module.exports`).

- [ ] **Step 1: Prueba que falla:** `test-assets.js` carga el GLB de cada nivel con glTF Transform y controla los nodos de arriba, que no exista `Object037`, triángulos (`alta` ≤ 450.000, `liviana` ≤ 220.000), y que `hilux.medidas.js` tenga todas las claves con valores dentro de rangos físicos (radio 0,35 a 0,45; luz nominal 0,05 a 0,20; profundidad de caja 0,40 a 0,55). Esperado: falla.
- [ ] **Step 2:** `hilux_prep.py`: borrar `Object037`; espejar en x y volver a espejar las UV de los materiales con texto; pintura blanca; renombrar nodos; agrupar `cuerpo`; volante a la izquierda; exportar GLB.
- [ ] **Step 3:** `hilux.mjs`: simplificar, meshopt, WebP 2K y 1K. `medir-hilux.mjs`: medir con rayos verticales y cortes de la malla preparada.
- [ ] **Step 4:** Renderizar vistas ortográficas y de detalle (con Blender o Playwright) y revisarlas: volante a la izquierda, textos legibles, abajo sin tapa.
- [ ] **Step 5:** `node tools/test-assets.js`. Esperado: pasa. Snapshot `04-hilux-asset`.

### Tarea 5: El caso usa las medidas del modelo

**Files:**
- Modify: `src/next/caso.js`, `tools/test-caso.js`, `src/next/escenario.js` (datos base 2021)

**Interfaces:**
- `generarCaso(ESC, MEDIDAS, { semilla, perfil })`. `fisico.gapF/gapR` alrededor de `MEDIDAS.arco.*.luzNominal` (normal: nominal + 0 a 2 cm; baja: nominal − 6 a 9 cm). `datos.ext = cm(yBordeSup − yBordeInfExt)`, `datos.int = cm(yBordeSup − yPiso) − cm(dobleFondo)`, `datos.diff = datos.ext − datos.int`. Doble fondo hasta que asome 1 cm de pasarruedas.
- Datos base: `anio: '2021'`, `chasis: '8AJBA3CD5M1523467'`, `dominio: 'AE 219 LM'`, cédula "Toyota Hilux 2.8 SRV, blanca, 2021".

- [ ] **Step 1: Prueba que falla:** en `test-caso.js`, con las medidas reales: luz normal y baja separadas al menos 4 cm; `int + diff === ext`; con doble fondo `yPiso + dobleFondo <= yTechoPasarruedas − 0,01`; el carácter 10 del chasis declarado es "M"; mismos controles de siempre. Esperado: falla.
- [ ] **Step 2:** Implementar en `caso.js` y `escenario.js`.
- [ ] **Step 3:** `SRC=src/next node tools/test-caso.js`. Esperado: 5.000 casos sin errores. Snapshot `05-caso-medidas`.

### Tarea 6: Vehículo en el motor y puntos de revisión

**Files:**
- Create: `src/next/motor/vehiculo3d.js`, `src/next/vehiculo.js`
- Modify: `src/next/escenario.js` (sacar `p`, `vistas`, `range`, `side`), `src/next/motor/main.js` (usar `vehiculo3d`, cinta con medidas, colisiones con `limites`)

**Interfaces:**
- `vehiculo.js` define `VEHICULO = { puntos: { <poiId>: { p, vistas, range, lado } }, vistasAccion: { ballesta, interior, exterior, piso }, inicioJugador }`. `lado` es una función `(pl, M) => boolean` que usa `VEHICULO_MEDIDAS`.
- `vehiculo3d.armar(gltf, medidas, caso, opciones) -> { grupo, cuerpo, lift, pitch, anclas }` con `opciones = { color, gendarmeria }`. `anclas` tiene `medida(kind) -> { a, b }` en coordenadas de mundo para `gapF`, `gapR`, `int` y `ext`.

- [ ] **Step 1: Prueba que falla:** en `smoke.js`, para el caso original y para un caso `limpio`: medir con `Raycaster` vertical sobre la malla cargada la luz entre la cubierta y el borde del pasarruedas en cada eje, y comparar con `datos.gapF/gapR` (tolerancia 0,5 cm). Esperado: falla.
- [ ] **Step 2:** Implementar `vehiculo3d.js`: cargar, inclinar `cuerpo` según la luz, doblar las ballestas (o usar las de código), suciedad, rueda de auxilio, y todas las variantes de la tabla del spec. Clon en verde oliva con inscripciones y barra de luces para la de Gendarmería.
- [ ] **Step 3:** Escribir `vehiculo.js` con los 10 puntos ajustados a esta camioneta; `main.js` junta contenido y geometría por id.
- [ ] **Step 4:** Correr smoke y la prueba de medida. Esperado: pasa. Snapshot `06-vehiculo`.

### Tarea 7: Recorrido completo sobre la Hilux

**Files:**
- Modify: `tools/smoke.js` (posiciones desde `VEHICULO`)

- [ ] **Step 1:** El `PLAN` de `smoke.js` toma las posiciones sugeridas de `VEHICULO.puntos`. Correr con `caso=original`, `perfil=limpio` y `perfil=completo`, en las dos medidas.
- [ ] **Step 2:** Revisar todas las capturas: cada indicio se ve, cada medida coincide con la cinta. Esperado: sin errores. Snapshot `07-recorrido`. **Punto de demostración 2.**

## Etapa 3: Personas

### Tarea 8: Rocketbox a GLB

**Files:**
- Create: `tools/assets/rocketbox.mjs`, `tools/assets/rocketbox_prep.py`
- Output: `src/next/assets/{alta,liviana}/conductor.<hash>.glb`, `companero.<hash>.glb`, `espera.<hash>.glb` (animación de espera)
- Modify: `tools/test-assets.js`, `CREDITOS.md`

**Interfaces:**
- Conductor: huesos de Rocketbox con nombres originales (`Bip01 …`, `REye`, `LEye`); formas faciales con nombres ARKit: `eyeBlinkLeft`, `eyeBlinkRight`, `browInnerUp`, `browDownLeft`, `browDownRight`, `jawOpen`, `mouthPressLeft`, `mouthPressRight`, `mouthSmileLeft`, `mouthSmileRight`, `mouthFrownLeft`, `mouthFrownRight`, y visemas `viseme_aa`, `viseme_O`, `viseme_E`, `viseme_PP`.
- Compañero: ropa recoloreada a verde oliva, chaleco intacto.

- [ ] **Step 1: Prueba que falla:** `test-assets.js` controla que el conductor tenga esas formas y los huesos de ojos y dedos, y que el compañero y la animación existan. Esperado: falla.
- [ ] **Step 2:** Implementar la conversión (Blender sin interfaz) y los niveles (cabeza 2K en `alta`, 1K en `liviana`).
- [ ] **Step 3:** `node tools/test-assets.js`. Esperado: pasa. Snapshot `08-rocketbox`.

### Tarea 9: Conductor y compañero en el motor

**Files:**
- Create: `src/next/motor/conductor.js`
- Modify: `src/next/motor/main.js` (charla llama a `hablar`, contexto de conducta), `src/next/motor/escena.js` (compañero)

**Interfaces:**
- `crearConductor(gltf, cabina) -> { grupo, actualizar(dt, ctx), hablar(texto), callar() }` con `ctx = { conducta, jugador: Vector3, hablando, preguntaIncomoda, jugadorAtras }` y `cabina = { asiento, volante: { centro, radio, normal }, espejo }`.

- [ ] **Step 1: Prueba que falla:** en `smoke.js`: con un caso `nervioso` y el jugador detrás, en 5 s la mirada (hueso de la cabeza) apunta al espejo al menos una vez y hay más parpadeos que con un caso `calmo`; al contestar, `jawOpen` pasa de 0. Esperado: falla.
- [ ] **Step 2:** Implementar (con `prefers-reduced-motion` las conductas se mantienen) la pose sentada, la cinemática inversa de dos huesos de cada brazo hacia el aro, los dedos cerrados, la respiración y las conductas de la tabla del spec; `hablar` mueve mandíbula y visemas al ritmo del texto.
- [ ] **Step 3:** Compañero cerca de la garita con la animación de espera.
- [ ] **Step 4:** Smoke y capturas de la charla. Esperado: pasa. Snapshot `09-personas`. **Punto de demostración 3.**

## Etapa 4: Entorno y entrega

### Tarea 10: Garita, objetos y vegetación

**Files:**
- Modify: `tools/assets/escena.mjs` (modelos de Poly Haven), `src/next/motor/escena.js`, `src/next/motor/vehiculo3d.js` (bolsas de cemento, termo, objetos)

- [ ] **Step 1:** Agregar al pipeline los modelos de la tabla del spec, en los dos niveles, con `test-assets.js` pasando.
- [ ] **Step 2:** Garita rehecha, barreras, postes, vegetación instanciada (completa o la mitad según calidad); objetos del caso desde los modelos.
- [ ] **Step 3:** Smoke en los dos niveles y capturas. Snapshot `10-entorno`.

### Tarea 11: Sin conexión y `dist/`

**Files:**
- Create: `tools/build.mjs`
- Modify: `src/next/sw.js` (red primero para el código, caché primero para `assets/`, caché `gendarmeria-poc-v2`), `src/next/index.html` (enlace "Créditos")
- Delete: `tools/build.py` (al pasar a `src/`)

- [ ] **Step 1: Prueba que falla:** `smoke.js` con `context.setOffline(true)` después de una primera carga: la página vuelve a abrir y la partida arranca. Abrir `dist/gendarmeria-poc.html` por `file://` con la red bloqueada: arranca. Esperado: falla.
- [ ] **Step 2:** Implementar el service worker y `build.mjs` (esbuild a un script, assets `liviana` en base64 en `window.__ASSETS`).
- [ ] **Step 3:** Pruebas. Esperado: pasan. Snapshot `11-entrega`.

## Etapa 5: Cierre

### Tarea 12: Documentación y pedido de aprobación

- [ ] **Step 1:** Actualizar `README.md`, `docs/arquitectura.md` y `docs/roadmap.md` en `src/next` → referencias a la estructura nueva.
- [ ] **Step 2:** Smoke completo en los dos niveles y las dos medidas; capturas nuevas en `docs/capturas/`.
- [ ] **Step 3:** Pedir al usuario la aprobación para pasar `src/next/` a `src/`. No hacerlo sin esa aprobación.
