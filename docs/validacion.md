# Plan de validación

El objetivo es decidir, con poco costo, si vale la pena invertir en una versión más completa. Se propone una ronda corta con gendarmes y una revisión de contenido con instructores.

## Hipótesis

| # | Hipótesis | Se confirma si |
|---|---|---|
| H1 | Se aprende a moverse y revisar sin explicación. | 4 de cada 5 participantes revisan su primer punto en menos de 2 minutos sin ayuda. |
| H2 | La exploración libre discrimina buenos observadores. | Hay dispersión en indicios detectados y en falsos positivos, los participantes con más experiencia detectan más, y en los casos limpios la mayoría no marca nada o casi nada. |
| H3 | Resulta creíble para un gendarme. | La credibilidad promedio es de 4 o más sobre 5 y nadie señala un error grave de procedimiento. |
| H4 | La devolución enseña algo. | La mayoría puede explicar, sin mirar, al menos un indicio que no había detectado. |
| H5 | Funciona en los celulares del público objetivo. | Corre fluido y sin errores en los equipos que usan los participantes. |

## Antes de probar con usuarios

1. **Revisión de contenido con 1 o 2 instructores.** Recorrer el prototipo juntos y repasar la lista "Puntos a validar con instructores" de `escenario.md`. Corregir lo que haga falta antes de la ronda con usuarios.
2. **Chequeo de dispositivos.** Abrir el prototipo en 3 o 4 celulares típicos, incluido uno de gama baja, y anotar si se ve fluido, si el joystick responde bien, si los textos se leen y si el sonido funciona. Probar también `dist/gendarmeria-poc.html` abierto sin conexión.

## Participantes

Entre 5 y 8 gendarmes, idealmente mezclando antigüedad (menos de 2 años, de 2 a 10 años, más de 10) y experiencia en puestos de control. Con 5 participantes ya aparecen la mayoría de los problemas de uso.

## Sesión (20 a 30 minutos por persona)

1. **Contexto (2 min).** Explicar que es un prototipo y que se evalúa el prototipo, no a la persona. No explicar los controles.
2. **Uso libre (10 a 15 min).** La persona juega desde la pantalla de inicio hasta el resultado, pensando en voz alta. Quien modera solo observa y anota; si alguien se traba más de 2 minutos, puede dar una pista mínima y registrarla.
3. **Resultado (3 min).** Pedir que lea la devolución y comente qué le sorprendió.
4. **Entrevista (5 a 8 min).** Ver las preguntas abajo.
5. **Segunda partida opcional (5 min).** Con "Caso nuevo", así es otra camioneta. Muestra si la devolución se tradujo en mejor desempeño (medir, comparar, usar la linterna) y no en memoria de dónde estaban los indicios.

### Qué casos usar

Para que los resultados se puedan comparar entre participantes, conviene que la primera partida de todos sea el mismo caso. Sugerencia: `?caso=original` (sospechoso, con todos los indicios) para la mitad y un caso limpio fijo (por ejemplo `?caso=10088`, sin irregularidades y con el conductor nervioso) para la otra mitad. La segunda partida, con "Caso nuevo".

## Qué registrar

El prototipo **no envía datos** a ningún lado, pero al terminar se puede tocar **Descargar registro de la partida**: baja un JSON con el número de caso, el estado real de cada punto y cada acción con su tiempo (revisar, medir, golpear, linterna, preguntas, marcas, decisión). Conviene descargarlo al final de cada sesión y guardarlo con un código de participante.

| Métrica | De dónde sale |
|---|---|
| Tiempo hasta revisar el primer punto | Registro (primer evento `revisar`) |
| Tiempo total | Pantalla de resultado o registro |
| Indicios detectados y falsos positivos | Pantalla de resultado o registro (evento `decision`) |
| Puntos revisados | Registro (eventos `revisar`) |
| Acciones: medir, golpear, ballesta, piso | Registro (eventos `accion`) |
| Si usó la linterna debajo de la camioneta | Registro (`revisar` con `linterna: true` en `under`) |
| Si abrió la libreta | Registro (evento `libreta`) |
| Preguntas al conductor | Registro (eventos `pregunta`) |
| Si se agachó | Registro (evento `agacharse`) |
| Decisión elegida | Pantalla de resultado o registro |
| Momentos de traba y pistas dadas | Observación |
| Comentarios en voz alta | Notas |

## Preguntas de la entrevista

1. Del 1 al 5, ¿qué tan parecido a un control real te resultó? ¿Qué fue lo menos creíble?
2. ¿Las cosas que había que ver (la luz de las ruedas, la caja, lo de abajo, el grabado) se veían como en la realidad? ¿Alguna era demasiado fácil o demasiado difícil de ver?
3. ¿Hubo algo que hiciste distinto de como lo harías en el puesto?
4. ¿Qué buscarías primero en una camioneta así que acá no estaba?
5. ¿Qué indicio que no viste te parece más importante aprender a detectar?
6. ¿Te resultó claro cómo moverte y revisar? ¿Qué te costó?
7. ¿Lo usarías para practicar? ¿En qué momento: formación inicial, capacitación continua, antes de un operativo?

## Cómo decidir después

- **Seguir:** se confirman H1, H3 y H5, y H2 o H4 muestran señales positivas. Pasar a los próximos pasos del roadmap.
- **Ajustar y repetir:** falla H1 o H5 (problemas de uso o de rendimiento). Corregir y hacer otra ronda corta.
- **Replantear:** falla H3 de forma generalizada, o los instructores marcan problemas de fondo en el procedimiento. Revisar el enfoque del contenido antes de seguir desarrollando.
