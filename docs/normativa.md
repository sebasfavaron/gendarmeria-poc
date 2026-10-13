# Qué reemplazar cuando llegue la normativa real

> **13/10/2026:** llegó el primer lote de normativa oficial: CPPF, CPPN, el Protocolo General de Actuación para requisas y fallos. Las reglas, sus fuentes y cómo se aplican están en [normativa/reglas.md](normativa/reglas.md). Las decisiones de `src/next/escenario.js` se ajustaron con el parche de [normativa/cambios/](normativa/cambios/), ya aplicado. La tabla de abajo sigue vigente para lo que las fuentes no cubren.

El prototipo está armado para que el procedimiento y los criterios se puedan corregir sin tocar el motor 3D. Esta lista dice, para cada supuesto, dónde vive y qué hay que revisar con la documentación oficial y los instructores.

Regla general: **todo lo que es texto, calificación o probabilidad está en `src/escenario.js` o `src/caso.js`**. `src/main.js` solo tiene que cambiar si aparece un indicio nuevo que haya que dibujar o una acción nueva (por ejemplo, abrir el capó).

Después de cualquier cambio: `node tools/test-caso.js` (verifica que los casos sigan siendo coherentes) y `python3 tools/build.py` (regenera `dist/`).

## 1. Procedimiento y decisiones

| Supuesto actual | Dónde | Qué confirmar |
|---|---|---|
| Ante indicios, lo correcto es: área de revisión, jefe de puesto, consulta de dominio y chasis, can detector, testigos y fiscalía federal antes de la requisa. | `escenario.js` → `decisiones[id='derivar'].t` | Orden real de los pasos, quién da intervención a quién, si la fiscalía es siempre federal en ruta nacional, si el can es parte habitual. |
| Sin indicios, lo correcto es consultar el dominio por radio y dejarlo seguir. | `decisiones[id='consultar']`, `v.limpio` | Qué incluye el control de rutina. Si falta un paso, conviene agregar una opción nueva en vez de cambiar esta. |
| Dejarlo seguir sin consultar es "Parcial" en un caso limpio. | `decisiones[id='dejar'].v.limpio` | Si la consulta es obligatoria y la omisión es un error. |
| Derivar a requisa sin indicios es "Parcial" ("Demora sin indicios"). | `decisiones[id='derivar'].v.limpio` | Cómo se evalúa una demora sin causa. |
| Levantar el piso solo, sin testigos, es siempre "Incorrecta". | `decisiones[id='forzar']` | Texto de la consecuencia legal. |
| Cuatro opciones de decisión. | `decisiones` | Si falta alguna. Para agregar una: un objeto más con `t`, `v`, `end`, `fb` y, si no es la correcta, `titulo`. |

Cada decisión tiene `v`, `end`, `fb` y `titulo` por perfil (`limpio`, `oculto`, `doblada`, `completo`), con `otro` como valor por defecto.

## 2. Indicios y lo que se ve

| Supuesto actual | Dónde | Qué confirmar |
|---|---|---|
| Patente doblada se detecta comparando grabado de cristales y chapa del chasis contra la cédula. | `pois` `etch` y `vin`; textos en `estados` | Dónde se verifica el número de chasis en la práctica (chapa en el parabrisas, parante de la puerta, grabado en el chasis) y si se verifica el número de motor. |
| Grabado raspado como indicio. | `pois[etch].estados.raspado` | Si es un indicio reconocido. |
| Patente con marca limpia y tornillos nuevos como indicio. | `pois[plate].estados.cambiada` | Ídem. |
| Suspensión trasera baja con la caja vacía (3 a 4 cm contra 10 adelante). | `pois[rwheel]`; medidas en `caso.js` (`gapF`, `gapR`) | Si las medidas son verosímiles para una Hilux y cómo se enseña a verlo (dedos, mano, ballesta). |
| Doble fondo: piso 10 a 14 cm más alto (13 a 17 cm de diferencia entre la medida interior y la exterior), sonido hueco y pasarruedas casi tapados. | `pois[bed]`; `caso.js` (`dobleFondo`) | Medidas típicas, si se enseña a medir y a golpear, otras señales (olor a pegamento, masilla, pintura). |
| Soldadura brillante o pintura fresca sobre el larguero. | `pois[under]` | Dónde suelen estar las modificaciones y cómo se ven. |
| Ticket de Salvador Mazza contra el relato. | `pois[ticket]`; lugares y horas en `caso.js` (`tickets`) | Si el relato y los horarios son creíbles para el puesto. |
| Conducta nerviosa (espejo, dedos, titubeos) como señal secundaria. | `caso.js` (`conducta`); `escenario.js` (`notaConducta`, `preguntas[].nervioso`) | Cómo se enseña a leer la conducta y cuánto peso tiene. |

Para **sacar** un indicio: dejar un solo estado (el normal) en `estados` y ajustar `caso.js` para que no elija los otros. Para **agregar** uno que se dibuje distinto según el caso, ver "Agregar un punto con estados" en [arquitectura.md](arquitectura.md).

## 3. Terminología y diálogo

| Qué | Dónde |
|---|---|
| Saludo inicial | `charla.apertura` |
| Preguntas y respuestas del conductor | `preguntas` (con `dep` cuando la respuesta depende del caso y `nervioso` para la versión con titubeos) |
| Nombres de los puntos ("Grabado del parabrisas", "Número de chasis"...) | `pois[].label` |
| Textos de la devolución | `pois[].estados[].why`, `notas`, `notaConducta` |
| Textos de inicio y botones | `src/index.html` |
| Documentos (DNI, licencia, cédula) | `documentos` y `base` |

Si la normativa usa otro término (por ejemplo "dominio" en vez de "patente"), conviene cambiarlo en todos los lugares a la vez y buscar con `grep -ri patente src/`.

## 4. Puntaje

| Supuesto actual | Dónde |
|---|---|
| "Procedimiento correcto" con el 60 % de los indicios detectados. | `escenario.js` → `umbral` |
| Los falsos positivos no restan; solo cambian el título en los casos limpios. | `main.js` → `finish` |
| Proporción de perfiles: 30 % limpio, 25 % oculto, 20 % doblada, 25 % completo. | `escenario.js` → `perfiles[].peso` |
| Probabilidad de cada estado dentro de un perfil. | `caso.js` → `generarCaso` |

## 5. Escenario

| Supuesto actual | Dónde |
|---|---|
| Ruta 34, norte de Salta, 19:50, después de la puesta del sol. | `index.html` (texto) y `main.js` (cielo y luces) |
| Un gendarme solo con un compañero en la garita. | `main.js` (escena) |
| El conductor deja el motor en marcha. | `main.js` (sonido) |

Si el procedimiento real pide, por ejemplo, que el conductor apague el motor o baje del vehículo, eso es una acción nueva y requiere cambios en `main.js`.
