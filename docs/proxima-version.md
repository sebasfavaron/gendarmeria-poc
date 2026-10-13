# Próxima versión: modelos fotorrealistas

**Estado al 13/10/2026:** en `src/next/`, publicada en `/gendarmeria/next/`. Todavía no reemplazó a la versión principal: hace falta la aprobación del usuario para pasarla a `src/`.

- Diseño: [specs/2026-10-13-modelos-fotorrealistas-design.md](superpowers/specs/2026-10-13-modelos-fotorrealistas-design.md)
- Plan: [plans/2026-10-13-modelos-fotorrealistas.md](superpowers/plans/2026-10-13-modelos-fotorrealistas.md)

La versión anterior quedó congelada en `src/v1/` (`/gendarmeria/v1/`).

## Qué cambió

- **Motor:** three.js r186 como módulos ES, con importmap y sin CDN. Materiales físicos, cielo HDRI como fondo y como luz, tone mapping AgX y sombras reales del reflector y de la linterna.
- **Camioneta:** una Hilux real importada, con el volante a la izquierda, blanca y con tierra hacia abajo.
  - **Suspensión:** el cuerpo se inclina según la luz de cada eje, y las ballestas giran en el eje: con peso quedan planas.
  - **Variantes del caso:** todas se agregan sobre las piezas reales del modelo.
    - soldadura o pintura sobre el larguero;
    - doble fondo y tornillos;
    - escape nuevo;
    - patentes Mercosur, grabado del parabrisas, chapa VIN y ticket;
    - bolsas de cemento;
    - objetos en los asientos.
  - **Detalles nuevos:** rueda de auxilio, luces encendidas, ventanilla del conductor bajada y luz de techo.
- **Personas:** conductor y compañero de Microsoft Rocketbox.
  - El conductor está sentado con las manos en el volante (cinemática inversa).
  - Su mirada se mueve con los huesos de los ojos y la cabeza.
  - Parpadea, aprieta los labios y tamborilea con los dedos.
  - Mueve la boca mientras contesta.
  - Las conductas nerviosa y tranquila se distinguen.
- **Lugar:**
  - garita con revoque y chapa;
  - barreras de hormigón;
  - asfalto, banquina y monte con texturas de Poly Haven;
  - monte de árboles y arbustos reales como "impostores" (fotos en planos cruzados);
  - sierras lejanas.
- **Calidad:** `alta` en computadoras (18,4 MB) y `liviana` en celulares (9,5 MB). Se fuerza con `?calidad=alta|liviana`.
- **Carga:** barra de progreso; error con "Reintentar" si algo no carga; aviso si el dispositivo no tiene WebGL 2 o pierde el contexto 3D.
- **Sin conexión:**
  - La página guarda los assets que baja y el service worker propio sirve el código.
  - `dist/next/gendarmeria-poc.html` es un solo archivo de 13,6 MB, con el nivel `liviana` adentro.
- **Créditos** en la pantalla de inicio (la Hilux es CC-BY).

## Medidas que salen del modelo

`tools/assets/medir-hilux.mjs` mide la malla con rayos y escribe `assets/hilux.medidas.js`. Lo usan `caso.js`, la cinta y las pruebas.

| Medida | Valor | Cómo se toma |
|---|---|---|
| Luz delantera sin carga | 12 cm | Del tope de la cubierta al borde de la chapa, en la mitad exterior de la rueda |
| Luz trasera sin carga | 11,1 cm | Ídem. Baja: de 6 a 9 cm menos |
| Por dentro de la caja | 46 cm | Del piso (nervaduras) al borde |
| Por fuera | 53 cm | **En el portón**, del borde de abajo al de arriba |

**Por qué por fuera se mide en el portón:** en esta camioneta la pared lateral baja unos 26 cm por debajo del piso para tapar el chasis. Medida en el costado, la diferencia con la de adentro sería grande incluso sin doble fondo. En el portón, la diferencia normal es de 7 cm (el espesor del piso) y con doble fondo llega a 17–21. Hay que validar el procedimiento con instructores.

`tools/test-medidas.js` comprueba con rayos sobre la camioneta cargada (ya inclinada) que la cinta coincida con la malla: luces y piso con menos de 0,6 cm de diferencia en 5 casos.

## Diferencias con el plan

- **La Hilux la preparé yo con glTF Transform**, sin Blender: el agente que la tenía asignada se trabó.
  - El volante pasó a la izquierda espejando solo el interior. Las piezas con texto (instrumentos, pantalla, botones) se trasladan sin espejarse.
  - Las ballestas son cuatro mitades con pivote en el eje.
  - No hay nodos `portapatente_*`: las patentes se ubican con las medidas.
- **La Hilux en `liviana` tiene unos 235.000 triángulos**, no 200.000: la carrocería, los guardabarros, las ruedas y lo de abajo (largueros, ballestas, eje, escape) se simplifican poco porque ahí se mide y se revisa con la linterna.
- **Vegetación:** "impostores" (los árboles de Poly Haven tienen de 0,8 a 1,4 millones de triángulos).
- **La sombra del reflector se recalcula solo cuando cambia la camioneta**, y la linterna proyecta sombra solo prendida: es lo que más pesaba por cuadro.

## Cómo se arma y se prueba

```bash
npm i --prefix tools                 # una vez
node tools/assets/escena.mjs         # cielo y texturas (Poly Haven)
node tools/assets/objetos.mjs        # objetos (Poly Haven)
node tools/assets/vegetacion.mjs     # árboles y arbustos como impostores
node tools/assets/hilux.mjs          # Hilux: preparación y niveles (tarda unos minutos)
node tools/assets/medir-hilux.mjs    # medidas de la malla
node tools/assets/rocketbox.mjs      # conductor, compañero y animaciones
node tools/assets/manifest.mjs       # copia a src/next/assets/ con hash y verificación
node tools/vendor-three.mjs          # three.js r186 a src/next/vendor/
node tools/build.mjs                 # dist/next/gendarmeria-poc.html

node tools/test-caso.js              # 5.000 casos con las medidas del modelo
node tools/test-assets.js            # archivos, hashes, presupuestos, créditos, nodos de la Hilux, service worker
node tools/test-medidas.js           # la cinta coincide con la malla
node tools/test-conductor.js         # conductas del conductor
node tools/test-dist.js              # el archivo único abre sin red
SRC=src/next node tools/smoke.js /tmp/capturas caso=original 390 844   # recorrido completo
node tools/vista.js salida.png "caso=original" '{"x":-2.6,"z":6.5}'      # capturas sueltas para ajustar
```

Las descargas se verifican (md5 de Poly Haven, sha1 de git en GitHub) y cada copia se relee.

## Disco dañado

El disco USB de `/mnt/rpi` tiene corrupción del sistema de archivos (errores ext4 en `dmesg`). Un archivo ya verificado apareció dañado después. Por eso:

- `src/next` es un enlace a `~/gpoc-sd/next`, en la tarjeta SD.
- `tools/node_modules` y `tools/.cache` también están en la SD.
- La copia dañada quedó en `.next-danado-no-usar/`. No se borró porque borrar en ese disco provocó más errores.

**Hay que hacer un respaldo y correr `fsck` en ese disco.**

## Pendiente

- Validación del procedimiento y de las medidas con instructores. La de afuera ahora es en el portón.
- La licencia de la Hilux es dudosa (ver `CREDITOS.md`): reemplazarla por un modelo comprado antes de mostrarla fuera de Humand.
- Medir el rendimiento en celulares reales con `?debug`. En la Pi, con WebGL por software, no se puede.
- Pasar `src/next` a `src/` cuando se apruebe. Al hacerlo:
  - `build.mjs` reemplaza a `build.py`;
  - se actualizan `README.md` y `docs/arquitectura.md`;
  - se regeneran las capturas de `docs/capturas/`.
