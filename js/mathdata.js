// Sala de Matemáticas (Distrito STEAM): content taken from the Inkfinity books
// "Saberes Matemáticos" 2º and 6º de primaria (Salas VR + "Comprueba lo que aprendiste").
// Each level mirrors one Sala VR: Fase 1 = Zona 1, Fase 2 = Transición + Zona 2, Fase 3 = Comprueba.
// Step types: quiz (answer pads) · sort (carry to zones) · build (insert tokens up to a goal) · pick (activate pads).

const P3_INTRO = { text: '**Fase 3: Reto final.** ¡Demuestra todo lo que aprendiste! Responde las preguntas de **Comprueba lo que aprendiste**.', mood: 'surprised', gesture: 'celebrate' };
const HOW_QUIZ = { text: 'Lee la pregunta de la pizarra y párate en la plataforma con la respuesta correcta. Luego presiona **interactuar**.', mood: 'normal', gesture: 'point' };
const COMPRUEBA = 'COMPRUEBA LO QUE APRENDISTE';
const VF = ['Verdadero', 'Falso'];
const MONEY = [
  { v: 100, label: '$100', name: 'tarjeta de $100', color: 0x22c55e },
  { v: 10, label: '$10', name: 'tarjeta de $10', color: 0x3b82f6 },
  { v: 1, label: '$1', name: 'tarjeta de $1', color: 0xffd23f },
];
const BLOCKS = [
  { v: 100, label: '100', name: 'bloque de 100', color: 0x22c55e },
  { v: 10, label: '10', name: 'bloque de 10', color: 0x3b82f6 },
  { v: 1, label: '1', name: 'bloque de 1', color: 0xffd23f },
];
const CELLS = [
  { v: 10, label: 'Celda de 10', name: 'celda de 10', color: 0x35e0ff },
  { v: 1, label: 'Celda de 1', name: 'celda de 1', color: 0xffd23f },
];

export const MATH = {
  hub: [
    { text: '¡Bienvenido a la **Sala de Matemáticas**! Aquí viven los retos de los libros **Saberes Matemáticos**.', mood: 'happy', gesture: 'wave' },
    { text: 'Los portales de la **izquierda** son de **segundo de primaria** y los de la **derecha**, de **sexto de primaria**. ¡Todos están abiertos: elige tu grado!', mood: 'think', gesture: 'point' },
    { text: 'Cada nivel tiene **tres fases**: aprende, practica y un **reto final**. ¡Gana hasta **tres estrellas** en cada uno!', mood: 'happy', gesture: 'celebrate' },
  ],
  hubHint: 'Elige tu grado: los portales de la izquierda son de 2º de primaria y los de la derecha de 6º. ¡Todos están abiertos!',
  soon: { key: 'm5', soon: true, n: 5, tag: 'QUÍMICA', name: 'Próximamente', sub: '1º de preparatoria', emoji: '⚗️', glyph: 'H₂O', color: 0xb57bff },
  levels: [
    // ------------------------------------------------------------ 2º · Contenido 1
    {
      key: 'm1', set: 'math', n: 1, tag: '2º PRIMARIA', name: 'La Juguetería Numérica', sub: 'Valor posicional', emoji: '🧸', glyph: '123',
      color: 0xff8a3d, room: [-120, -120], badge: 'VALOR POSICIONAL',
      phases: [
        {
          intro: [
            { text: '**Segundo de primaria: La Juguetería Numérica.** ¡Bienvenido a la juguetería del futuro! Hoy descubrirás el secreto del **valor posicional**.', mood: 'happy', gesture: 'wave' },
            { text: 'Los robots necesitan ayuda en el **almacén**. Lleva cada paquete de juguetes a su lugar: **unidades**, **decenas** o **centenas**.', mood: 'normal', gesture: 'point' },
            { text: 'Acércate a un paquete y presiona **interactuar** para tomarlo. ¡Tú puedes!', mood: 'happy' },
          ],
          steps: [{
            t: 'sort', who: 'ALMACÉN DE JUGUETES', prompt: 'Agrupa los juguetes: sueltos, en cajas de 10 o en contenedores de 100.', teach: true,
            hint: 'Un juguete suelto es una unidad, una caja de diez es una decena y un contenedor de cien es una centena.',
            zones: [
              { key: 'u', label: 'UNIDADES', color: 0xffd23f },
              { key: 'd', label: 'DECENAS', color: 0x3b82f6 },
              { key: 'c', label: 'CENTENAS', color: 0x22c55e },
            ],
            items: [
              { label: '1 juguete suelto', emoji: '🧸', z: 'u', ok: '¡Bien! Un juguete suelto es una **unidad**.' },
              { label: 'Caja con 10 juguetes', emoji: '📦', z: 'd', ok: '¡Exacto! **Diez unidades** forman una **decena**: por eso los guardamos en cajas de diez.' },
              { label: 'Contenedor con 100 juguetes', emoji: '🚚', z: 'c', ok: '¡Muy bien! **Diez decenas** forman una **centena**: un contenedor de cien juguetes.' },
            ],
            no: 'Mmm, ese paquete va en otro lugar. Cuenta cuántos juguetes tiene.',
          }],
        },
        {
          ctime: 120,
          intro: [{ text: '**Fase 2: Practica.** El **Robot Guardián Cero** cuida la puerta de la tienda. ¡Responde su pregunta para entrar!', mood: 'happy', gesture: 'point' }],
          steps: [
            {
              t: 'quiz', who: 'ROBOT GUARDIÁN CERO', teach: true,
              qs: [{ q: '¿Cuántas decenas forman una centena?', o: ['1', '10', '100'], a: 1, ok: '¡Correcto! **Diez decenas** forman una centena. ¡La puerta se abre!', no: 'Recuerda: una centena son cien juguetes. ¿Cuántas cajas de diez necesitas?' }],
            },
            {
              t: 'build', who: 'CAJA REGISTRADORA DEL FUTURO', money: true, tok: MONEY,
              intro: [{ text: '¡Entraste a la tienda! Ahora cobra cada juguete en la **Caja Registradora del Futuro** con tarjetas de **cien**, **diez** y **un peso**.', mood: 'happy', gesture: 'point' }],
              hint: 'Párate en una plataforma y presiona interactuar para insertar esa tarjeta. Llega justo al precio.',
              targets: [
                { goal: 243, prompt: 'Un niño compra un robot de $243. ¡Cóbralo con tarjetas!', ok: '¡Cobrado! 243 son 2 centenas, 4 decenas y 3 unidades.' },
                { goal: 315, prompt: 'Una niña compra una patineta de $315.', ok: '¡Perfecto! 315 son 3 centenas, 1 decena y 5 unidades.' },
                { goal: 108, prompt: 'Un cliente compra un rompecabezas de $108. ¡Ojo con el cero!', ok: '¡Muy bien! En 108 el cero nos dice que no hay decenas.' },
              ],
            },
          ],
        },
        {
          ctime: 100,
          intro: [P3_INTRO, HOW_QUIZ],
          steps: [{
            t: 'quiz', who: COMPRUEBA,
            qs: [
              { q: '¿Cuál es el valor del número 7 en la cantidad 742?', o: ['7', '70', '700', '1,000'], a: 2, ok: '¡Sí! El 7 está en las centenas: vale 700.', no: 'Fíjate en qué posición está el 7: ¿unidades, decenas o centenas?' },
              { q: 'Si tienes el número 890 y le restas 100, ¿qué número obtienes?', o: ['880', '790', '990', '800'], a: 1, ok: '¡Correcto! Al restar 100 solo cambian las centenas: 790.', no: 'Restar 100 quita una centena. ¿Qué cifra cambia?' },
              { q: '¿Cuál de las opciones muestra los números ordenados de menor a mayor?', o: ['521, 251, 125', '125, 521, 251', '125, 251, 521', '521, 125, 251'], a: 2, ok: '¡Bien! Comparamos primero las centenas: 125, 251, 521.', no: 'Compara primero las centenas: el número con la centena más pequeña va primero.' },
              { q: 'En el número 405, la cifra 0 significa que no hay decenas en esa cantidad.', o: VF, a: 0, ok: '¡Correcto! El cero guarda el lugar de las decenas.', no: 'Mira el número 405: ¿qué cifra está en el lugar de las decenas?' },
              { q: 'El número 1,000 está compuesto exactamente por 10 decenas.', o: VF, a: 1, ok: '¡Bien visto! Diez decenas son cien. Mil son diez centenas.', no: 'Piensa: diez decenas forman cien, no mil.' },
            ],
          }],
        },
      ],
    },
    // ------------------------------------------------------------ 2º · Contenido 2
    {
      key: 'm2', set: 'math', n: 2, tag: '2º PRIMARIA', name: 'Cajero Galáctico', sub: 'Suma y resta', emoji: '👽', glyph: '+ −',
      color: 0x35e0ff, room: [-120, 120], badge: 'SUMA Y RESTA',
      phases: [
        {
          intro: [
            { text: '**Segundo de primaria: Cajero Galáctico.** ¡Bienvenido al banco más divertido del universo! Hoy eres un **astronauta financiero**.', mood: 'happy', gesture: 'wave' },
            { text: 'Tres amigos extraterrestres quieren juntar **cien puntos de energía**. Dales **celdas de diez** y **celdas de uno** hasta completar cien.', mood: 'normal', gesture: 'point' },
          ],
          steps: [{
            t: 'build', who: 'CELDAS DE ENERGÍA', tok: CELLS, teach: true,
            hint: 'Cuenta de diez en diez hasta acercarte a cien y luego usa celdas de uno.',
            targets: [
              { base: 70, goal: 100, prompt: 'El alien Zib tiene 70 puntos. ¿Cuántos le faltan para llegar a 100?', ok: '¡Listo! Setenta más treinta es igual a cien.' },
              { base: 45, goal: 100, prompt: 'La alien Lumi tiene 45 puntos. ¡Complétale 100!', ok: '¡Genial! Cuarenta y cinco más cincuenta y cinco es igual a cien.' },
              { base: 82, goal: 100, prompt: 'El alien Tok tiene 82 puntos. ¿Cuántos le faltan?', ok: '¡Excelente! Ochenta y dos más dieciocho es igual a cien.' },
            ],
          }],
        },
        {
          ctime: 120,
          intro: [{ text: '**Fase 2: Practica.** Un **robot guardián** cuida la **Bóveda del Conocimiento**. ¡Responde para abrir la compuerta!', mood: 'happy', gesture: 'point' }],
          steps: [
            {
              t: 'quiz', who: 'BÓVEDA DEL CONOCIMIENTO', teach: true,
              qs: [{ q: 'Para sumar rápido, desarmo el número 348 así: 300 + ? + 8', o: ['4', '40', '48'], a: 1, ok: '¡Exacto! Trescientos cuarenta y ocho es **300 + 40 + 8**. ¡La compuerta se abre!', no: 'El 4 está en las decenas. ¿Cuánto vale?' }],
            },
            {
              t: 'build', who: 'CAJERO AUTOMÁTICO HOLOGRÁFICO', tok: BLOCKS,
              intro: [{ text: '¡Compuerta abierta! Usa el **Cajero Automático Holográfico**: resuelve cada resta y entrega el resultado con bloques de **cien**, **diez** y **uno**.', mood: 'happy', gesture: 'point' }],
              hint: 'Resuelve la resta y luego inserta bloques hasta formar el resultado exacto.',
              targets: [
                { goal: 525, prompt: '¿Cuánto es 548 − 23? Entrega el resultado con bloques.', ok: '¡Correcto! 548 − 23 = 525.' },
                { goal: 137, prompt: 'Un camión llevaba 182 alumnos y se bajaron 45. ¿Cuántos quedaron?', ok: '¡Muy bien! 182 − 45 = 137. ¡Tuviste que transformar una decena!' },
              ],
            },
          ],
        },
        {
          ctime: 100,
          intro: [P3_INTRO, HOW_QUIZ],
          steps: [{
            t: 'quiz', who: COMPRUEBA,
            qs: [
              { q: 'Camilo tiene 430 pesos en su alcancía y su abuela le regala 250 más. ¿Qué operación debe hacer para saber cuánto tiene en total?', o: ['Una resta vertical', 'Una descomposición sustractiva', 'Una suma para agregar la nueva cantidad', 'Un complemento de 10'], a: 2, ok: '¡Sí! Para agregar una cantidad usamos una suma.', no: 'Camilo recibe más dinero: ¿agregamos o quitamos?' },
              { q: '¿Cuál es el resultado de la operación vertical 679 − 145?', o: ['534', '524', '824', '530'], a: 0, ok: '¡Correcto! 679 − 145 = 534.', no: 'Resta columna por columna: unidades, decenas y centenas.' },
              { q: 'Si calculas mentalmente el complemento de 100 para el número 65, ¿cuánto te falta?', o: ['45', '35', '55', '25'], a: 1, ok: '¡Bien! 65 + 35 = 100.', no: 'Cuenta desde 65 hasta llegar a 100.' },
              { q: 'Sofía tiene 80 estampitas y Diego tiene 120. Para saber cuántas más tiene Diego, la acción correcta es una suma.', o: VF, a: 1, ok: '¡Correcto! Para comparar cantidades usamos una resta: 120 − 80 = 40.', no: 'Queremos saber la diferencia entre dos cantidades. ¿Sumamos o restamos?' },
              { q: 'En la resta, si la unidad de arriba es menor que la de abajo, se transforma pidiendo una decena prestada a la columna de la izquierda.', o: VF, a: 0, ok: '¡Exacto! Pedimos una decena prestada y la unidad se transforma.', no: 'Recuerda la resta con transformación: ¿qué hacemos si arriba hay menos?' },
            ],
          }],
        },
      ],
    },
    // ------------------------------------------------------------ 6º · Contenido 1
    {
      key: 'm3', set: 'math', n: 3, tag: '6º PRIMARIA', name: 'El Torneo Medieval', sub: 'Numeración avanzada', emoji: '🏰', glyph: 'XIV',
      color: 0xe6a817, room: [120, -120], badge: 'NUMERACIÓN AVANZADA',
      phases: [
        {
          intro: [
            { text: '**Sexto de primaria: El Torneo Medieval de las Grandes Escalas.** ¡Eres el estratega del castillo!', mood: 'happy', gesture: 'wave' },
            { text: 'Para ganar el torneo de las ciencias, recorre los puestos del **Campamento Real** y ayuda a cada personaje.', mood: 'normal', gesture: 'point' },
            HOW_QUIZ,
          ],
          steps: [
            {
              t: 'quiz', who: 'CAMPAMENTO REAL', teach: true,
              qs: [
                { q: 'Un caballero quiere fechar su escudo con el año MMXXVI. ¿Qué año es?', o: ['2026', '2016', '1126'], a: 0, ok: '¡Correcto! **M** más **M** son dos mil, **XX** son veinte y **VI** son seis: ¡dos mil veintiséis!', no: 'Recuerda: M vale 1,000, X vale 10, V vale 5 e I vale 1.' },
                { q: 'El emisario maya organiza sus defensas. En la numeración maya, ¿cuánto vale una barra?', o: ['1', '5', '20'], a: 1, ok: '¡Muy bien! Una **barra** vale cinco y un **punto** vale uno.', no: 'En la numeración maya el punto vale 1. ¿Y la barra?' },
              ],
            },
            {
              t: 'pick', who: 'BALLESTAS AUTOMÁTICAS', prompt: 'Calibra las ballestas: activa los tiempos de menor a mayor (en segundos).',
              pads: ['0.450', '0.009', '0.405', '0.045'], order: ['0.009', '0.045', '0.405', '0.450'], teach: true,
              intro: [{ text: 'La maestra de armas calibra las ballestas en **milésimas de segundo**. Activa los tiempos **de menor a mayor**.', mood: 'normal', gesture: 'point' }],
              ok: '¡Excelente puntería! Para comparar decimales revisamos los **décimos**, luego los **centésimos** y al final los **milésimos**.',
              no: 'Compara cifra por cifra: primero los décimos, luego los centésimos.',
              hint: 'Compara los decimales cifra por cifra: décimos, centésimos y milésimos.',
            },
          ],
        },
        {
          ctime: 110,
          intro: [{ text: '**Fase 2: Practica.** El **Guardián del Puente Levadizo** exige resolver un dilema sobre el **cero** antes de bajar el puente.', mood: 'think', gesture: 'think' }],
          steps: [
            {
              t: 'quiz', who: 'GUARDIÁN DEL PUENTE LEVADIZO', teach: true,
              qs: [{ q: '¿Por qué el cero es tan importante en el número 3,004,000,000,000?', o: ['Guarda el lugar de las posiciones vacías', 'No vale nada y se puede quitar', 'Vale lo mismo que el uno'], a: 0, ok: '¡Así es! Sin el cero, las demás cifras cambiarían de lugar y de valor. ¡El puente baja!', no: '¿Qué pasaría con el valor del 3 si quitamos los ceros?' }],
            },
            {
              t: 'pick', who: 'ELEVADOR DE CARGA', prompt: 'Lleva el elevador del foso más profundo a la almena más alta: activa los pisos de menor a mayor.',
              pads: ['4', '−8', '0', '−15', '−3'], order: ['−15', '−8', '−3', '0', '4'],
              intro: [{ text: '¡El puente bajó! En la torre, dirige el **elevador de carga**: activa los pisos desde el **foso más profundo** hasta la **almena más alta**.', mood: 'happy', gesture: 'point' }],
              ok: '¡Bien! En la recta numérica, mientras más lejos del cero está un número negativo, más pequeño es.',
              no: 'Recuerda: los números negativos más lejanos al cero son los más pequeños.',
              hint: 'El piso más bajo es el negativo más lejano al cero. El cero va antes de los positivos.',
            },
          ],
        },
        {
          ctime: 100,
          intro: [P3_INTRO],
          steps: [{
            t: 'quiz', who: COMPRUEBA,
            qs: [
              { q: '¿Cuál es la representación correcta en cifras del número "tres billones cuatro mil millones"?', o: ['3,004,000,000', '3,004,000,000,000', '3,400,000,000,000', '3,040,000,000'], a: 1, ok: '¡Correcto! Tres billones cuatro mil millones: 3,004,000,000,000.', no: 'Un billón es un millón de millones: tiene doce ceros.' },
              { q: 'En el sistema de numeración maya, ¿cuál es el valor de un punto si está en el segundo nivel posicional?', o: ['1 unidad', '5 unidades', '20 unidades', '400 unidades'], a: 2, ok: '¡Sí! El sistema maya es vigesimal: en el segundo nivel un punto vale 20.', no: 'El sistema maya agrupa de veinte en veinte.' },
              { q: 'Un termómetro marca −8 grados Celsius y la temperatura sube 12 grados. ¿Cuál es la nueva temperatura?', o: ['−20 grados', '4 grados', '20 grados', '−4 grados'], a: 1, ok: '¡Bien! Desde −8 subimos 12: llegamos a 4 grados.', no: 'Imagina la recta numérica: sube 8 hasta el cero y luego 4 más.' },
              { q: 'El sistema de numeración romano es un sistema posicional igual que el decimal.', o: VF, a: 1, ok: '¡Correcto! El sistema romano es aditivo: cada símbolo vale lo mismo en cualquier lugar.', no: 'En el sistema romano, ¿la X vale distinto según su posición?' },
              { q: 'El número −15 es menor que el número −3 en la recta numérica.', o: VF, a: 0, ok: '¡Exacto! −15 está más a la izquierda en la recta numérica.', no: 'Ubica los dos números en la recta numérica: ¿cuál está más a la izquierda?' },
            ],
          }],
        },
      ],
    },
    // ------------------------------------------------------------ 6º · Contenido 2
    {
      key: 'm4', set: 'math', n: 4, tag: '6º PRIMARIA', name: 'Hackers Éticos', sub: 'Múltiplos y divisores', emoji: '💻', glyph: 'MCM',
      color: 0x22c55e, room: [120, 120], badge: 'MÚLTIPLOS Y DIVISORES',
      phases: [
        {
          intro: [
            { text: '**Sexto de primaria: Hackers Éticos.** ¡Protege el **servidor escolar**! Los múltiplos y los divisores son tus mejores herramientas.', mood: 'happy', gesture: 'wave' },
            { text: 'El **antivirus** se actualiza cada **tres segundos** y el **cortafuegos** cada **cuatro**. Activa los segundos en los que **coinciden**.', mood: 'normal', gesture: 'point' },
            { text: 'Párate en una plataforma y presiona **interactuar** para activarla.', mood: 'happy' },
          ],
          steps: [
            {
              t: 'pick', who: 'SINCRONIZACIÓN DE CORTAFUEGOS', prompt: 'Antivirus cada 3 s · Cortafuegos cada 4 s. Activa los dos segundos en que coinciden.',
              pads: ['6', '8', '9', '12', '16', '18', '24'], good: ['12', '24'], teach: true,
              ok: '¡Sincronizados! Los múltiplos comunes de tres y cuatro son doce, veinticuatro, treinta y seis… ¡El más pequeño es el **Mínimo Común Múltiplo**!',
              no: 'Ese número no es múltiplo de los dos. Revisa la tabla del 3 y la del 4.',
              hint: 'Busca los números que están en la tabla del 3 y también en la tabla del 4.',
            },
            {
              t: 'quiz', who: 'SINCRONIZACIÓN DE CORTAFUEGOS', teach: true,
              qs: [{ q: '¿Cuál es el Mínimo Común Múltiplo (MCM) de 3 y 4?', o: ['7', '12', '24'], a: 1, ok: '¡Exacto! El múltiplo común más pequeño de tres y cuatro es **doce**.', no: 'Es el múltiplo común más pequeño que encontraste.' }],
            },
          ],
        },
        {
          ctime: 130,
          intro: [{ text: '**Fase 2: Practica.** Un **muro láser** bloquea el paso al núcleo. ¡Resuelve el desafío para desactivarlo!', mood: 'surprised', gesture: 'point' }],
          steps: [
            {
              t: 'quiz', who: 'CORTAFUEGOS PRINCIPAL', teach: true,
              qs: [{ q: 'Un escudo se reinicia cada 8 horas y otro cada 12 horas. ¿Cada cuántas horas coinciden?', o: ['20', '24', '96'], a: 1, ok: '¡Correcto! El MCM de ocho y doce es **veinticuatro**. ¡Muro desactivado!', no: 'Busca el múltiplo común más pequeño de 8 y 12.' }],
            },
            {
              t: 'sort', who: 'NÚCLEO DE DATOS', prompt: 'Valida los códigos: ¿son divisibles entre 3? (Suma sus cifras)',
              intro: [{ text: 'En el **Núcleo de Datos**, valida los códigos: ¿cuáles son **divisibles entre tres**? Suma sus cifras: si da un múltiplo de tres, ¡sí lo es!', mood: 'normal', gesture: 'point' }],
              hint: 'Suma las cifras del número: si el resultado es múltiplo de 3, el número es divisible entre 3.',
              zones: [
                { key: 'si', label: 'DIVISIBLE ENTRE 3', color: 0x22c55e },
                { key: 'no', label: 'NO DIVISIBLE ENTRE 3', color: 0xff5d73 },
              ],
              items: [
                { label: '270', emoji: '🔐', z: 'si' },
                { label: '145', emoji: '🔐', z: 'no' },
                { label: '126', emoji: '🔐', z: 'si' },
                { label: '100', emoji: '🔐', z: 'no' },
              ],
              no: 'Suma sus cifras otra vez: ¿el resultado está en la tabla del 3?',
            },
            {
              t: 'quiz', who: 'CARPETAS ENCRIPTADAS',
              intro: [{ text: '¡Códigos validados! Último paso: reparte los archivos en **carpetas idénticas** con el **Máximo Común Divisor**.', mood: 'happy', gesture: 'point' }],
              qs: [{ q: 'Tienes 12 archivos de texto y 18 de imagen. Quieres el mayor número de carpetas idénticas. ¿Cuántas carpetas formas?', o: ['3', '6', '36'], a: 1, ok: '¡Muy bien! El MCD de 12 y 18 es 6: cada carpeta lleva 2 de texto y 3 de imagen.', no: 'Busca el divisor común más grande de 12 y 18.' }],
            },
          ],
        },
        {
          ctime: 100,
          intro: [P3_INTRO],
          steps: [{
            t: 'quiz', who: COMPRUEBA,
            qs: [
              { q: '¿Cuál es el Mínimo Común Múltiplo (MCM) de los números 6 y 8?', o: ['14', '48', '24', '12'], a: 2, ok: '¡Correcto! Los múltiplos de 6 y de 8 coinciden primero en el 24.', no: 'Escribe los múltiplos de 6 y de 8 hasta encontrar el primero que se repite.' },
              { q: 'Al calcular el factor más grande capaz de dividir de forma exacta a 20 y 30 a la vez, obtenemos su:', o: ['Mínimo Común Múltiplo', 'Máximo Común Divisor', 'Criterio de Divisibilidad', 'Residuo de la Operación'], a: 1, ok: '¡Sí! Es el Máximo Común Divisor: para 20 y 30 es 10.', no: 'Buscamos el número más grande que divide a los dos.' },
              { q: '¿Cuál de estos números es divisible exactamente entre 3 y entre 5 a la vez?', o: ['25', '40', '45', '53'], a: 2, ok: '¡Exacto! 45 termina en 5 y sus cifras suman 9.', no: 'Debe terminar en 0 o en 5, y la suma de sus cifras debe ser múltiplo de 3.' },
              { q: 'El número 1,235 es divisible entre 2 porque termina en una cifra impar.', o: VF, a: 1, ok: '¡Correcto! Solo los números que terminan en cifra par son divisibles entre 2.', no: 'Recuerda la regla del 2: ¿en qué cifras debe terminar el número?' },
              { q: 'El Máximo Común Divisor de dos números nunca podrá ser mayor que el menor de esos números.', o: VF, a: 0, ok: '¡Así es! Un divisor no puede ser más grande que el número que divide.', no: 'Piensa: ¿un número puede dividir exactamente a otro más pequeño?' },
            ],
          }],
        },
      ],
    },
  ],
};
