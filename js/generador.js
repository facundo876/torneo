/**
 * generador.js
 * ---------------------------------------------------------------------------
 * Operaciones de CONFIGURACIÓN del torneo. Módulo PURO: no toca el DOM, no hace
 * red y no depende de la configuración.
 *
 * Complementa a bracket.js, que se ocupa de los RESULTADOS. La división es
 * deliberada: cargar un marcador y rearmar el cuadro son operaciones de
 * naturaleza distinta, con reglas y riesgos distintos.
 *
 * Expone tres capacidades:
 *   - `parsearEquipos()`   interpreta una lista pegada por el administrador.
 *   - `generarTorneo()`    construye el bracket completo desde esa lista.
 *   - `reiniciarTorneo()`  borra todos los resultados conservando los equipos.
 */

import { nombreDeRonda, clonar, equipoDefinido, SIN_DEFINIR } from './bracket.js';

/** Nombre con el que se completan los lugares vacantes de un cuadro. */
export const PARTICIPANTE_LIBRE = 'Libre';

/** Límites defensivos para la carga masiva. */
export const LIMITES = Object.freeze({
  /** Mínimo para que exista un cuadro (una final). */
  minimoEquipos: 2,
  /** Máximo razonable: 64 participantes son 6 rondas. */
  maximoEquipos: 64,
  /** Un nombre más largo no entra en la tarjeta sin recortarse. */
  maximoCaracteresNombre: 40,
});

// ---------------------------------------------------------------------------
// Interpretación de la lista pegada
// ---------------------------------------------------------------------------

/**
 * Normaliza un nombre para comparar duplicados: minúsculas, sin acentos y con
 * los espacios colapsados. El nombre original nunca se altera.
 * @param {string} nombre
 * @returns {string}
 */
function normalizarParaComparar(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Limpia una línea suelta: quita numeración de lista, viñetas y espacios
 * sobrantes. Permite pegar desde un documento numerado sin editar a mano.
 *
 * Sólo se descarta el prefijo cuando son dígitos seguidos de un separador, de
 * modo que un nombre que empieza con número (por ejemplo "9 de Julio") queda
 * intacto.
 *
 * @param {string} linea
 * @returns {string}
 */
function limpiarNombre(linea) {
  return linea
    .replace(/^\s*\d+\s*[.)\-–]\s+/, '')
    .replace(/^\s*[-•*]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Interpreta el texto libre que pega el administrador y devuelve la lista de
 * participantes junto con los problemas detectados.
 *
 * Acepta un nombre por línea y también separados por coma, punto y coma o
 * tabulación, para que pegar desde una planilla o un CSV funcione igual.
 *
 * Nunca lanza: devuelve los avisos para que la interfaz los muestre y el
 * administrador decida.
 *
 * @param {string} texto
 * @returns {{equipos: string[], duplicados: string[], descartados: string[],
 *            errores: string[], avisos: string[]}}
 */
export function parsearEquipos(texto) {
  const errores = [];
  const avisos = [];
  const duplicados = [];
  const descartados = [];
  const equipos = [];
  const vistos = new Set();

  const crudos = String(texto ?? '')
    .split(/[\n\r;,\t]+/)
    .map(limpiarNombre)
    .filter((nombre) => nombre !== '');

  for (const nombre of crudos) {
    if (nombre.length > LIMITES.maximoCaracteresNombre) {
      descartados.push(nombre);
      continue;
    }
    const clave = normalizarParaComparar(nombre);
    if (vistos.has(clave)) {
      duplicados.push(nombre);
      continue;
    }
    vistos.add(clave);
    equipos.push(nombre);
  }

  if (descartados.length > 0) {
    avisos.push(
      `Se descartaron ${descartados.length} nombre(s) de más de ` +
      `${LIMITES.maximoCaracteresNombre} caracteres: ${descartados.join(', ')}.`
    );
  }
  if (duplicados.length > 0) {
    avisos.push(`Se ignoraron ${duplicados.length} nombre(s) repetido(s): ${duplicados.join(', ')}.`);
  }
  if (equipos.length > 0 && equipos.length < LIMITES.minimoEquipos) {
    errores.push(`Hacen falta al menos ${LIMITES.minimoEquipos} participantes.`);
  }
  if (equipos.length > LIMITES.maximoEquipos) {
    errores.push(`El máximo es ${LIMITES.maximoEquipos} participantes; se detectaron ${equipos.length}.`);
  }

  return { equipos, duplicados, descartados, errores, avisos };
}

// ---------------------------------------------------------------------------
// Tamaño del cuadro
// ---------------------------------------------------------------------------

/**
 * Indica si un número es potencia de 2 (2, 4, 8, 16, 32, 64).
 * @param {number} n
 * @returns {boolean}
 */
export function esPotenciaDeDos(n) {
  return Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0;
}

/**
 * Devuelve la potencia de 2 igual o inmediatamente superior a `n`.
 * @param {number} n
 * @returns {number}
 */
export function siguientePotenciaDeDos(n) {
  let tamanio = LIMITES.minimoEquipos;
  while (tamanio < n) tamanio *= 2;
  return tamanio;
}

/**
 * Indica si un nombre es un lugar vacante generado por `completarCuadro`.
 * Reconoce "Libre" y "Libre N", pero no un nombre real que empiece igual
 * (por ejemplo "Libre Pensador").
 *
 * @param {string} nombre
 * @returns {boolean}
 */
export function esParticipanteLibre(nombre) {
  return new RegExp(`^${PARTICIPANTE_LIBRE}(\\s+\\d+)?$`, 'i').test(String(nombre ?? '').trim());
}

/**
 * Completa la lista con lugares vacantes hasta alcanzar un cuadro válido.
 *
 * Se eligió un marcador de posición visible en lugar de resolver los cruces
 * incompletos de forma automática: el administrador ve exactamente cuántos
 * lugares vacantes hay y los resuelve con un clic, sin resultados inventados
 * por el sistema.
 *
 * Los vacantes se numeran ("Libre 1", "Libre 2", …) porque todo el sistema
 * identifica a los participantes por su nombre: dos equipos homónimos en un
 * mismo partido se pintarían los dos como ganadores. La numeración arranca
 * después del último ya presente, para que volver a completar no colisione.
 *
 * @param {string[]} equipos
 * @returns {{equipos: string[], agregados: number}}
 */
export function completarCuadro(equipos) {
  const objetivo = siguientePotenciaDeDos(Math.max(equipos.length, LIMITES.minimoEquipos));
  const completados = [...equipos];
  const usados = new Set(equipos.map(normalizarParaComparar));

  let numero = 1;
  while (completados.length < objetivo) {
    const candidato = `${PARTICIPANTE_LIBRE} ${numero++}`;
    if (usados.has(normalizarParaComparar(candidato))) continue;
    usados.add(normalizarParaComparar(candidato));
    completados.push(candidato);
  }

  return { equipos: completados, agregados: completados.length - equipos.length };
}

// ---------------------------------------------------------------------------
// Generación del cuadro
// ---------------------------------------------------------------------------

/**
 * Construye un torneo completo de eliminación directa a partir de una lista de
 * participantes.
 *
 * Los `id` se numeran de corrido empezando en 1 y los `siguiente` se calculan
 * solos: cada par de partidos consecutivos apunta al mismo partido de la ronda
 * posterior, que es la convención que ya interpretan bracket.js y el renderer.
 * El último partido queda con `siguiente: null`.
 *
 * El orden de la lista define los cruces: el primer nombre juega contra el
 * segundo, el tercero contra el cuarto, y así.
 *
 * @param {{nombre: string, fecha?: string, equipos: string[]}} datos
 * @returns {{ok: boolean, error?: string, torneo?: object}}
 */
export function generarTorneo({ nombre, fecha = '', equipos }) {
  if (!Array.isArray(equipos) || !esPotenciaDeDos(equipos.length)) {
    return {
      ok: false,
      error: 'La cantidad de participantes debe ser una potencia de 2 (2, 4, 8, 16, 32 o 64).',
    };
  }
  if (equipos.length > LIMITES.maximoEquipos) {
    return { ok: false, error: `El máximo es ${LIMITES.maximoEquipos} participantes.` };
  }
  if (!String(nombre ?? '').trim()) {
    return { ok: false, error: 'El torneo necesita un nombre.' };
  }

  const totalRondas = Math.log2(equipos.length);
  const rondas = [];
  let siguienteId = 1;

  for (let indice = 0; indice < totalRondas; indice++) {
    const cantidadPartidos = equipos.length / 2 ** (indice + 1);
    const idsDeEstaRonda = Array.from({ length: cantidadPartidos }, () => siguienteId++);
    rondas.push({
      nombre: nombreDeRonda(indice, totalRondas),
      partidos: idsDeEstaRonda.map((id) => ({
        id,
        equipo1: SIN_DEFINIR,
        equipo2: SIN_DEFINIR,
        score1: 0,
        score2: 0,
        ganador: SIN_DEFINIR,
        siguiente: SIN_DEFINIR,
      })),
    });
  }

  // Enlazado: el partido i de una ronda alimenta al partido floor(i/2) de la
  // siguiente. Se resuelve una vez que todos los ids existen.
  for (let indice = 0; indice < rondas.length - 1; indice++) {
    const proxima = rondas[indice + 1].partidos;
    rondas[indice].partidos.forEach((partido, posicion) => {
      partido.siguiente = proxima[Math.floor(posicion / 2)].id;
    });
  }

  // Los participantes entran en la primera ronda en el orden recibido.
  rondas[0].partidos.forEach((partido, posicion) => {
    partido.equipo1 = equipos[posicion * 2];
    partido.equipo2 = equipos[posicion * 2 + 1];
  });

  return {
    ok: true,
    torneo: {
      nombre: String(nombre).trim(),
      fecha: String(fecha ?? '').trim(),
      rondas,
    },
  };
}

// ---------------------------------------------------------------------------
// Reinicio
// ---------------------------------------------------------------------------

/**
 * Devuelve el torneo con todos los resultados borrados.
 *
 * Conserva la estructura del cuadro y los participantes de la primera ronda;
 * vacía los clasificados de todas las rondas posteriores, porque volverán a
 * definirse al cargar los resultados.
 *
 * No muta el torneo recibido. Para empezar con OTROS participantes, el flujo es
 * `generarTorneo()`, que rearma el cuadro entero.
 *
 * @param {object} torneo
 * @returns {{ok: boolean, error?: string, torneo?: object, partidosLimpiados?: number}}
 */
export function reiniciarTorneo(torneo) {
  if (!torneo || !Array.isArray(torneo.rondas) || torneo.rondas.length === 0) {
    return { ok: false, error: 'No hay un torneo cargado para reiniciar.' };
  }

  const copia = clonar(torneo);
  let partidosLimpiados = 0;

  copia.rondas.forEach((ronda, indice) => {
    ronda.partidos.forEach((partido) => {
      const teniaResultado = equipoDefinido(partido.ganador) || partido.score1 !== 0 || partido.score2 !== 0;
      if (teniaResultado) partidosLimpiados++;

      partido.score1 = 0;
      partido.score2 = 0;
      partido.ganador = SIN_DEFINIR;

      // Los participantes sólo se conservan en la ronda inicial.
      if (indice > 0) {
        partido.equipo1 = SIN_DEFINIR;
        partido.equipo2 = SIN_DEFINIR;
      }
    });
  });

  return { ok: true, torneo: copia, partidosLimpiados };
}

/**
 * Lista los participantes de la primera ronda, en orden de cruce. Sirve para
 * mostrar al administrador qué equipos se conservan al reiniciar.
 *
 * @param {object} torneo
 * @returns {string[]}
 */
export function listarParticipantes(torneo) {
  if (!torneo?.rondas?.[0]) return [];
  return torneo.rondas[0].partidos
    .flatMap((partido) => [partido.equipo1, partido.equipo2])
    .filter(equipoDefinido);
}
