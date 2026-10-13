# Modelos fotorrealistas: diseño

**Fecha:** 13/10/2026
**Estado:** acordado en la conversación, pendiente de revisión escrita.
**Alcance:** reemplazar los modelos hechos con primitivas (camioneta, conductor, compañero, puesto y paisaje) por modelos y materiales lo más cercanos posible a lo real, sin cambiar el procedimiento ni las reglas del caso.

## Objetivo

Que el gendarme practique la inspección sobre algo que se parezca lo más posible a una camioneta, una persona y un puesto reales, para que lo que entrena (comparar, medir, alumbrar, leer la conducta) se traslade a la ruta.

El éxito se mide así:

- De cerca, la camioneta se lee como una Hilux real: carrocería, interior, caja, tren trasero y chasis.
- El conductor tiene cara, ojos, párpados y manos de persona, y sus conductas nerviosas o tranquilas se ven en la cara y el cuerpo.
- La luz de la escena es la de un puesto a las 19:50: cielo de después de la puesta, reflector como luz principal y sombras reales; debajo de la camioneta no se ve sin linterna.
- Sigue funcionando sin conexión y en celulares de gama media.

## Lo que no cambia

- **El procedimiento y el puntaje.** Los textos, estados, preguntas, decisiones y calificaciones siguen en `escenario.js`. Las reglas de cada partida siguen en `caso.js`, que sigue siendo determinístico: la misma semilla arma el mismo caso.
- **Las medidas salen del modelo.** Lo que se mide con la cinta tiene que coincidir con lo que se ve. Ahora los números se toman de la malla real de la camioneta (ver "Medidas del modelo").
- **Funciona sin conexión.** El sitio servido queda guardado en el dispositivo después de la primera visita, y `dist/` sigue siendo un solo archivo que se abre con doble clic.
- **La interfaz y la accesibilidad.** Paneles, libreta, charla, resultado, registro descargable, teclado, foco, `aria-live`, modo claro y oscuro, y `prefers-reduced-motion`.
- **Textos en español rioplatense (voseo).**

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Enfoque | Híbrido: modelos importados donde suman mucho, código donde hay que controlar la geometría (variantes del caso y medidas). |
| Camioneta | Modelo descargado "Toyota Hilux Revo Prerunner 2021", tratado como pieza reemplazable. Su licencia CC-BY es dudosa (ver "Riesgos"). |
| Personas | Microsoft Rocketbox (licencia MIT). |
| Paisaje, cielo, texturas y objetos | Poly Haven (CC0). |
| Motor 3D | three.js r186 como módulos ES, guardado en el proyecto. |
| Dispositivos | Todavía no se sabe. Dos niveles de calidad, `alta` y `liviana`, elegidos por dispositivo. |
| Versión publicada | Mismo enlace. La versión actual queda congelada en `/gendarmeria/v1/` y la nueva se previsualiza en `/gendarmeria/next/` hasta aprobarla. |

## Arquitectura

### Motor

- **three.js r186** (`three.module.min.js` y los complementos que se usen) en `src/vendor/three/`, con un `importmap` en `index.html`. No se carga nada de una CDN.
- **Renderer WebGL** (`WebGLRenderer`), no WebGPU, por compatibilidad con celulares.
- **Color y tono:** `outputColorSpace` sRGB y tone mapping **AgX**. Las texturas dibujadas en canvas (patentes, grabado, ticket, chapa) se marcan como sRGB.
- **Materiales:** `MeshStandardMaterial` y `MeshPhysicalMaterial` (laca de la pintura con *clearcoat*). Dejan de usarse Phong y Lambert.
- **Complementos:** `GLTFLoader` con `MeshoptDecoder` y el cargador de `.hdr`. Las texturas van en WebP adentro de los GLB (`EXT_texture_webp`).

### Archivos

Estructura final. Durante el desarrollo vive en `src/next/` (ver "Hosting y versiones").

```
src/
├── index.html            importmap, pantalla de inicio con progreso de carga y enlace a créditos
├── styles.css
├── escenario.js          contenido (script común, igual que hoy)
├── caso.js               reglas de la partida (script común; lee las medidas del vehículo)
├── vehiculo.js           puntos de revisión de este vehículo: anclas, encuadres y lados (escrito a mano)
├── assets/
│   ├── hilux.medidas.js  medidas tomadas de la malla (generado por tools/assets)
│   ├── manifest.json     lista de archivos por nivel de calidad, con su peso (generado)
│   ├── alta/             GLB, cielo y texturas del nivel alto
│   └── liviana/          lo mismo, más liviano
├── motor/
│   ├── main.js           arranque, bucle, estado general
│   ├── calidad.js        elige el nivel y expone sus parámetros
│   ├── cargador.js       carga con progreso; en dist/ lee los assets incrustados
│   ├── escena.js         cielo, luces, suelo, garita, objetos y vegetación
│   ├── vehiculo3d.js     prepara la Hilux y le aplica el caso
│   ├── conductor.js      conductor: pose, conducta, mirada, parpadeo, habla
│   ├── jugador.js        movimiento, colisiones, agacharse, linterna
│   ├── camara.js         primera persona, encuadre de cerca, desplazamiento por el panel
│   ├── sonido.js         el sonido generado de hoy, sin cambios de comportamiento
│   └── ui.js             HUD, inspección, acciones, cinta, libreta, charla, decisión, resultado, registro
├── sw.js                 service worker (ver "Sin conexión")
└── vendor/three/         three.js r186 y complementos, con su licencia
tools/
├── assets/               descarga y procesa los assets (ver "Pipeline")
├── build.mjs             arma dist/ con esbuild (reemplaza build.py)
├── test-caso.js          se amplía (ver "Pruebas")
├── test-assets.js        nuevo
└── smoke.js              se adapta (ver "Pruebas")
CREDITOS.md               origen y licencia de cada asset
```

`escenario.js` y `caso.js` siguen siendo scripts comunes para que `test-caso.js` los cargue en Node sin cambios de fondo.

### Interfaces entre partes

- `generarCaso(ESCENARIO, VEHICULO_MEDIDAS, { semilla, perfil })` devuelve lo mismo que hoy. `fisico` y `datos` se calculan con las medidas del vehículo en vez de constantes.
- `vehiculo3d.armar(gltf, medidas, caso)` devuelve `{ grupo, cuerpo, ruedas, anclas }`. `anclas` tiene los puntos 3D donde van la cinta y las piezas agregadas.
- `conductor.crear(gltf, cabina)` devuelve un objeto con `actualizar(dt, contexto)`, `hablar(texto)` y `mirar(objetivo)`. El contexto incluye la conducta del caso, la posición del jugador y si hay una pregunta incómoda en curso.
- `calidad.nivel` vale `'alta'` o `'liviana'`. `calidad.parametros` tiene el tamaño de los mapas de sombra, la resolución máxima, la cantidad de vegetación y la carpeta de assets.
- `cargador.cargar(manifest, nivel, alProgresar)` devuelve los assets listos. En `dist/` no hace pedidos de red: lee los datos incrustados.

## Assets

### Fuentes y licencias

| Asset | Fuente | Licencia |
|---|---|---|
| Hilux | "Toyota Hilux Revo Prerunner 2021", de Asadawut.Kaewma (Sketchfab), descargado del espejo de GitHub `Alive-hub/WebAR_AliveStudiosWebsite` | CC-BY 4.0 declarada; origen dudoso |
| Conductor | Rocketbox `Professions/Wood_Male_01` (versión `_facial`) | MIT |
| Compañero | Rocketbox `Construction_Male_08`, recoloreado a verde oliva, con el chaleco reflectivo | MIT |
| Cielo | HDRI de Poly Haven. Candidatos: `kloppenheim_06_puresky`, `evening_road_01_puresky`, `industrial_sunset_puresky`, `belfast_sunset_puresky`. Se elige el que, con el sol ya bajo el horizonte, deje el cielo azul profundo arriba y un resto cálido en el horizonte | CC0 |
| Texturas | Poly Haven: asfalto (`asphalt_02`), banquina de tierra seca y ripio (`brown_mud_dry`, `rocky_trail`), revoque (`painted_plaster_wall`), chapa acanalada (`corrugated_iron`), metal oxidado (`rusty_metal_02`) | CC0 |
| Objetos | Poly Haven: `cement_bag`, `plastic_thermos`, `cigarette_pack`, `plastic_crate_01`, `plastic_jerrycan`, `cardboard_box_01`, `concrete_road_barrier`, `modular_electricity_poles`, arbustos y árboles secos (`shrub_01` a `shrub_04`, `searsia_lucida`, `searsia_burchellii`, `dry_branches_medium_01`) | CC0 |

`CREDITOS.md` lista cada asset con su autor, enlace y licencia. Como CC-BY exige atribución donde se muestre, la pantalla de inicio tiene un enlace "Créditos" que la muestra.

### Pipeline (`tools/assets/`)

Scripts en Node, reproducibles: correrlos de nuevo arma los assets desde las fuentes.

1. **Descargar** a `tools/.cache/` (fuera de `src/`): el espejo de la Hilux, el repositorio de Rocketbox (solo los archivos necesarios) y la API de Poly Haven.
2. **Blender sin interfaz** para lo que glTF Transform no puede hacer:
   - pasar el FBX de Rocketbox a GLB;
   - dejar solo las formas faciales que se usan: parpadeo izquierdo y derecho, miradas, cejas, mandíbula, labios apretados, sonrisa, ceño y entre 2 y 4 visemas para el habla;
   - pasar la Hilux a volante a la izquierda;
   - recolorear al compañero.

   Blender 4.3 se arma desde los paquetes de Debian desempaquetados en `tools/.cache/blender`, sin `sudo` ni instalar nada en el sistema.
3. **glTF Transform:** simplificar, comprimir con meshopt, pasar texturas a WebP y generar los dos niveles (2K y 1K).
4. **Medir la Hilux** y escribir `src/assets/hilux.medidas.js` (ver "Medidas del modelo").
5. **Cielo:** a partir del HDRI, un `.hdr` de 1K para la iluminación y un JPG para el fondo visible (4K en `alta`, 2K en `liviana`).
6. **Escribir** `manifest.json` y controlar que cada archivo entre en su presupuesto de peso. Los nombres de los archivos llevan un hash del contenido (por ejemplo, `hilux.3f9a2c.glb`), así que un archivo cambiado tiene otro nombre y la caché nunca sirve uno viejo.

### Presupuesto de peso (aproximado)

| | `alta` | `liviana` |
|---|---|---|
| Hilux | 6 MB | 3,5 MB |
| Conductor | 2,5 MB | 2 MB |
| Compañero | 1 MB | 1 MB |
| Cielo | 2,5 MB | 2 MB |
| Texturas de suelo y garita | 8 MB | 3 MB |
| Objetos y vegetación | 6 MB | 3 MB |
| three.js y código | 1 MB | 1 MB |
| **Total** | **unos 27 MB** | **unos 15 MB** |

`dist/` incrusta el nivel `liviana` en base64, así que pesa unos 20 MB. `test-assets.js` falla si un archivo supera su presupuesto en más de un 20 %.

## Vehículo

### Preparación del modelo

- Se borra `Object037`, la chapa plana que tapa la parte de abajo.
- **Volante a la izquierda:** se espeja la camioneta entera sobre el eje x y se vuelven a espejar las texturas con texto (insignias, tablero, instrumentos) para que se lean bien.
- Pintura blanca para la camioneta inspeccionada.
- **Suciedad:** polvo y barro en la parte baja de la carrocería, los pasarruedas, el chasis y el tren trasero, coherente con un camino de ripio salteño. Se hace con una textura de mezcla en los materiales de abajo. Las piezas nuevas de las variantes van limpias, porque esa diferencia es el indicio.
- **Rueda de auxilio** colgada bajo la caja, con una copia de la rueda del modelo, porque el modelo no la trae.
- **Orientación y escala:** el modelo queda en el origen mirando hacia -z, con el lado del conductor en -x, igual que hoy.

### Medidas del modelo (`hilux.medidas.js`)

El script de medición recorre la malla ya preparada y escribe:

- la posición de cada eje y el radio de la rueda;
- la altura del borde de cada pasarruedas sobre el centro de la rueda (en la vertical del eje) y la luz nominal de cada eje sin carga;
- en la caja: la altura del borde superior de la pared, la del borde inferior de la pared por fuera, la del piso (cara superior de las nervaduras), la del techo de los pasarruedas internos y el largo y ancho interiores;
- la posición del larguero izquierdo detrás del eje trasero (para la soldadura, la chapa y la pintura);
- los límites de la carrocería (para las colisiones y los lados de revisión).

El archivo es un script común (`window.VEHICULO_MEDIDAS` o `module.exports`), así que lo usan `caso.js`, el motor y las pruebas.

En `caso.js`:

- `gapF` y `gapR` se sortean alrededor de la luz nominal del modelo. Normal es la nominal más una variación chica. Baja es la nominal menos 6 a 9 cm.
- **Medir por fuera** va del borde inferior de la pared al borde superior.
- **Medir por dentro** va del piso al borde superior. Con doble fondo, la medida interior baja lo que mide el doble fondo.

La cinta (`showMeasure`) dibuja entre esos mismos puntos.

### Suspensión

Igual que hoy: el cuerpo es rígido y las ruedas no se mueven. A partir de la luz pedida en cada eje se calcula la inclinación y la altura del cuerpo. Las ruedas, el eje trasero y las ballestas quedan afuera del grupo que se inclina.

Las ballestas del modelo (`leaf_lr_*`, `leaf_rr_*` y sus nodos `DIR_*`) se doblan entre el eje y los soportes del chasis: arqueadas sin carga, casi planas con peso. Si la deformación del modelo no da un resultado creíble, se reemplazan por ballestas hechas en código, con material real y barro.

### Variantes del caso

Todo lo que cambia según el caso se agrega en código sobre las piezas reales del modelo:

| Punto | Estados | Qué cambia en el modelo |
|---|---|---|
| `fwheel`, `rwheel` | normal, baja, bajaConCarga | Inclinación del cuerpo y curvatura de las ballestas |
| `bed` | vacía, conCarga, dobleFondo | Bolsas de cemento (`cement_bag`) en la caja. El doble fondo es una chapa lisa más alta que tapa las nervaduras y casi todo el pasarruedas. Tornillos nuevos o con óxido |
| `under` | normal, soldadura, pintura, escapeNuevo | Cordón de soldadura y chapa agregada, o pintura negra nueva sin tierra, sobre el larguero izquierdo. Material del escape (`Exhaust_pipe`): nuevo y brillante, u oxidado y con hollín |
| `plate` | normal, cambiada | Patentes Mercosur argentinas en los portapatentes del modelo. La cambiada tiene el contorno limpio y tornillos nuevos |
| `etch` | coincide, distinto, raspado | Grabado del dominio en el parabrisas, del lado del acompañante |
| `vin` | coincide, distinto | Chapa con el número de chasis sobre el tablero, del lado del conductor |
| `ticket` | coherente, contradice, viejo | Ticket sobre el tablero |
| `rseat` | sillita, herramientas, bolsos | Objetos en el asiento trasero (Poly Haven más lo hecho en código) |
| `mate` | mate, gorra | Termo (`plastic_thermos`), mate o gorra en el asiento del acompañante |

### Puntos de revisión (`vehiculo.js`)

Las posiciones de los puntos (`p`), sus encuadres (`vistas`), sus distancias (`range`) y los lados desde donde se revisan (`side`) dependen de la geometría, así que pasan de `escenario.js` a `vehiculo.js`, escritos a mano para esta camioneta. Usan las medidas (por ejemplo, el ancla de la rueda trasera sale de la posición del eje).

`escenario.js` conserva solo el contenido de cada punto: id, rótulo, estados, textos y acciones. El motor junta las dos partes por id. Si se cambia la camioneta, se reescribe `vehiculo.js` y no se toca el contenido.

### Datos del caso que dependen del modelo

El frente es el del restyling 2021, así que los datos base de `escenario.js` pasan a un modelo 2021:

- año 2021;
- chasis declarado `8AJBA3CD5M1523467`: el carácter 10, que indica el año, pasa de "K" (2019) a "M" (2021);
- dominio declarado `AE 219 LM`, de la serie de 2020 y 2021.

El vehículo real (`AF 731 RS`, chasis con "N" de 2022) no cambia. Hay que validar las series con instructores, como el resto del contenido.

### Camioneta de Gendarmería

Es la misma Hilux, clonada (comparte la geometría), en verde oliva, con las inscripciones "GENDARMERÍA" y la barra de luces encendida.

## Conductor y compañero

### Conductor

- **Modelo:** Rocketbox `Wood_Male_01` (piel morena, barba candado, gorra, camisa de jean y pantalón).
- **Pose sentada** con las manos en el volante del lado izquierdo. Brazos y manos se resuelven con cinemática inversa de dos huesos hacia puntos del aro del volante. Los dedos cierran sobre el aro.
- **Movimiento de base:** respiración (pecho y hombros) y microajustes de cabeza.
- **Conductas según el caso**, sobre la cara y el cuerpo reales:

| Señal | Tranquilo | Nervioso |
|---|---|---|
| Mirada | Sostiene la mirada al jugador cuando le habla | La esquiva. Mira el espejo cuando el jugador va hacia la caja |
| Parpadeo | Normal | Más seguido |
| Boca | Relajada | Labios apretados entre respuestas |
| Manos | Quietas | Tamborilea los dedos sobre el volante |
| Cuerpo | Quieto | Se acomoda en el asiento de vez en cuando |
| Respuestas | Sin demora | Tarda en contestar lo que le incomoda |

- La mirada se maneja con los huesos de los ojos. Las formas faciales se usan para parpadeo, boca, cejas y habla.
- **Habla:** mientras aparece la respuesta, la mandíbula y la boca se mueven al ritmo del texto. No hay sincronía exacta con fonemas.
- Con `prefers-reduced-motion` se mantienen las conductas, que son parte de lo que se evalúa, y se quitan las transiciones de cámara como hoy.

### Compañero

- **Modelo:** Rocketbox `Construction_Male_08` recoloreado: uniforme y casco en verde oliva, con el chaleco reflectivo amarillo.
- Parado cerca de la garita, con una animación de espera de Rocketbox.

## Escena e iluminación

- **Cielo:** el HDRI elegido es el fondo visible y la iluminación ambiente (reflejos en pintura, vidrio y cromados). La niebla toma el color del horizonte.
- **Reflector del puesto:** es la luz principal sobre la camioneta y proyecta sombras reales. Debajo de la camioneta queda oscuro por la sombra, así que se elimina el truco actual de oscurecer materiales (`shade`).
- **Linterna:** luz que sigue a la cámara y proyecta sombras.
- **Luces de los vehículos:** faros y luces traseras encendidos (emisivos y una luz chica cada uno). La barra de luces de la camioneta de Gendarmería es azul y roja.
- **Suelo:** asfalto con texturas reales y líneas pintadas gastadas; banquina de tierra seca y ripio; pasto seco más allá.
- **Garita:** rehecha con paredes revocadas, techo de chapa acanalada y una ventana con luz adentro. El cartel de Gendarmería se mantiene.
- **Alrededor:** barreras de hormigón, postes de luz a lo largo de la ruta, conos y cartel de PARE con material retrorreflectivo, y barrera.
- **Vegetación:** arbustos y árboles secos instanciados (monte chaqueño). Los cerros del fondo se mantienen como siluetas lejanas, con mejor material.
- **Antialiasing:** MSAA en `alta`.

## Calidad, carga y sin conexión

### Niveles de calidad

`calidad.js` elige el nivel así:

- `liviana` si es un dispositivo táctil (`pointer: coarse`) con pantalla de menos de 1400 px del lado mayor, o si `navigator.deviceMemory` es 4 o menos;
- `alta` en cualquier otro caso;
- `?calidad=alta` o `?calidad=liviana` fuerzan el nivel.

| Parámetro | `alta` | `liviana` |
|---|---|---|
| Texturas | 2K | 1K |
| Sombra del reflector | 2048, suave (PCF soft) | 1024, PCF |
| Sombra de la linterna | 1024 | 512 |
| Resolución máxima | 2x | 1,5x |
| Vegetación | completa | la mitad |
| Hilux | simplificada a unos 420.000 triángulos | simplificada a unos 200.000 |
| Objetivo | 60 cuadros por segundo en computadora | 30 cuadros por segundo en un celular de gama media |

Con `?debug` se muestran en pantalla el nivel, los cuadros por segundo, las llamadas de dibujo y los triángulos, además del estado del caso de hoy.

### Carga

- La pantalla de inicio muestra el progreso: megas cargados sobre el total del nivel. "Empezar" se habilita al terminar.
- Si un asset no carga, se muestra un error claro con un botón "Reintentar". No se arranca con la escena incompleta.

### Sin conexión

- **Service worker** con un nombre de caché nuevo (`gendarmeria-poc-v2`):
  - red primero para el código (como hoy, para que lleguen los cambios);
  - caché primero para `assets/`, cuyos nombres llevan un hash del contenido y no cambian.
  - Guarda los assets del nivel que se cargó.
- **`dist/`:** `tools/build.mjs` empaqueta el código con esbuild en un solo script e incrusta los assets del nivel `liviana` en base64. El cargador los lee de ahí, así que el archivo funciona abierto con doble clic.

### Hosting y versiones

- Antes de empezar se copia la versión actual a `src/v1/`, que queda congelada en `…/gendarmeria/v1/`.
- La versión nueva se arma en `src/next/` y se ve en `…/gendarmeria/next/` (también por el enlace público del Funnel). Las herramientas reciben la carpeta a probar con la variable `SRC`.
- Al aprobarla, el contenido de `src/next/` pasa a `src/`. Se mantiene `src/v1/`.
- No hace falta tocar la configuración de `tailscale serve`.

## Registro de eventos

Sin cambios, salvo que el evento `inicio` agrega el nivel de calidad y la versión de los assets.

## Pruebas

- **`test-caso.js`:** los 5.000 casos de hoy, ahora con las medidas del modelo. Controla:
  - que la luz normal y la baja de cada eje sean distinguibles (al menos 4 cm de diferencia);
  - que la medida interior más la diferencia dé la exterior;
  - que con doble fondo los pasarruedas internos sigan asomando por lo menos 1 cm;
  - todo lo que ya controlaba.
- **`test-assets.js`** (nuevo): que cada archivo del manifest exista y entre en su presupuesto, que cada asset figure en `CREDITOS.md` con su licencia, y que el GLB de la Hilux tenga los nodos que usa el motor (ruedas, eje, ballestas, escape, larguero).
- **`smoke.js`:** recorre los 10 puntos desde posiciones tomadas de `vehiculo.js`, ejecuta todas las acciones, habla con el conductor, decide y guarda capturas. Se corre en 390 × 844 y 1280 × 800, en los dos niveles, y falla si hay errores en la consola o si un punto no se puede revisar.
- **Revisión visual:** capturas en cada etapa, enviadas para revisar. La prueba en un celular real la hace el usuario por `/next`.
- **Documentación:** se actualizan `README.md`, `docs/arquitectura.md` y `docs/roadmap.md`.

## Etapas

Ordenadas para que haya algo para ver temprano en `/next`:

1. **Base:** copia a `v1`. three.js r186 con módulos y `main.js` partido. La escena actual pasada a materiales físicos, con el cielo HDRI, sombras reales y el suelo con texturas. La camioneta sigue siendo la de primitivas.
2. **Hilux:** pipeline de assets, preparación del modelo, medidas, `vehiculo.js`, suspensión, variantes del caso y camioneta de Gendarmería. Pruebas del caso actualizadas.
3. **Personas:** conductor con pose, conductas y habla. Compañero.
4. **Entorno y entrega:** garita, objetos y vegetación. Niveles de calidad, carga con progreso, service worker y `dist/`.
5. **Cierre:** `smoke.js` completo, documentación, revisión y pase a `src/`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| **Licencia de la Hilux:** dice CC-BY, pero probablemente salió del sitio de Toyota. Riesgo de pedido de baja si se muestra afuera. | Es una pieza reemplazable: cambiarla implica volver a correr el pipeline y reescribir `vehiculo.js`. Antes de mostrarlo fuera de Humand, comprar un modelo con licencia estándar (unos USD 60 a 80) o decidir asumir el riesgo. |
| El rendimiento en celulares con unos 200.000 triángulos y sombras | Nivel `liviana`, medición con `?debug` en un celular real en la etapa 2, y si hace falta, más simplificación o sombra solo del reflector. |
| El conductor a 40 cm parece un personaje de juego | Textura de la cabeza en 2K, buena luz sobre la cara, y conductas sutiles en vez de exageradas. |
| La deformación de las ballestas del modelo no funciona | Ballestas hechas en código (ya previsto). |
| El paso de r128 a r186 rompe comportamientos actuales | Se porta primero la escena actual (etapa 1) y se corre `smoke.js` antes de cambiar modelos. |
| `smoke.js` con WebGL por software en la Pi es muy lento con la escena pesada | Correrlo en `liviana` por defecto y `alta` solo al cierre de cada etapa. |

## Fuera de alcance

- Acciones nuevas del procedimiento (abrir la guantera o el capó, pedir que baje).
- Conversación libre con IA.
- Manos o cuerpo del jugador.
- Envío del registro a un servidor o LRS.
- Otros vehículos o escenarios.
- WebGPU.
- Posprocesado más allá del tone mapping y el MSAA (por ejemplo, oclusión ambiental en pantalla).
