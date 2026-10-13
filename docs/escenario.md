# Guion del escenario: Puesto de control en ruta

> Este documento contiene las respuestas correctas. Si vas a probar el prototipo como usuario, jugalo antes de leerlo.

El contenido vive en `src/escenario.js` (textos, estados, preguntas, decisiones y notas) y las reglas que arman cada partida en `src/caso.js`. Los textos de la pantalla de inicio están en `src/index.html`.

## Situación

- **Lugar:** puesto de control fijo de Gendarmería Nacional, Ruta Nacional 34, norte de Salta.
- **Hora:** 19:50. Ya se puso el sol: la luz principal es el reflector del puesto y debajo de la camioneta no se ve sin linterna.
- **Rol del usuario:** gendarme a cargo del control.
- **Vehículo:** Toyota Hilux blanca, doble cabina, con patente AD 219 LM. El motor queda en marcha.
- **Conductor:** Javier Omar Núñez, domiciliado en Tartagal. Dice que salió de Tartagal a las seis, que va a Tucumán y que vino directo.

## Perfiles

Cada partida tiene un perfil, que es lo que realmente pasa. Se elige al azar con estos pesos (ajustables en `escenario.js`, `perfiles`):

| Perfil | Peso | Qué pasa |
|---|---|---|
| `limpio` | 30 % | No hay nada irregular. |
| `oculto` | 25 % | Hay un compartimiento bajo el piso de la caja con carga sin declarar. La patente es la del vehículo. |
| `doblada` | 20 % | La patente y la cédula son de otro vehículo (AD 219 LM). La camioneta real es AF 731 RS y tiene pedido de secuestro. |
| `completo` | 25 % | Las dos cosas. Es el caso de la primera versión (`?caso=original`). |

Que casi un tercio de los casos no tenga nada es intencional: el ejercicio es distinguir lo sospechoso de lo normal, no encontrar algo siempre.

## Puntos para revisar

Cada punto se activa solo cuando el usuario está cerca, del lado correcto del vehículo y mirándolo. Al revisarlo, la cámara se acerca y aparece una tarjeta con un texto neutral, las acciones posibles y dos botones del mismo peso: **Marcar como irregular** y **No es irregular**.

La columna "Irregular" dice qué estados cuentan como indicio. La probabilidad de cada estado está en `caso.js`.

| Punto | Desde dónde | Estados (en **negrita** los irregulares) | Cómo se percibe |
|---|---|---|---|
| Tablero | Ventanilla del conductor o frente | coherente · **contradice** · viejo | Ticket legible en 3D y en la tarjeta. Coherente: Tartagal, hoy, 17:52. Contradice: Salvador Mazza, hoy, 17:40. Viejo: Salvador Mazza, hace 3 días (inocente). |
| Grabado del parabrisas | Frente | coincide · **distinto** · **raspado** | Grabado en el vidrio, del lado del acompañante. Distinto: AF 731 RS. Raspado: zona rayada e ilegible. |
| Número de chasis | Frente | coincide · **distinto** | Chapa sobre el tablero, visible a través del parabrisas. Hay que compararla con la cédula. |
| Rueda delantera | Lateral izquierdo | normal | Referencia. Medir la luz: 10 a 11 cm. |
| Rueda trasera | Lateral izquierdo | normal · **baja** · bajaConCarga | Luz visible entre pasarruedas y cubierta. Normal: 12 a 14 cm. Baja: 3 a 4 cm. Con carga de cemento a la vista también baja, pero está explicado. Mirar la ballesta: arqueada o casi plana. |
| Caja de carga | Atrás o laterales traseros | vacia · conCarga · **dobleFondo** | Medir por dentro y por fuera, golpear el piso (sonido macizo o hueco), mirar el piso. Con doble fondo el piso está 10 a 14 cm más alto, los pasarruedas casi no sobresalen y a veces hay tornillos nuevos. |
| Debajo de la caja | Atrás o lateral trasero, **agachado** | normal · escapeNuevo · **soldadura** · **pintura** | Sin linterna está oscuro. Con linterna: chasis con tierra pareja; escape nuevo y brillante (inocente); cordón de soldadura brillante sobre el larguero; o un tramo pintado de negro, sin tierra. |
| Patente trasera | Atrás | normal · **cambiada** | Cambiada: rectángulo limpio alrededor de la patente y tornillos nuevos. |
| Asiento trasero | Ventanilla trasera izquierda | sillita · herramientas · bolsos | Siempre normal. Cambia para que no se memorice. |
| Asiento del acompañante | Lateral derecho | mate · gorra | Siempre normal. Obliga a rodear el vehículo. |

### Cómo se combinan

- **oculto:** la caja siempre tiene doble fondo (10 a 14 cm). La rueda trasera queda baja en el 85 % de los casos. Debajo: soldadura 55 %, pintura 30 %, nada visible 15 %. Tornillos nuevos en el piso: 60 %. Ticket que contradice el relato: 60 %.
- **doblada:** el número de chasis nunca coincide con la cédula. El grabado es distinto (75 %) o está raspado (25 %). Patente con marcas de cambio: 50 %. Ticket que contradice el relato: 30 %.
- **Sin compartimiento:** 30 % lleva bolsas de cemento a la vista (y por eso la suspensión baja). 35 % tiene el escape nuevo.
- **limpio:** ticket coherente (70 %) o viejo de Salvador Mazza (30 %).

### Conducta del conductor (no puntúa)

- **Nervioso** (75 % de los casos sospechosos, 15 % de los limpios): cuando el usuario está detrás de la cabina alterna la mirada entre el espejo y la ventanilla trasera, con movimientos rápidos; tamborilea los dedos sobre el volante; parpadea más seguido; durante la charla corre la mirada cada tanto; tarda más en contestar qué lleva y si le hizo arreglos, y contesta con titubeos.
- **Tranquilo:** sigue al usuario con la mirada, alguna vez mira por el espejo, contesta sin demora.

La devolución siempre comenta la conducta y, cuando el conductor estaba nervioso sin motivo, aclara que la conducta sola no alcanza.

## Charla con el conductor

Se abre desde la ventanilla del conductor, con la cámara a la altura de la ventanilla. Al empezar:

- **Vos:** Buenas tardes. Gendarmería Nacional, control de ruta.
- **Conductor:** Buenas tardes, jefe.

| Pregunta | Respuesta |
|---|---|
| ¿De dónde viene y adónde va? | Salí de Tartagal a las seis y voy para Tucumán, por trabajo. Vine directo, sin parar. |
| ¿La camioneta es suya? | Sí, es mía. La compré el año pasado. |
| ¿Qué lleva? | Caja vacía: "Nada, la caja va vacía. Voy a buscar una carga a Tucumán." Con cemento: "Cemento, para una obra de mi cuñado en Metán." Nervioso: con titubeos. |
| ¿Le hizo algún arreglo a la camioneta últimamente? | Escape nuevo: "La semana pasada le cambié el escape en Tartagal." Soldadura o pintura: "No, nada. Está como la compré." (contradice lo que hay abajo). Normal: "El service, hace dos meses." |
| Documentación, por favor. | Muestra DNI, licencia y cédula. |

**Documentación:** DNI 28.903.114 a nombre de Núñez, Javier Omar. Licencia clase B1, vence el 02/09/2029. Cédula a nombre del mismo titular, dominio AD 219 LM, Toyota Hilux 2.8 SRV blanca 2019, chasis 8AJBA3CD5K1523467, motor 1GD-0729183. Con la patente doblada, todo coincide con la patente porque la patente es la falsa; lo que no coincide es la chapa del chasis (8AJBA3CD9N1840215) y el grabado.

## Libreta

Se llena sola con lo que el usuario lee, mide y le responden: el ticket, el grabado, la chapa del chasis, la patente, las medidas, el sonido del piso, la ballesta, lo que vio debajo con linterna, las respuestas del conductor y los datos de la cédula. No anota juicios, solo hechos, para que la comparación la haga el usuario.

## Decisión final

Se elige con el botón **Terminar**. El orden de las opciones se mezcla en cada partida. La calificación depende del perfil:

| Opción | limpio | oculto | doblada | completo |
|---|---|---|---|---|
| Área de revisión, jefe de puesto, consulta de dominio y chasis, can detector, testigos y fiscalía federal antes de la requisa | Parcial ("Demora sin indicios") | **Correcta** | **Correcta** | **Correcta** |
| Consultar el dominio por radio y, si no tiene novedades, dejarlo seguir | **Correcta** | Parcial | Parcial | Parcial |
| Dejarlo seguir porque la documentación está en regla | Parcial ("Control incompleto") | Incorrecta | Incorrecta | Incorrecta |
| Decirle que lleva algo escondido y levantar el piso de la caja sin ayuda | Incorrecta | Incorrecta | Incorrecta | Incorrecta |

Cada combinación tiene su propio final y su explicación en `escenario.js`, `decisiones`.

## Resultado y puntaje

**Indicadores que se muestran:**

- **Indicios detectados:** indicios reales marcados como irregulares, sobre el total del caso. Si el caso no tenía ninguno, dice "No había".
- **Falsos positivos:** puntos normales marcados como irregulares.
- **Tiempo:** desde que empieza la inspección hasta la decisión.
- **Número de caso y perfil**, para repetirlo.

**Título del resultado:**

| Condición | Título |
|---|---|
| Decisión correcta en un caso sospechoso y al menos el 60 % de los indicios detectados | Procedimiento correcto |
| Decisión correcta en un caso sospechoso con menos del 60 % | Decisión correcta, con indicios sin detectar |
| Decisión correcta en un caso limpio, sin falsos positivos | Control correcto |
| Decisión correcta en un caso limpio, con falsos positivos | Decisión correcta, con falsos positivos |
| Cualquier otra | El título de la opción para ese perfil (por ejemplo, "La camioneta siguió viaje" o "Procedimiento en riesgo") |

El umbral del 60 % está en `escenario.js`, `umbral`. Con 5 indicios equivale a 3, como en la primera versión.

**Estado de cada punto en la devolución:**

| Situación | Etiqueta |
|---|---|
| Indicio marcado como irregular | Detectado |
| Indicio marcado como no irregular | Lo descartaste |
| Indicio revisado sin marcar | Lo viste sin marcarlo |
| Indicio no revisado | No lo revisaste |
| Punto normal marcado como irregular | Falso positivo |
| Punto normal revisado y no marcado como irregular | Bien descartado |
| Punto normal no revisado | Sin revisar |

La explicación de cada punto usa los datos de esa camioneta (por ejemplo, "Atrás había 4 cm de luz contra 10 adelante").

**Notas condicionales** (solo cuando aplican al caso):

- No preguntó de dónde venía y el ticket contradecía el relato.
- No pidió la documentación y el grabado o el chasis no coincidían.
- Miró debajo sin linterna y había algo para ver.
- No midió la caja por dentro y por fuera y había doble fondo.
- No comparó la luz de las dos ruedas y la trasera estaba baja.
- No preguntó por arreglos y había algo distinto debajo.
- La conducta del conductor (ver arriba).

## Puntos a validar con instructores

Estas son las partes donde el prototipo hace supuestos. La lista de dónde se cambia cada uno está en [normativa.md](normativa.md).

1. **Procedimiento:** si la secuencia correcta (área de revisión, jefe de puesto, consulta de dominio y chasis, can detector, testigos, fiscalía federal) refleja lo que se enseña y en qué orden.
2. **Caso limpio:** si "consultar el dominio y dejarlo seguir" es la respuesta correcta sin indicios, o si el control de rutina incluye otros pasos (verificar chasis, pedir que abra la caja, apagar el motor).
3. **Requisa:** en qué casos se puede hacer sin orden judicial y qué hace falta para que sea válida.
4. **Terminología:** "patente doblada", "dominio grabado en los cristales", "chapa del chasis", "jefe de puesto", "área de revisión", "can detector" y el saludo inicial.
5. **Indicios:** si son plausibles, si alguno es demasiado obvio o demasiado rebuscado, y cuáles faltan que un gendarme buscaría primero (tanque de combustible, rueda de auxilio, olor, tapizados, guardabarros internos).
6. **Variantes inocentes:** si la carga de cemento, el escape nuevo y el ticket viejo son buenos ejemplos de "parece raro pero no es", y qué otros conviene agregar.
7. **Conducta:** cómo se enseña a leer la conducta y cuánto peso tiene.
8. **Ubicación y relato:** si el recorrido Tartagal, Salvador Mazza, Tucumán y los horarios son creíbles para un puesto de la Ruta 34.
9. **Umbral de aprobación:** si el 60 % de los indicios es una vara razonable, y si los falsos positivos deberían restar.
10. **Proporción de casos limpios:** si el 30 % refleja algo útil para entrenar.
11. **Opciones de decisión:** si falta alguna que un gendarme elegiría en la vida real.
