# Pendientes de la versión nueva (src/next)

Para el próximo agente que trabaje en el POC de Gendarmería (`/mnt/rpi/dev/archive/humand/gendarmeria-poc`).

**Antes de empezar:**
- Contexto: [proxima-version.md](proxima-version.md).
- El disco de `/mnt/rpi` está fallando: leer `~/.claude-work/reports/disk-report-mnt-rpi.md` antes de escribir ahí.
- Hay una copia de este archivo en `~/.claude-work/reports/gendarmeria-pendientes.md`, en la tarjeta SD.
- La cuenta de trabajo solo puede escribir en las carpetas de `~/pi-config/work-guard/allowed-roots`. `~/gpoc-sd` (adonde apunta `src/next`) se agregó a la lista el 13/10. `tools/node_modules` y `tools/.cache` siguen afuera.

## 0. Lote 1 de normativa: aplicado (13/10)

El parche de `normativa/cambios/` ya está aplicado en `src/next/escenario.js` y `test-caso.js` pasa. Falta recorrer la pantalla de decisión en el navegador. Las decisiones abiertas están al final de [normativa/reglas.md](normativa/reglas.md).

## 1. Dedos del conductor: giran de forma antinatural (lo reportó el usuario, 13/10)

**Síntoma:** al ver al conductor en la versión nueva, los dedos "se rompen" y rotan de forma antinatural.

**Dónde:** `src/next/motor/conductor.js`.
- En `actualizar()`, el bloque `// Manos en el volante (a las 10 y a las 2)`: `ikBrazo`, después `orientarMano`, y el `forEach` de `b.dedos` que hace `h.quaternion.multiply(_qa.setFromAxisAngle(b.ejeFalange[k][j], cierre…))`.
- En `crearConductor()`: el cálculo de `b.dedosLocal`, `b.palmaLocal` y `b.ejeFalange` a partir de la pose de reposo.

**Lo que ya se descartó (13/10):**
- No es una pista faltante: las 30 falanges del modelo tienen pista de rotación en el clip `sentado` (53 pistas, nombres idénticos), así que el mixer las reescribe en cada cuadro y la rotación extra no se acumula sin límite.
- En una prueba sin interfaz, `Bip01_R_Finger1` no derivó en 9 s.

**Hipótesis, de más a menos probable:**
1. **El pulgar (`Finger0`, `Finger01`, `Finger02`) usa el mismo eje de cierre que los demás dedos.** Ese eje se calcula como `haciaDedos × palma`, y el pulgar se flexiona sobre otro eje: cruza la palma y gira raro. Darle su propio eje (aproximadamente `haciaDedos` o la normal de la palma) o no tocarlo.
2. **La palma de reposo está mal supuesta.** Se asume que "en reposo las palmas miran al cuerpo" (`palma = pelvis − mano`, proyectado). Si en la pose de reposo de Rocketbox no es así, el eje de cierre queda invertido o torcido: los dedos se doblan hacia atrás o de costado.
   - Verificar con los ejes de `tools/.cache/build/conductor-huesos.txt`. Según el agente de Rocketbox, en los huesos de los ojos +X apunta adelante; los de los dedos pueden seguir otra convención.
3. **Se cierra de más sobre una pose que ya viene cerrada.** El clip `sentado` (m_sit_chair_breathe_01) trae las manos en el regazo con los dedos algo flexionados, y encima se suma `cierre` de 0,95 rad por falange. Conviene fijar una rotación absoluta por falange (slerp hacia una pose objetivo) en vez de multiplicar sobre lo que trae el clip.
4. **`orientarMano` se vuelve inestable** cuando la dirección de los dedos y la palma deseada quedan casi paralelas (`makeBasis` con vectores degenerados): la mano puede dar media vuelta entre cuadros. Ortonormalizar con cuidado o limitar el cambio por cuadro.
5. **El tamborileo** (conductor nervioso, mano derecha, cuando no le hablan) resta hasta 0,7 rad por dedo a 9 rad/s. Combinado con 2 o 3 puede verse como un giro brusco.

**Cómo verlo y probarlo:**
- Navegador: `/gendarmeria/next/?caso=10000` (nervioso) y `?caso=10002` (tranquilo). Hablar con el conductor o mirarlo por la ventanilla del conductor.
- Capturas: `node tools/vista.js /tmp/dedos "caso=10000&calidad=liviana" '[{"archivo":"a.png","eval":"__dbg.abrir(\"driver\")","espera":12000}]' 1280 800`. Con WebGL por software va a unos 2 cuadros por segundo: esperar. `__dbg.conductor` expone el objeto.
- Al terminar, correr `node tools/test-conductor.js` (conductas) y el smoke completo (`SRC=src/next node tools/smoke.js /tmp/s caso=original 390 844`).

**Listo cuando:** con el conductor nervioso y el tranquilo, durante al menos 20 s de juego, los dedos rodean el aro del volante sin cruzarse ni doblarse hacia atrás, el pulgar queda del lado de adentro del aro, y el tamborileo se lee como dedos que golpean, no como dedos que giran.

## 2. Interior de la boca grisáceo

Al abrir la boca (`jawOpen` cerca de 0,4) se ve gris lavanda por la luz ambiente. Lo informó el agente de Rocketbox. Arreglo sugerido: oscurecer el interior de la boca (rugosidad 1 y color oscuro) o bajar `envMapIntensity` en el material de la cabeza. Hay que revisar que no apague la piel.

## 3. Pendientes de antes (ver `proxima-version.md`)

- Decisiones del usuario:
  - validar con instructores la medida "por fuera" en el portón;
  - la licencia dudosa de la Hilux;
  - la aprobación para pasar `src/next` a `src/`.
- Medir el rendimiento en celulares reales con `?debug`.
- Al pasar a `src/`:
  - `build.mjs` reemplaza a `build.py`;
  - actualizar `README.md` y `docs/arquitectura.md`;
  - regenerar `docs/capturas/`.
