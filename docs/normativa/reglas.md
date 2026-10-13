# Reglas oficiales y su aplicación al simulador

Fuentes: ver [README.md](README.md). Abreviaturas:

- **CPPF**: Código Procesal Penal Federal (Ley 27.063).
- **CPPN**: Código Procesal Penal de la Nación (Ley 23.984), el código anterior.
- **PGA**: Protocolo General de Actuación para Allanamientos y Requisas Personales (t.o. 2017).

**Qué código rige en el escenario.** El escenario es la Ruta 34, en el norte de Salta. Hasta donde sé, el CPPF rige en la jurisdicción federal de Salta y Jujuy desde junio de 2019, así que lo cito primero y pongo el CPPN como referencia. **Hay que confirmarlo con los instructores.** En la práctica las dos versiones exigen lo mismo, con dos diferencias:

- La edad mínima de los testigos de actuación (ver R7).
- A quién se comunica la requisa: al fiscal (MPF) en el CPPF y al juez en el CPPN.

Estado de cada regla en la simulación:

- **Aplicada**: ya está en `src/next/escenario.js`.
- **Pendiente**: necesita contenido o una acción nueva.
- **Fuera de alcance**: no corresponde a esta escena.

## A. Cuándo se puede revisar un vehículo

| # | Regla | Fuente | En la simulación |
|---|---|---|---|
| R1 | En un operativo público de prevención se puede pedir la identificación y la documentación, e **inspeccionar** el vehículo. Eso no es una requisa. | CPPN art. 230 bis, último párrafo; jurisprudencia citada en el PGA 6.4 | **Aplicada**: el control de rutina (documentos, mirar por fuera, medir, linterna) no se penaliza. |
| R2 | La **requisa sin orden judicial** exige que se cumplan todas estas condiciones: (a) circunstancias previas u objetivas que permitan presumir que se ocultan cosas relacionadas con un delito, respecto de ese vehículo; (b) no poder esperar la orden, porque hay peligro de que desaparezcan las pruebas; (c) estar en la vía pública o en un lugar de acceso público. | CPPF art. 138; CPPN art. 230 bis; PGA 6.4 A–B | **Aplicada**: "derivar" solo es correcto con indicios. |
| R3 | La sospecha tiene que existir **antes** de la requisa. Un hallazgo no vuelve válida una requisa que empezó mal. Las corazonadas y las presunciones generales no alcanzan: hacen falta indicios concretos. | PGA 6.4 ("Ayunes", "Álvarez"); fallo de la Sala I de la CFCP (oct. 2022) | **Aplicada**: textos de "derivar" y "forzar". La conducta nerviosa sola ya se trataba como insuficiente (`notaConducta.nerviosoLimpio`). |
| R4 | Que falte la documentación del vehículo (sin papeles, o sin cédula verde) cuenta como circunstancia objetiva que justifica revisar. | Fallos "V., H. J." (CNCCorr. Sala IV, 2016) y Sala III de la CFCP (2023) | **Pendiente**: hoy la documentación siempre está completa. Propuesta: un estado nuevo del punto "documentación" en el que el conductor no tiene la cédula. |
| R5 | El consentimiento del conductor ("revise nomás") **no reemplaza** los requisitos. Ante la fuerza pública ese consentimiento puede no ser libre. | PGA 6.4 (fallo "Dora") | **Aplicada**: nueva decisión "Le pregunto si me deja revisar". |
| R6 | Si la persona se niega, eso no impide la requisa, salvo que haya causas justificadas. El PGA pide solicitar enseguida la autorización judicial, salvo que la urgencia permita hacerla sin orden. Resistirse puede ser el delito del art. 239 del Código Penal. | CPPF art. 137; PGA 6.4 | **Pendiente**: el conductor nunca se niega. |

## B. Cómo se hace la requisa

| # | Regla | Fuente | En la simulación |
|---|---|---|---|
| R7 | Hacen falta **dos testigos de actuación** que no pertenezcan a la fuerza ni a ninguno de los órganos que intervienen. El PGA agrega que no tengan relación con el imputado. La edad mínima es de 16 años en el CPPF y de 18 en el CPPN y el PGA. Si es imposible conseguirlos o hay suma urgencia, se puede prescindir de ellos, pero hay que acreditarlo en el acta. Se validó una requisa sin testigos que dirigía y autorizaba el fiscal. | CPPF arts. 110 y 137; CPPN arts. 138 y 141; PGA 4.8.1 H y 6.3.1 F; fallo "P., Silvia Margarita" (CFCP, 2020) | **Aplicada** en el texto de "derivar". **Pendiente**: elegir los testigos dentro del juego, por ejemplo descartar a otro gendarme o a alguien que viaja con el conductor. |
| R8 | Antes de requisar se le explica a la persona **qué se sospecha y qué se busca**, y se la invita a mostrarlo. | CPPF art. 137; PGA 6.3.1 A–B | **Aplicada** en el texto de "derivar". |
| R9 | Las requisas de personas se hacen por separado, con perspectiva de género y respetando el pudor y la dignidad. A una mujer la requisa otra mujer. La requisa personal sin orden es solo un palpado sobre la ropa, de la cabeza a las piernas. | CPPF art. 137; PGA 6.1, 6.2 C–D y 6.4 C | **Fuera de alcance** por ahora: la escena no tiene requisa personal. |
| R10 | Se labra un **acta** con lugar, fecha y hora; quiénes intervinieron; los motivos; lo que se hizo y su resultado; quién hizo el hallazgo; si las declaraciones fueron espontáneas o a requerimiento; y las firmas, previa lectura, con la causa si alguien no firma. Las enmiendas se salvan. Sin fecha o sin firmas, el acta es nula. | CPPF arts. 110 y 138; CPPN arts. 139 y 140; PGA 5 y 6.6 | **Aplicada** en el texto. **Pendiente**: armar el acta como paso del juego (por ejemplo, elegir qué motivos constan). Encaja bien con la libreta. |
| R11 | La requisa se **comunica de inmediato** al fiscal (CPPF) o al juez (CPPN). Si da positivo, también se informa de inmediato. | CPPF art. 138; CPPN art. 230 bis; PGA 6.5 | **Aplicada**: "doy aviso a la fiscalía federal". |
| R12 | Se deja constancia del estado de las cosas con fotos o video, se secuestra lo hallado y se cuida la cadena de custodia. | CPPF art. 96 e–f; PGA 5 L y 7 | **Pendiente**: la escena termina en la decisión. Podría sumarse un paso de "documentar" (fotos de la caja y del VIN). |

## C. Trato al conductor

| # | Regla | Fuente | En la simulación |
|---|---|---|---|
| R13 | **Presunción de inocencia**: nadie puede ser tratado como culpable sin una sentencia. | CPPF art. 3 | **Aplicada**: la devolución de "forzar" ("sé que llevás algo") lo menciona. |
| R14 | **No autoincriminación**. Las fuerzas no pueden tomarle declaración al imputado. Solo pueden preguntarle para constatar su identidad, después de leerle sus derechos. Lo que diga en el lugar sirve para orientar la investigación, pero no se documenta ni vale como prueba. | CPPF art. 4; CPPN art. 184 incs. 9 y 10 | **Pendiente de validar**: las preguntas de la charla (de dónde viene, qué lleva, arreglos) son preguntas de control, antes de que haya sospecha. Hay que confirmar con instructores hasta dónde se puede preguntar cuando ya hay indicios. |
| R15 | La fuerza pública se usa solo en la medida de lo necesario. La intervención tiene que ser proporcional y respetar la dignidad. | CPPN art. 184 inc. 11; PGA 6.1 | Sin cambios: la escena no tiene uso de la fuerza. |

## Decisiones que quedan para el usuario o los instructores

1. **Derivar a requisa en un caso limpio** sigue siendo "Parcial". Según R3 y el fallo de 2022, una requisa sin indicios objetivos es nula, así que podría pasar a "Incorrecta". No lo cambié porque el jugador pudo haber creído ver indicios (falsos positivos) y la calificación es una decisión pedagógica.
2. **Qué código rige** en la jurisdicción del escenario (CPPF o CPPN), y si conviene que la devolución cite artículos o solo explique la regla. Hoy explica la regla sin citar artículos.
3. **El can detector** sigue en la opción correcta. Ninguna de las fuentes lo trata para controles en ruta.
