# Normativa oficial

Acá se juntan las fuentes oficiales que el usuario va subiendo para ajustar la simulación. Pueden llegar más.

- `fuentes/`: copia sin cambios de cada archivo recibido, con un nombre que dice qué es. No se editan.
- [reglas.md](reglas.md): las reglas que salen de esas fuentes, cada una con su cita, y cómo se aplican al simulador.

## Fuentes recibidas

| Lote | Archivo | Qué es |
|---|---|---|
| 1 (13/10/2026) | `cppf-arts-03-04-inocencia-no-autoincriminacion.txt` | Código Procesal Penal Federal (Ley 27.063), arts. 3 y 4 |
| 1 | `cppf-arts-96-97-deberes-fuerzas-seguridad.txt` | CPPF, arts. 96 (deberes de las fuerzas) y 97 (parcial) |
| 1 | `cppf-art-110-actas.txt` | CPPF, art. 110 (actas y testigos de actuación) |
| 1 | `cppf-arts-137-143-requisa-registro-allanamiento.txt` | CPPF, arts. 137 a 143 (requisa con y sin orden, registro y allanamiento) |
| 1 | `cppn-arts-138-141-actas-testigos.txt` | Código Procesal Penal de la Nación (Ley 23.984), arts. 138 a 141. Según la nota del usuario, sigue vigente en algunas jurisdicciones |
| 1 | `cppn-art-184-atribuciones-fuerzas.txt` | CPPN, art. 184 (atribuciones y limitaciones de las fuerzas) |
| 1 | `fallos-requisa-valida.txt` | Fallos que convalidaron requisas en controles de Gendarmería |
| 1 | `fallos-requisa-nula.txt` | Fallo que anuló una requisa por falta de sospecha previa |
| 1 | `pga-allanamientos-requisas-to2017.pdf` | Protocolo General de Actuación para Allanamientos y Requisas Personales (texto ordenado 2017, IF-2017-10788241-APN-SECCPJMPYL#MSG). Obligatorio para Gendarmería. El `.txt` es la extracción del texto |
| 1 | `00-etiqueta-cppf.txt` | Solo dice "codigo procesal penal federal"; es la etiqueta de los fragmentos del CPPF |

Los originales quedaron en el drop zone (`~/outputs/inbox/ballbox-dropzone/20261013-184425-*`). Las copias se verificaron con sha256.

## Cómo sumar un lote nuevo

1. Copiar los archivos a `fuentes/` con un nombre descriptivo y agregarlos a la tabla de arriba.
2. Agregar o corregir reglas en [reglas.md](reglas.md). Si una fuente nueva contradice una regla, gana la más específica (el PGA dice que los protocolos de materias específicas tienen jerarquía sobre él) y se anota el cambio.
3. Pasar los cambios a `src/next/escenario.js` y correr `node tools/test-caso.js`.
