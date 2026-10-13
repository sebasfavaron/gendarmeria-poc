# Limitaciones conocidas y próximos pasos

## Hecho en esta versión

- **Indicios que se ven, se miden y se escuchan**, en vez de describirse con texto.
- **Casos variables** con semilla: cuatro perfiles, estados normales e irregulares por punto y variantes inocentes. Ya no alcanza con memorizar dónde mirar.
- **Encuadre de cerca** al revisar, con el panel acomodado para no tapar.
- **Linterna, libreta, acciones físicas** (medir, golpear, mirar la ballesta y el piso).
- **Conductor con conducta** nerviosa o tranquila y respuestas que dependen del caso.
- **Sonido** generado.
- **Registro de eventos** descargable en JSON (primer paso del punto 2 de la versión anterior).
- **dist/ sin internet:** three.js va adentro del archivo.

## Limitaciones conocidas

### Contenido

- **Sin validar.** El procedimiento, la terminología y los indicios son supuestos razonables, pero no fueron revisados por instructores ni contrastados con la normativa. Ver [normativa.md](normativa.md).
- **Un solo vehículo y un solo lugar.** Los casos varían, pero siempre es la misma Hilux en el mismo puesto.
- **Conductor con preguntas fijas.** Cinco preguntas; la respuesta depende del caso y de la conducta, pero no hay conversación libre.
- **Las acciones son las que el prototipo ofrece.** No se puede pedir que apague el motor, que baje, que abra la guantera o el capó.

### Producto

- **El registro no se envía a ningún lado.** Hay que descargarlo a mano desde el resultado.
- **Sin modo instructor.** Hay `?perfil=` y `?debug`, pero no un panel para ver un grupo ni armar casos sin programar.

### Técnicas

- **three.js r128.** Es de 2021, elegida para cargar como script global sin build.
- **Escena fija en el código.** El vehículo y sus variantes están en `main.js`.
- **Sin sombras proyectadas.** La oscuridad bajo la camioneta se simula oscureciendo esos materiales cuando la linterna está apagada.
- **Colisiones simples.** Cajas alineadas a los ejes.
- **Modelos con primitivas.** Se ven esquemáticos de cerca, en especial el conductor.
- **Rendimiento:** unas 310 llamadas de dibujo. No se midió en celulares de gama baja.
- **La navegación 3D no es accesible** con lector de pantalla.

## Próximos pasos sugeridos

Ordenados por el valor que aportan para la decisión de seguir o no.

### 1. Incorporar la normativa y validar con instructores

Seguir [normativa.md](normativa.md) con la documentación oficial y repasar la lista "Puntos a validar con instructores" de [escenario.md](escenario.md). No requiere tocar el motor.

### 2. Probar con usuarios

Seguir [validacion.md](validacion.md). Con los casos variables ya se puede medir discriminación de verdad (aciertos y falsos positivos sobre casos limpios y sospechosos) y comparar una primera con una segunda partida sin que la segunda sea memoria.

### 3. Enviar el registro

Mandar los eventos a un endpoint propio o a un LRS en formato **xAPI**, en vez de descargarlos. Los eventos ya están definidos (ver [arquitectura.md](arquitectura.md)).

### 4. Más acciones del procedimiento

Las que pidan los instructores: pedir que apague el motor o baje, abrir la guantera o el capó, verificar el número de motor, alumbrar el interior, pedir la carta de porte o la factura de la carga.

### 5. Escena como datos y más casos

Pasar a datos también el vehículo y el lugar para armar otros casos: un camión de carga, un colectivo de larga distancia o un control en un paso fronterizo.

### 6. Conductor con IA

Reemplazar las preguntas fijas por conversación libre con un modelo de lenguaje, manteniendo los hechos del caso fijos en el código (`CASE.estados` y `CASE.datos`) para que no se contradiga. Hay que resolver costo por sesión, latencia y voz en español rioplatense.

### 7. Mejorar los modelos

Generar el vehículo, el conductor y el puesto con herramientas de 3D por IA (por ejemplo Meshy, Tripo o Rodin) y revisar las licencias de uso comercial. Si se hace, conservar la regla de que las medidas salgan del modelo.

### 8. Modernizar el stack

Pasar a three.js actual con módulos ES y un empaquetador liviano como Vite. Conviene hacerlo junto con el paso 5. Permite sombras de verdad y fusionar geometría para bajar las llamadas de dibujo.

### 9. Modo instructor e integración

Panel para ver resultados por grupo, editor de casos sin código y exportación a la plataforma de capacitación de la fuerza (SCORM o xAPI).
