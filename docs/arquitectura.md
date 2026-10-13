# Arquitectura

## Resumen

Es una página web estática sin build. three.js r128 se carga como script global y el resto es JavaScript sin framework: `main.js` (motor), `caso.js` (reglas de cada partida) y `escenario.js` (contenido). Corre en el navegador, sin servidor ni base de datos.

```
index.html ── estructura de la UI (HUD, paneles, pantallas)
styles.css ── tokens de color, tipografía y layout responsive
vendor/three.min.js ── motor 3D (global THREE)
escenario.js ── window.ESCENARIO: contenido del caso
caso.js ── window.generarCaso(ESCENARIO, { semilla, perfil }): arma la partida
main.js ── motor del simulador
   ├─ Escena       cielo de crepúsculo, terreno, garita, cartel de PARE, barrera, conos, reflector
   ├─ Camionetas   makePickup(opciones) arma la Hilux del caso y la de Gendarmería
   ├─ Caso         buildTruck() aplica el estado de cada punto al modelo
   ├─ Jugador      movimiento, colisiones, agacharse
   ├─ Cámara       primera persona o encuadre de cerca, con desplazamiento por el panel
   ├─ Conductor    mirada, parpadeo y manos según esté nervioso o tranquilo
   ├─ Sonido       WebAudio generado: motor, grillos y golpe sobre la caja
   ├─ Detección    qué puntos se pueden revisar en este momento
   ├─ UI           HUD, inspección y acciones, charla, libreta, decisión, resultado
   ├─ Registro     eventos de la partida, descargables en JSON
   └─ Entrada      joystick táctil, arrastre para mirar, teclado
```

## Flujo

```
 intro ──[Empezar]──> play ──[Terminar + decisión]──> debrief ──[Caso nuevo | Repetir]──> play
                       │
                       ├─ Revisar ─> encuadre de cerca + panel ─> acciones ─> marcar ─┐
                       ├─ Hablar ──> encuadre en la ventanilla + charla ──────────────┤ (pausa el movimiento)
                       ├─ Libreta ─> panel (se puede abrir encima de una inspección) ─┤
                       └─ Terminar ─> panel de decisión ──────────────────────────────┘
```

`state.mode` vale `intro`, `play` o `debrief`. Mientras hay algún panel abierto, `state.paused` es `true` y el jugador no se mueve. Los paneles de inspección y charla no oscurecen la escena: se puede arrastrar en la parte visible para mirar un poco alrededor del encuadre.

## Cómo se arma una partida

1. `caso.js` recibe una semilla (número, `original` o ninguna para una al azar) y devuelve:
   - `perfil`: `limpio`, `oculto`, `doblada` o `completo`.
   - `estados`: el estado de cada punto de `ESCENARIO.pois`.
   - `conducta`: `calmo` o `nervioso`.
   - `fisico`: lo que necesita el modelo 3D (luz de cada eje, altura del doble fondo, tornillos nuevos).
   - `datos`: valores para los textos (`{gapR}`, `{chasisReal}`, `{ticketHora}`...).
2. `buildTruck()` construye la Hilux con esos parámetros: inclina el cuerpo según la luz de cada eje, sube el piso de la caja, agrega la soldadura o la pintura, cambia el escape, pone el grabado y la chapa del chasis correctos, dibuja el ticket y los objetos de los asientos.
3. La interfaz toma los textos del estado de cada punto. La devolución usa `irr` de cada estado para saber qué era un indicio.

El generador es determinístico: el mismo número de caso arma siempre la misma camioneta. `tools/test-caso.js` genera 5.000 casos y verifica que sean coherentes (un caso limpio no tiene indicios, uno sospechoso tiene al menos uno, las medidas cierran, toda pregunta tiene respuesta para cada estado).

## Sistema de coordenadas

- Unidades en metros. El eje y es la altura.
- La camioneta inspeccionada está en el origen, mirando hacia **-z**.
- El **lado del conductor es -x**, el acompañante +x y la caja de carga hacia +z.
- El jugador arranca en (-2.6, 6.5), atrás y a la izquierda de la camioneta.
- Área caminable: x de -6 a 7.2 y z de -9.5 a 13.

## El modelo de la camioneta

`makePickup` arma la carrocería con perfiles laterales extruidos (`extrudeSide`): capó con el pasarruedas delantero recortado, puertas, paredes de la caja con el pasarruedas trasero recortado y el habitáculo vidriado. Los pasarruedas tienen un forro oscuro para que la luz entre guardabarros y cubierta se lea como un hueco.

Medidas clave (constantes al principio de la sección):

| Constante | Valor | Qué es |
|---|---|---|
| `FZ`, `RZ` | -1,65 y 1,5 | Posición de los ejes |
| `WR` | 0,4 | Radio de la rueda (centro a 0,4 m del piso) |
| `ARCH` | 0,5 | Radio del pasarruedas: con el cuerpo en su lugar deja 10 cm de luz |
| `BED` | ver código | Caja: pared de 0,80 a 1,30 m (50 cm por fuera), piso original a 0,83 m (47 cm por dentro) |

**Suspensión.** El cuerpo es rígido. A partir de la luz que se quiere en cada eje (`gapF`, `gapR`), se calcula una inclinación y una altura del cuerpo; las ruedas no se mueven. Las ballestas traseras se dibujan entre el eje y el chasis, así que se ven arqueadas o planas según la carga.

**Las medidas salen del modelo.** `showMeasure` dibuja la cinta entre los mismos puntos que usa la geometría y `caso.js` calcula `datos.gapF`, `datos.int`, etc. con las mismas constantes. Si se cambia una medida del modelo, hay que cambiarla en los dos lados; `test-caso.js` controla que interior, exterior y diferencia cierren.

**Lo que queda a la sombra.** No hay sombras proyectadas. Para que debajo de la camioneta esté oscuro, los materiales del chasis se registran con `shade()`: sin linterna se oscurecen y pierden el brillo; con linterna recuperan su color. Así la soldadura y el escape nuevo solo brillan cuando se los alumbra.

## La cámara

Hay dos modos: primera persona (sigue al jugador) y encuadre de cerca (`view.close`), que se activa al revisar un punto o hablar con el conductor.

- Cada punto tiene una o más `vistas` (`pos`, `mira`, `fov`) en `escenario.js`; se usa la más cercana al jugador. Algunas acciones mueven la cámara a otra vista (mirar la ballesta, medir por fuera).
- La transición dura medio segundo en tiempo real, con aceleración y frenado. Se interpola posición, ángulos y campo visual.
- El panel tapa parte de la pantalla (abajo en el celular, a la derecha desde 900 px de ancho). `applyViewOffset` usa `camera.setViewOffset` para correr el centro de la imagen al centro de la parte visible, y el campo visual se abre para que esa franja muestre lo que mostraría la pantalla entera.
- Con un encuadre abierto, arrastrar sobre la escena mueve un poco la mirada (hasta ±40° de lado y ±29° hacia arriba o abajo).

## Partes de `main.js`

| Sección | Funciones clave | Qué hace |
|---|---|---|
| Escena | `box`, `cyl`, `plane`, `canvasTex`, `mudTex`, `worldUV` | Primitivas, texturas dibujadas en canvas y UV a escala de mundo para que la tierra no se estire. |
| Camionetas | `makePickup`, `extrudeSide`, `buildTruck`, `shade` | Modelo de la Hilux y la de Gendarmería; aplicación del caso. |
| Conductor | `buildDriver`, `updateDriver` | Cabeza con ojos, cejas y boca; brazos al volante. Mirada, parpadeo, dedos y titubeos según la conducta. |
| Jugador | `move`, `blocked` | Movimiento relativo a la vista y colisión contra cajas alineadas a los ejes (`OBST`). |
| Cámara | `poseTarget`, `setCloseView`, `updateCamera`, `applyViewOffset`, `refit` | Ver arriba. |
| Sonido | `audioInit`, `updateAudio`, `knockSound` | Se crea al tocar Empezar (los navegadores lo exigen). |
| Detección | `updateNearby` | Qué botones de revisar mostrar. |
| Inspección | `openInspect`, `renderActions`, `doAction`, `showMeasure`, `setMark` | Panel, acciones y cinta métrica. |
| Libreta | `note`, `openNotes` | Anota hechos, sin juicios. |
| Charla | `renderQuestions`, `answerOf`, `docsCards` | Respuestas según el caso y la conducta, con demora. |
| Resultado | `finish`, `downloadLog` | Calificación por perfil, lista de puntos, notas condicionales y registro. |
| Bucle | `frame`, `resize` | `requestAnimationFrame`; el movimiento usa un paso máximo de 50 ms y la cámara, tiempo real. |

## Cómo se detecta qué se puede revisar

Cada 120 ms, para cada punto de `ESCENARIO.pois` se verifica:

1. Si el punto exige estar agachado (`crouch: true`), que el jugador lo esté.
2. Que el jugador esté del lado correcto (`side(posición)`).
3. Que la distancia horizontal al punto sea menor que `range`.
4. Que el punto esté dentro del cono de visión: el producto escalar entre la dirección de la cámara y la dirección al punto tiene que ser mayor a 0,72, unos 44 grados.

Se muestran como mucho dos botones, los más centrados, en un orden fijo para que no salten de lugar. Los rótulos son genéricos ("Revisar: Rueda trasera"), iguales para indicios y puntos normales.

## Registro de eventos

`state.events` guarda cada acción con el tiempo en segundos desde el inicio: `inicio`, `revisar` (con si la linterna estaba prendida), `accion`, `marca`, `pregunta`, `charla`, `libreta`, `linterna`, `agacharse` y `decision` (con calificación, detectados y falsos positivos). El botón "Descargar registro de la partida" baja un JSON con el caso, sus estados y los eventos. Es la base para pasar a xAPI más adelante.

## Rendimiento

- Materiales Phong en la camioneta (iluminación por píxel, necesaria para el reflector y la linterna) y Lambert en el paisaje.
- Sin sombras proyectadas.
- Tone mapping ACES para que el reflector y la linterna no quemen el blanco.
- Árboles con `InstancedMesh`.
- Resolución limitada a 2x.
- En una escena típica: unas 310 llamadas de dibujo y 15.000 triángulos. Es razonable para celulares de gama media; falta medir en gama baja. Si hiciera falta, lo primero es fusionar las piezas chicas (tornillos, hojas de ballesta, rayos de las llantas).

## Accesibilidad

- Los paneles reciben el foco al abrirse y se cierran con Esc.
- Los contadores, los avisos, la charla y los resultados de las acciones se anuncian con `aria-live` o `role="status"`.
- El golpe sobre la caja tiene su descripción en texto, además del sonido.
- Las imágenes de la tarjeta (patente, grabado, chapa, ticket) tienen texto alternativo.
- Respeta `prefers-reduced-motion`: sin balanceo, sin transiciones de cámara ni demoras en las respuestas.
- Modo claro y oscuro con tokens en `:root`.
- **Limitación:** la navegación 3D no es accesible con lector de pantalla.

## Cómo extenderlo

### Cambiar un texto o una calificación

Todo está en `escenario.js`. Ver [normativa.md](normativa.md).

### Agregar un punto con estados

1. Agregar la entrada en `ESCENARIO.pois` con `id`, `label`, `p`, `range`, `side`, `vistas` y `estados` (cada uno con `irr`, `text` y `why`).
2. En `caso.js`, asignar `e.<id>` según el perfil.
3. En `main.js`, en `buildTruck`, dibujar lo que cambia según `CASE.estados.<id>`.
4. Si tiene acciones, agregarlas en `acciones` y su efecto en `doAction`.
5. Correr `node tools/test-caso.js` y `tools/smoke.js` (agregar el punto a `PLAN` con una posición sugerida).

### Agregar un perfil

Agregarlo en `ESCENARIO.perfiles` con su peso, decidir en `caso.js` qué estados implica, y completar `v`, `end` y `fb` de cada decisión (o dejar que tome `otro`).

### Armar otro caso (otro vehículo, otro lugar)

Hoy la escena y el vehículo están en `main.js`. Para tener varios escenarios hay que pasar también la escena a datos. Está en el roadmap.

## Cómo se probó

- `tools/test-caso.js`: 5.000 casos generados, con controles de coherencia.
- `tools/smoke.js`: Playwright con Chromium sin interfaz (WebGL por software), en 390 × 844 y 1280 × 800. Recorre los 10 puntos desde posiciones alcanzables, ejecuta todas las acciones, habla con el conductor, abre la libreta, decide y guarda una captura por paso. Se corrió con el caso original y con casos de cada perfil. Las capturas de `docs/capturas/` salen de ahí.

Para depurar, `window.__dbg` expone `player`, `state`, `POIS`, `camera`, `view`, `blocked`, `renderer`, `CASE`, `start` y `setTorch`. Por ejemplo, `Object.assign(__dbg.player, { x: -1.6, z: 1.4 })` mueve al jugador.
