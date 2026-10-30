/*
 * Contenido del escenario "Puesto de control en ruta" (Gendarmería Nacional).
 * Todo lo que es texto, datos o reglas del caso vive acá; main.js solo lo interpreta
 * y caso.js decide, en cada partida, en qué estado está cada punto.
 *
 * Coordenadas en metros. La camioneta está en el origen mirando hacia -z:
 * el lado del conductor es -x, el acompañante +x y la caja de carga hacia +z.
 *
 * En los textos, {clave} se reemplaza con los datos del caso (ver caso.js, `datos`).
 * Contenido ilustrativo: validar con instructores de Gendarmería y la normativa vigente.
 */
window.ESCENARIO = {
  base: {
    conductor: { nombre: 'Núñez, Javier Omar', dni: '28.903.114', nacimiento: '14/03/1981', domicilio: 'Gral. Mosconi 455, Tartagal, Salta' },
    vehiculo: { marca: 'Toyota', modelo: 'Hilux 2.8 SRV 4x4 D/C', color: 'Blanco', anio: '2021' },
    // Lo que dicen la patente y la cédula. Coherentes con un modelo 2021: el carácter 10 del chasis
    // (el año) es "M" y el dominio es de la serie AE (2020 y 2021). Validar con instructores.
    dominio: 'AE 219 LM', chasis: '8AJBA3CD5M1523467', motor: '1GD-0729183',
    // El vehículo real cuando la patente está doblada (tiene pedido de secuestro)
    real: { dominio: 'AF 731 RS', chasis: '8AJBA3CD9N1840215' }
  },

  /*
   * Perfiles posibles del caso. caso.js elige uno al azar en cada partida.
   * Un perfil define qué pasa realmente; qué indicios quedan a la vista se sortea aparte.
   */
  perfiles: {
    limpio:   { nombre: 'Sin irregularidades', peso: 30 },
    oculto:   { nombre: 'Compartimiento oculto bajo la caja', peso: 25 },
    doblada:  { nombre: 'Patente doblada', peso: 20 },
    completo: { nombre: 'Compartimiento oculto y patente doblada', peso: 25 }
  },

  charla: {
    apertura: [
      ['Vos', 'Buenas tardes. Gendarmería Nacional, control de ruta.'],
      ['Conductor', 'Buenas tardes, jefe.']
    ]
  },

  // Tarjetas que se muestran al pedir la documentación (tipo: dni | lic | ced)
  documentos: [
    { tipo: 'dni', titulo: 'Documento Nacional de Identidad',
      campos: [['Apellido y nombre', 'Núñez, Javier Omar'], ['Número', '28.903.114'], ['Nacimiento', '14/03/1981'], ['Domicilio', 'Gral. Mosconi 455, Tartagal']] },
    { tipo: 'lic', titulo: 'Licencia de conducir',
      campos: [['Titular', 'Núñez, Javier Omar'], ['Clase', 'B1'], ['Vencimiento', '02/09/2029']] },
    { tipo: 'ced', titulo: 'Cédula del automotor',
      campos: [['Titular', 'Núñez, Javier Omar'], ['Dominio', '{dominio}'], ['Vehículo', 'Toyota Hilux 2.8 SRV, blanca, 2021'], ['Chasis', '{chasis}'], ['Motor', '{motor}']] }
  ],

  /*
   * Puntos de interés: el contenido. Dónde está cada uno, desde dónde se revisa y cómo se encuadra
   * depende de la camioneta y está en vehiculo.js (se juntan por id).
   *  talk    true para el conductor (abre la charla en vez de la inspección)
   *  visual  'plate' | 'etch' | 'vin' | 'ticket' para mostrar una imagen legible en la tarjeta
   *  oscuro  true si sin linterna no se distingue nada
   *  acciones  qué se puede hacer de cerca (medir, golpear...). Las medidas salen del modelo 3D,
   *            así que siempre coinciden con lo que se ve.
   *  estados cada estado posible en este punto: irr (si es irregular), text (lo que ve el usuario,
   *          neutral) y why (explicación en la devolución). caso.js elige el estado.
   */
  pois: [
    { id: 'driver', label: 'Conductor', talk: true },

    { id: 'ticket', label: 'Tablero', visual: 'ticket',
      text: 'Sobre el tablero hay un ticket de una estación de servicio.',
      estados: {
        coherente:  { irr: false, why: 'El ticket es de {ticketLugar}, de hoy a las {ticketHora}, poco antes de la hora en que dijo que salió. Coincide con su relato.' },
        contradice: { irr: true,  why: 'Es de {ticketLugar}, de hoy a las {ticketHora}. El conductor dijo que salió de Tartagal a las seis y vino directo: hoy estuvo sobre la frontera y no lo dijo.' },
        viejo:      { irr: false, why: 'Es de {ticketLugar}, pero del {ticketFecha}. No contradice lo que contó sobre el viaje de hoy.' }
      } },

    { id: 'etch', label: 'Grabado del parabrisas', visual: 'etch',
      text: 'En el ángulo inferior del parabrisas, del lado del acompañante, está grabado el dominio.',
      estados: {
        coincide: { irr: false, why: 'El grabado coincide con la patente y con la cédula.' },
        distinto: { irr: true,  why: 'El grabado dice {real}, pero la patente y la cédula dicen {dominio}. Es un indicio de patente doblada.' },
        raspado:  { irr: true,  text: 'En el ángulo inferior del parabrisas, del lado del acompañante, hay una zona rayada y opaca donde debería estar el grabado del dominio.',
                    why: 'Alguien raspó el grabado para que no se lea. Borrarlo es un indicio de que el vehículo no es el que dicen la patente y los papeles.' }
      } },

    { id: 'vin', label: 'Número de chasis', visual: 'vin',
      text: 'Detrás del parabrisas, del lado del conductor, se ve la chapa con el número de chasis.',
      estados: {
        coincide: { irr: false, why: 'El número de chasis coincide con el de la cédula.' },
        distinto: { irr: true,  why: 'La chapa dice {chasisReal} y la cédula, {chasis}: la cédula y la patente son de otro vehículo.' }
      } },

    { id: 'fwheel', label: 'Rueda delantera',
      acciones: [{ id: 'luzDel', label: 'Medir la luz' }],
      text: 'Rueda delantera izquierda. La cubierta tiene un desgaste parejo.',
      estados: {
        normal: { irr: false, why: 'Es la referencia: {gapF} cm de luz entre el guardabarros y la cubierta. Sirve para comparar con la de atrás.' }
      } },

    { id: 'rwheel', label: 'Rueda trasera',
      acciones: [{ id: 'luzTras', label: 'Medir la luz' }, { id: 'ballesta', label: 'Mirar la ballesta' }],
      text: 'Rueda trasera izquierda. La cubierta tiene un desgaste parejo.',
      estados: {
        normal:       { irr: false, why: 'Atrás había {gapR} cm de luz y adelante {gapF}: la suspensión no estaba cargada.' },
        baja:         { irr: true,  why: 'Con la caja vacía, atrás había {gapR} cm de luz contra {gapF} adelante, y la ballesta estaba casi plana. Hay peso que no se ve.' },
        bajaConCarga: { irr: false, why: 'La suspensión estaba baja ({gapR} cm), pero la caja llevaba bolsas de cemento a la vista: el peso estaba explicado.' }
      } },

    { id: 'bed', label: 'Caja de carga',
      acciones: [{ id: 'interior', label: 'Medir por dentro' }, { id: 'exterior', label: 'Medir por fuera' },
                 { id: 'golpear', label: 'Golpear el piso' }, { id: 'piso', label: 'Mirar el piso de cerca' }],
      estados: {
        vacia:      { irr: false, text: 'La caja de carga está vacía.',
                      why: 'Por dentro medía {int} cm y por fuera {ext}: la diferencia es el espesor del piso. El piso sonaba macizo.' },
        conCarga:   { irr: false, text: 'La caja lleva ocho bolsas de cemento de 50 kg.',
                      why: 'La carga estaba a la vista y coincidía con lo que dijo el conductor. Las medidas por dentro y por fuera coincidían.' },
        dobleFondo: { irr: true,  text: 'La caja de carga está vacía.',
                      why: 'Por dentro medía {int} cm y por fuera {ext}: faltaban unos {diff} cm. Además, el piso sonaba hueco y los pasaruedas casi no sobresalían. Indica un doble fondo.' }
      } },

    { id: 'under', label: 'Debajo de la caja', oscuro: true,
      textoOscuro: 'Está oscuro debajo de la camioneta. Sin linterna no se distinguen detalles.',
      estados: {
        normal:      { irr: false, text: 'Se ven los largueros, el escape y la rueda de auxilio, todo cubierto por una capa pareja de tierra.',
                       why: 'El chasis no mostraba modificaciones.' },
        escapeNuevo: { irr: false, text: 'Los largueros y la rueda de auxilio están cubiertos de tierra. El silenciador del escape y sus abrazaderas se ven nuevos, sin óxido.',
                       why: 'Un escape nuevo es un arreglo común. Si le preguntabas por arreglos, te decía que lo cambió la semana pasada.' },
        soldadura:   { irr: true,  text: 'Sobre el larguero izquierdo, detrás del eje, hay un cordón de soldadura brillante, sin tierra ni pintura. El resto del chasis está cubierto de tierra.',
                       why: 'Una soldadura reciente en un chasis sucio indica una modificación estructural nueva.' },
        pintura:     { irr: true,  text: 'Un tramo del larguero izquierdo, detrás del eje, tiene pintura negra brillante y sin tierra. El resto del chasis está cubierto por una capa pareja de tierra.',
                       why: 'Pintura fresca en un tramo del chasis puede tapar una soldadura o un corte recientes.' }
      } },

    { id: 'plate', label: 'Patente trasera', visual: 'plate',
      estados: {
        normal:   { irr: false, text: 'Patente Mercosur, algo sucia de tierra, como el resto del paragolpes.',
                    why: 'La patente en sí no muestra nada raro. Para saber si es la del vehículo hay que compararla con el grabado y el número de chasis.' },
        cambiada: { irr: true,  text: 'Patente Mercosur. Alrededor se ve un rectángulo más limpio que el resto del paragolpes y los tornillos son nuevos.',
                    why: 'La marca limpia alrededor de la patente y los tornillos nuevos indican que la cambiaron hace poco.' }
      } },

    { id: 'rseat', label: 'Asiento trasero',
      estados: {
        sillita:      { irr: false, text: 'Una sillita de bebé y un bolso deportivo abierto, con ropa.', why: 'Es normal. Nada fuera de lo común.' },
        herramientas: { irr: false, text: 'Una caja de herramientas, una campera y un par de botines de trabajo.', why: 'Es normal. Nada fuera de lo común.' },
        bolsos:       { irr: false, text: 'Dos bolsos con ropa y una bolsa de supermercado con galletitas y una gaseosa.', why: 'Es normal. Nada fuera de lo común.' }
      } },

    { id: 'mate', label: 'Asiento del acompañante',
      estados: {
        mate:  { irr: false, text: 'Un termo, un mate y un paquete de yerba por la mitad.', why: 'Es normal. Nada fuera de lo común.' },
        gorra: { irr: false, text: 'Una conservadora chica, una gorra y un celular enchufado al cargador.', why: 'Es normal. Nada fuera de lo común.' }
      } }
  ],

  /*
   * Preguntas al conductor. `a` es la respuesta; si depende del caso, `dep` dice de qué punto
   * y `a` es un objeto por estado. `nervioso` reemplaza la respuesta cuando el conductor está nervioso.
   */
  preguntas: [
    { id: 'route', q: '¿De dónde viene y adónde va?', a: 'Salí de Tartagal a las seis y voy para Tucumán, por trabajo. Vine directo, sin parar.' },
    { id: 'owner', q: '¿La camioneta es suya?', a: 'Sí, es mía. La compré el año pasado.' },
    { id: 'cargo', q: '¿Qué lleva?', dep: 'bed',
      a: { vacia: 'Nada, la caja va vacía. Voy a buscar una carga a Tucumán.',
           conCarga: 'Cemento, para una obra de mi cuñado en Metán. Tengo la factura en la guantera, si quiere.',
           dobleFondo: 'Nada, la caja va vacía. Voy a buscar una carga a Tucumán.' },
      nervioso: { vacia: 'Eh... nada. Va vacía, ¿vio? Voy a buscar una carga a Tucumán.', dobleFondo: 'Eh... nada. Va vacía, ¿vio? Voy a buscar una carga a Tucumán.' } },
    { id: 'service', q: '¿Le hizo algún arreglo a la camioneta últimamente?', dep: 'under',
      a: { normal: 'El service, hace dos meses. Nada más.',
           escapeNuevo: 'La semana pasada le cambié el escape en Tartagal, que estaba roto.',
           soldadura: 'No, nada. Está como la compré.',
           pintura: 'No, nada. Está como la compré.' },
      nervioso: { soldadura: 'No... no, nada. Está como la compré.', pintura: 'No... no, nada. Está como la compré.' } },
    { id: 'docs', q: 'Documentación, por favor.', a: 'Sí, acá tiene.', docs: true }
  ],

  /*
   * Decisiones finales. `v` es la calificación según el perfil del caso (best | partial | wrong).
   * `end` es lo que pasó después y `fb` la explicación; ambos pueden ser texto o un objeto por perfil
   * con `otro` como valor por defecto. `titulo` se usa cuando la calificación no es best.
   * key: 'force' marca la opción de actuar sin testigos.
   */
  decisiones: [
    { id: 'derivar',
      // Requisa sin orden judicial: indicios objetivos previos, dos testigos ajenos a la fuerza, aviso de la
      // sospecha al conductor, acta y comunicación inmediata a la fiscalía (CPPF arts. 137-138, PGA 6.4).
      t: 'Le pido que estacione en el área de revisión, informo al jefe de puesto, consulto el dominio y el número de chasis, y pido un can detector. Con dos testigos ajenos a la fuerza, le explico qué sospecho y lo invito a mostrarlo antes de la requisa. Labro el acta y doy aviso a la fiscalía federal.',
      v: { limpio: 'partial', otro: 'best' },
      titulo: { limpio: 'Demora sin indicios' },
      end: {
        limpio: 'La consulta no tuvo novedades, el can no marcó nada y la requisa con testigos no encontró nada. El conductor estuvo demorado más de una hora.',
        oculto: 'Con el can detector y testigos, la requisa encontró un compartimiento oculto bajo el piso de la caja, con carga sin declarar. El dominio y el chasis coincidían: la camioneta era la de los papeles.',
        doblada: 'El número de chasis correspondía al dominio {real}, una camioneta con pedido de secuestro: tenía la patente doblada. El can no marcó nada en la caja.',
        completo: 'Con el can detector y testigos, la requisa encontró un compartimiento oculto bajo el piso de la caja, con carga sin declarar. El número de chasis correspondía al dominio {real}, una camioneta con pedido de secuestro: tenía la patente doblada.' },
      fb: {
        limpio: 'Sin indicios concretos, derivar a una requisa demora a una persona sin motivo. Una requisa sin orden judicial solo es válida si antes hay circunstancias objetivas que la justifiquen; el nerviosismo o una corazonada no alcanzan, y la justicia anula las requisas hechas sin sospecha previa.',
        otro: 'Ante indicios concretos, derivaste a revisión y verificaste la identidad del vehículo. Para la requisa sin orden judicial, los indicios tienen que estar antes de empezar y quedar escritos en el acta, con dos testigos ajenos a la fuerza y aviso inmediato a la fiscalía.' } },
    { id: 'consultar',
      t: 'Consulto el dominio por radio y, si no tiene novedades, lo dejo seguir.',
      v: { limpio: 'best', otro: 'partial' },
      titulo: { otro: 'La camioneta siguió viaje' },
      end: {
        limpio: 'La consulta no tuvo novedades y la camioneta siguió viaje. No había nada irregular.',
        oculto: 'La consulta del dominio no tuvo novedades: la patente era la de la camioneta. Siguió viaje con la carga oculta.',
        doblada: 'La consulta del dominio {dominio} no tuvo novedades, porque la patente estaba doblada. La camioneta, con pedido de secuestro, siguió viaje.',
        completo: 'La consulta del dominio {dominio} no tuvo novedades, porque la patente estaba doblada. La camioneta siguió viaje con la carga oculta.' },
      fb: {
        limpio: 'Sin indicios, la consulta del dominio y la documentación en regla alcanzan para dejarlo seguir.',
        oculto: 'La consulta sola no alcanza: los papeles pueden estar en regla y la carga, escondida. Los indicios físicos eran circunstancias objetivas que justificaban una requisa sin orden judicial.',
        otro: 'La consulta sola no alcanza: con la patente doblada, el sistema devuelve los datos de otro vehículo. Los indicios justificaban la revisión.' } },
    { id: 'dejar',
      t: 'Lo dejo seguir: la documentación está en regla.',
      v: { limpio: 'partial', otro: 'wrong' },
      titulo: { limpio: 'Control incompleto', otro: 'La camioneta siguió viaje' },
      end: {
        limpio: 'La camioneta siguió viaje. No había nada irregular, pero no se consultó el dominio.',
        oculto: 'La camioneta siguió viaje con un compartimiento oculto.',
        doblada: 'La camioneta siguió viaje con la patente doblada.',
        completo: 'La camioneta siguió viaje con un compartimiento oculto y la patente doblada.' },
      fb: {
        limpio: 'Esta vez no había nada, pero la consulta del dominio es parte del control y lleva un minuto.',
        oculto: 'Que los papeles estén en regla no descarta una carga escondida.',
        otro: 'Que los papeles coincidan con la patente no descarta nada si la patente es falsa.' } },
    { id: 'forzar', key: 'force',
      t: 'Le digo que sé que lleva algo escondido y empiezo a levantar el piso de la caja yo mismo.',
      v: { otro: 'wrong' },
      titulo: { otro: 'Procedimiento en riesgo' },
      end: {
        limpio: 'Levantaste el piso de la caja sin testigos y no había nada. El conductor hizo una denuncia por el procedimiento.',
        doblada: 'Levantaste el piso de la caja sin testigos y no había nada. La patente doblada quedó sin verificar.',
        otro: 'Había un compartimiento oculto, pero lo abriste sin testigos ni intervención de la fiscalía. El procedimiento puede quedar invalidado y el conductor se puso a la defensiva.' },
      fb: 'Sin testigos, sin acta y sin aviso a la fiscalía, lo que encuentres puede no servir como prueba. Decirle que sabés que lleva algo lo trata como culpable: tenés que explicarle qué sospechás y qué buscás, e invitarlo a mostrarlo. Tampoco es seguro actuar solo.' },
    // El consentimiento del conductor no habilita la requisa (PGA 6.4, fallo "Dora").
    { id: 'consentimiento',
      t: 'Le pregunto si me deja revisar la caja. Si me dice que sí, la reviso con mi compañero.',
      v: { otro: 'wrong' },
      titulo: { limpio: 'Revisión sin motivo', otro: 'Procedimiento en riesgo' },
      end: {
        limpio: 'El conductor dijo que sí y revisaron la caja entre los dos. No había nada.',
        doblada: 'El conductor dijo que sí y revisaron la caja entre los dos. No había nada, y la patente doblada quedó sin verificar.',
        otro: 'El conductor dijo que sí y encontraron un compartimiento oculto. Sin testigos ni acta, y con un permiso que no vale como autorización, la defensa puede pedir la nulidad.' },
      fb: {
        limpio: 'Sin indicios no había motivo para revisar, y que el conductor acepte no lo cambia: frente a la fuerza pública, ese permiso puede no ser libre.',
        otro: 'Que el conductor acepte no reemplaza los requisitos de la requisa: frente a la fuerza pública, ese permiso puede no ser libre. Lo que la habilita son los indicios, con dos testigos ajenos a la fuerza, el acta y el aviso a la fiscalía.' } }
  ],

  // Cuántos indicios hay que detectar para un "Procedimiento correcto": una fracción del total del caso.
  umbral: 0.6,

  // Notas de la devolución. main.js decide cuándo corresponde cada una.
  notas: {
    sinRuta: 'No le preguntaste de dónde venía. Sin esa respuesta, el ticket del tablero no tenía contra qué compararse.',
    sinDocs: 'No le pediste la documentación. La cédula era la referencia para comparar el grabado de los cristales y el número de chasis.',
    sinLinterna: 'Miraste debajo de la camioneta sin linterna. A esta hora, sin luz, no se distinguen detalles.',
    sinMedirCaja: 'No mediste la caja por dentro y por fuera. La diferencia entre las dos medidas es lo que delata un doble fondo.',
    sinComparar: 'No comparaste la luz de las dos ruedas. Medir adelante y atrás muestra si hay peso que no se ve.',
    sinService: 'No le preguntaste por arreglos recientes. Su respuesta explicaba o contradecía lo que había debajo de la camioneta.'
  },
  notaConducta: {
    vista: 'También podías notar su conducta: cada vez que te acercaste a la caja, el conductor te siguió por el espejo y giró la cabeza.',
    noVista: 'También podías notar su conducta: cuando alguien se acerca a la caja, el conductor lo sigue por el espejo y gira la cabeza.',
    nerviosoLimpio: 'El conductor estaba nervioso, pero la camioneta no tenía nada. La conducta sola no alcanza: hay que buscar indicios que la confirmen.',
    calmoSospechoso: 'El conductor estuvo tranquilo todo el tiempo. Que alguien esté tranquilo no descarta nada.'
  }
};
