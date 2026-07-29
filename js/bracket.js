/**
 * bracket.js
 * ---------------------------------------------------------------------------
 * Núcleo de dominio del torneo. Módulo PURO: no toca el DOM, no hace red y no
 * depende de la configuración. Recibe y devuelve datos planos, lo que permite
 * probarlo de forma aislada y reutilizarlo desde cualquier interfaz.
 *
 * Responsabilidades:
 *   - Derivar la estructura del bracket (rondas, columnas, enlaces) del JSON.
 *   - Validar marcadores según las reglas del torneo.
 *   - Determinar el ganador de un partido.
 *   - Propagar el clasificado a la ronda siguiente, invalidando en cascada los
 *     resultados que dejan de ser válidos.
 *
 * Contrato del JSON (ver data/torneo.json):
 *   { nombre, fecha, rondas: [ { nombre, partidos: [ Partido ] } ] }
 *   Partido = { id, equipo1, equipo2, score1, score2, ganador, siguiente }
 *
 * `siguiente` identifica el partido de la ronda posterior que recibe al
 * ganador. Se acepta tanto un id global como la posición (1-based) dentro de
 * esa ronda; `resolverSiguiente()` normaliza ambas formas. El slot de destino
 * (equipo1 / equipo2) se calcula automáticamente a partir del orden de los
 * partidos que alimentan a ese destino, de modo que el JSON no necesita
 * declararlo. Un campo opcional `siguienteSlot` (1 o 2) permite forzarlo.
 */

/** Estados posibles de un partido. */
export const ESTADO = Object.freeze({
  /** Falta al menos uno de los dos participantes. */
  PENDIENTE: 'pendiente',
  /** Ambos participantes definidos, sin resultado cargado. */
  LISTO: 'listo',
  /** Resultado cargado y ganador determinado. */
  FINALIZADO: 'finalizado',
});

/** Marcador de posición para un participante todavía no clasificado. */
export const SIN_DEFINIR = null;

// ---------------------------------------------------------------------------
// Consultas sobre el modelo
// ---------------------------------------------------------------------------

/**
 * Indica si un valor de equipo representa un participante ya definido.
 * @param {string|null|undefined} equipo
 * @returns {boolean}
 */
export function equipoDefinido(equipo) {
  return typeof equipo === 'string' && equipo.trim() !== '';
}

/**
 * Calcula el estado de un partido a partir de sus datos.
 * @param {object} partido
 * @returns {string} uno de los valores de ESTADO
 */
export function estadoPartido(partido) {
  if (equipoDefinido(partido.ganador)) return ESTADO.FINALIZADO;
  if (equipoDefinido(partido.equipo1) && equipoDefinido(partido.equipo2)) return ESTADO.LISTO;
  return ESTADO.PENDIENTE;
}

/**
 * Devuelve el partido con el id indicado, junto con su ubicación.
 * @param {object} torneo
 * @param {number|string} id
 * @returns {{partido: object, ronda: object, indiceRonda: number}|null}
 */
export function buscarPartido(torneo, id) {
  for (let r = 0; r < torneo.rondas.length; r++) {
    const ronda = torneo.rondas[r];
    const partido = ronda.partidos.find((p) => String(p.id) === String(id));
    if (partido) return { partido, ronda, indiceRonda: r };
  }
  return null;
}

/**
 * Resuelve a qué partido de la ronda siguiente avanza el ganador.
 *
 * Se aceptan tres formas de expresar `siguiente`, en este orden de prioridad:
 *   1. id de un partido de la ronda inmediatamente posterior;
 *   2. posición 1-based dentro de esa ronda;
 *   3. id global de cualquier partido del torneo.
 *
 * @param {object} torneo
 * @param {number} indiceRonda índice de la ronda del partido de origen
 * @param {object} partido partido de origen
 * @returns {{partido: object, indiceRonda: number}|null} null si es la final
 */
export function resolverSiguiente(torneo, indiceRonda, partido) {
  const rondaSiguiente = torneo.rondas[indiceRonda + 1];
  if (!rondaSiguiente || partido.siguiente === null || partido.siguiente === undefined) {
    return null;
  }

  const porId = rondaSiguiente.partidos.find((p) => String(p.id) === String(partido.siguiente));
  if (porId) return { partido: porId, indiceRonda: indiceRonda + 1 };

  const posicion = Number(partido.siguiente);
  if (Number.isInteger(posicion) && posicion >= 1 && posicion <= rondaSiguiente.partidos.length) {
    return { partido: rondaSiguiente.partidos[posicion - 1], indiceRonda: indiceRonda + 1 };
  }

  const global = buscarPartido(torneo, partido.siguiente);
  return global ? { partido: global.partido, indiceRonda: global.indiceRonda } : null;
}

/**
 * Determina en qué slot (1 = equipo1, 2 = equipo2) del partido destino cae el
 * ganador de `partido`.
 *
 * Regla: entre todos los partidos de la ronda que apuntan al mismo destino, el
 * primero en orden de aparición ocupa el slot 1 y el segundo el slot 2. Esto
 * evita tener que declarar el slot en el JSON. `siguienteSlot` lo sobrescribe.
 *
 * @param {object} torneo
 * @param {number} indiceRonda
 * @param {object} partido
 * @returns {1|2}
 */
export function calcularSlotDestino(torneo, indiceRonda, partido) {
  if (partido.siguienteSlot === 1 || partido.siguienteSlot === 2) {
    return partido.siguienteSlot;
  }
  const hermanos = torneo.rondas[indiceRonda].partidos.filter(
    (p) => String(p.siguiente) === String(partido.siguiente)
  );
  const posicion = hermanos.findIndex((p) => String(p.id) === String(partido.id));
  return posicion <= 0 ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Reglas del torneo
// ---------------------------------------------------------------------------

/**
 * Valida un marcador contra las reglas del torneo.
 *
 * Reglas: sin empates, sin marcadores negativos, sólo enteros y ambos equipos
 * deben estar definidos.
 *
 * @param {object} partido
 * @param {number} score1
 * @param {number} score2
 * @returns {{valido: boolean, error?: string}}
 */
export function validarResultado(partido, score1, score2) {
  if (!equipoDefinido(partido.equipo1) || !equipoDefinido(partido.equipo2)) {
    return { valido: false, error: 'El partido todavía no tiene definidos a los dos participantes.' };
  }
  if (!Number.isInteger(score1) || !Number.isInteger(score2)) {
    return { valido: false, error: 'Los marcadores deben ser números enteros.' };
  }
  if (score1 < 0 || score2 < 0) {
    return { valido: false, error: 'Los marcadores no pueden ser negativos.' };
  }
  if (score1 === score2) {
    return { valido: false, error: 'No se permiten empates: debe haber un único ganador.' };
  }
  return { valido: true };
}

/**
 * Determina el nombre del ganador según el marcador.
 * Asume que el resultado ya fue validado con `validarResultado`.
 *
 * @param {object} partido
 * @param {number} score1
 * @param {number} score2
 * @returns {string}
 */
export function determinarGanador(partido, score1, score2) {
  return score1 > score2 ? partido.equipo1 : partido.equipo2;
}

/**
 * Devuelve el perdedor de un partido ya resuelto, o null si no hay ganador.
 * @param {object} partido
 * @returns {string|null}
 */
export function determinarPerdedor(partido) {
  if (!equipoDefinido(partido.ganador)) return null;
  return partido.ganador === partido.equipo1 ? partido.equipo2 : partido.equipo1;
}

// ---------------------------------------------------------------------------
// Mutaciones (siempre sobre una copia; nunca se muta el torneo recibido)
// ---------------------------------------------------------------------------

/**
 * Copia profunda del torneo. Aísla al llamador de mutaciones accidentales.
 * @template T
 * @param {T} torneo
 * @returns {T}
 */
export function clonar(torneo) {
  return typeof structuredClone === 'function'
    ? structuredClone(torneo)
    : JSON.parse(JSON.stringify(torneo));
}

/**
 * Limpia el resultado de un partido dejando intactos a sus participantes.
 * @param {object} partido
 */
function limpiarResultado(partido) {
  partido.score1 = 0;
  partido.score2 = 0;
  partido.ganador = SIN_DEFINIR;
}

/**
 * Borra en cascada todo lo que dependía de un partido: vacía el slot que
 * ocupaba su antiguo clasificado en la ronda siguiente, anula ese resultado y
 * repite el proceso hacia adelante.
 *
 * Se usa cuando el ganador de un partido cambia: los resultados posteriores
 * fueron disputados por un equipo que ya no clasifica y dejan de ser válidos.
 *
 * @param {object} torneo torneo mutable
 * @param {number} indiceRonda
 * @param {object} partido partido cuyo resultado dejó de ser válido
 * @returns {object[]} partidos que fueron invalidados
 */
function invalidarDescendientes(torneo, indiceRonda, partido) {
  const destino = resolverSiguiente(torneo, indiceRonda, partido);
  if (!destino) return [];

  const slot = calcularSlotDestino(torneo, indiceRonda, partido);
  const clave = slot === 1 ? 'equipo1' : 'equipo2';

  // Si el slot ya estaba vacío y sin resultado, no hay nada que invalidar.
  if (!equipoDefinido(destino.partido[clave]) && !equipoDefinido(destino.partido.ganador)) {
    return [];
  }

  const afectados = invalidarDescendientes(torneo, destino.indiceRonda, destino.partido);
  destino.partido[clave] = SIN_DEFINIR;
  limpiarResultado(destino.partido);
  return [destino.partido, ...afectados];
}

/**
 * Aplica un resultado a un partido y propaga sus consecuencias.
 *
 * Es la única forma soportada de modificar el torneo. Devuelve un torneo nuevo
 * (no muta el original) junto con la información necesaria para informar al
 * usuario qué cambió.
 *
 * @param {object} torneo torneo original (no se modifica)
 * @param {number|string} idPartido
 * @param {number} score1
 * @param {number} score2
 * @returns {{ok: boolean, error?: string, torneo?: object, ganador?: string,
 *            avanzaA?: object|null, invalidados?: object[]}}
 */
export function aplicarResultado(torneo, idPartido, score1, score2) {
  const copia = clonar(torneo);
  const ubicacion = buscarPartido(copia, idPartido);
  if (!ubicacion) {
    return { ok: false, error: `No existe un partido con id ${idPartido}.` };
  }

  const { partido, indiceRonda } = ubicacion;
  const validacion = validarResultado(partido, score1, score2);
  if (!validacion.valido) {
    return { ok: false, error: validacion.error };
  }

  const ganador = determinarGanador(partido, score1, score2);
  const ganadorAnterior = partido.ganador;

  // Si cambia el clasificado, todo lo que ocurrió aguas abajo queda sin efecto.
  let invalidados = [];
  if (equipoDefinido(ganadorAnterior) && ganadorAnterior !== ganador) {
    invalidados = invalidarDescendientes(copia, indiceRonda, partido);
  }

  partido.score1 = score1;
  partido.score2 = score2;
  partido.ganador = ganador;

  // Propagación: el ganador ocupa su slot en la ronda siguiente.
  const destino = resolverSiguiente(copia, indiceRonda, partido);
  if (destino) {
    const slot = calcularSlotDestino(copia, indiceRonda, partido);
    destino.partido[slot === 1 ? 'equipo1' : 'equipo2'] = ganador;
  }

  return {
    ok: true,
    torneo: copia,
    ganador,
    avanzaA: destino ? destino.partido : null,
    invalidados,
  };
}

// ---------------------------------------------------------------------------
// Vista del bracket (modelo listo para renderizar)
// ---------------------------------------------------------------------------

/**
 * Transforma el JSON del torneo en una estructura enriquecida y lista para
 * dibujar. El renderer no necesita conocer ninguna regla del torneo: recibe
 * columnas, estados y campeón ya resueltos.
 *
 * La cantidad de columnas y la ubicación de cada partido se derivan del JSON,
 * de modo que agregar o quitar rondas no requiere tocar código.
 *
 * @param {object} torneo
 * @returns {{nombre: string, fecha: string, campeon: string|null,
 *            totalRondas: number, rondas: object[]}}
 */
export function crearVistaBracket(torneo) {
  const rondas = torneo.rondas.map((ronda, indice) => {
    const siguiente = torneo.rondas[indice + 1];
    // Los conectores sólo se dibujan cuando la ronda siguiente tiene
    // exactamente la mitad de partidos (bracket balanceado). En brackets
    // irregulares se omiten para no dibujar líneas que no corresponden.
    const conectores = Boolean(siguiente) && siguiente.partidos.length * 2 === ronda.partidos.length;

    return {
      nombre: ronda.nombre || nombreDeRonda(indice, torneo.rondas.length),
      indice,
      esUltima: indice === torneo.rondas.length - 1,
      conectores,
      partidos: ronda.partidos.map((partido) => ({
        ...partido,
        estado: estadoPartido(partido),
        perdedor: determinarPerdedor(partido),
      })),
    };
  });

  return {
    nombre: torneo.nombre || 'Torneo',
    fecha: torneo.fecha || '',
    campeon: obtenerCampeon(torneo),
    totalRondas: rondas.length,
    rondas,
  };
}

/**
 * Nombre de ronda deducido de la distancia a la final.
 *
 * Se usa como valor por defecto cuando el JSON no trae `nombre`, y también al
 * generar un torneo desde cero (ver generador.js): así existe una única tabla
 * de nombres de ronda en todo el proyecto.
 *
 * @param {number} indice
 * @param {number} total
 * @returns {string}
 */
export function nombreDeRonda(indice, total) {
  const restantes = total - indice;
  const nombres = { 1: 'Final', 2: 'Semifinal', 3: 'Cuartos', 4: 'Octavos', 5: 'Dieciseisavos' };
  return nombres[restantes] || `Ronda ${indice + 1}`;
}

/**
 * Devuelve el campeón del torneo, o null si la final aún no se disputó.
 * @param {object} torneo
 * @returns {string|null}
 */
export function obtenerCampeon(torneo) {
  const final = torneo.rondas[torneo.rondas.length - 1];
  if (!final || final.partidos.length !== 1) return null;
  const ganador = final.partidos[0].ganador;
  return equipoDefinido(ganador) ? ganador : null;
}

/**
 * Resumen de avance del torneo, útil para la cabecera pública.
 * @param {object} torneo
 * @returns {{jugados: number, total: number, porcentaje: number}}
 */
export function calcularAvance(torneo) {
  const partidos = torneo.rondas.flatMap((r) => r.partidos);
  const jugados = partidos.filter((p) => equipoDefinido(p.ganador)).length;
  const total = partidos.length;
  return {
    jugados,
    total,
    porcentaje: total === 0 ? 0 : Math.round((jugados / total) * 100),
  };
}

/**
 * Verifica que el JSON tenga la forma mínima esperada. Se ejecuta después de
 * cargarlo para fallar con un mensaje claro en lugar de romper al renderizar.
 *
 * @param {unknown} datos
 * @returns {{valido: boolean, error?: string}}
 */
export function validarEstructura(datos) {
  if (!datos || typeof datos !== 'object') {
    return { valido: false, error: 'El archivo del torneo no contiene un objeto JSON válido.' };
  }
  if (!Array.isArray(datos.rondas) || datos.rondas.length === 0) {
    return { valido: false, error: 'El torneo debe incluir al menos una ronda en la propiedad "rondas".' };
  }
  for (const ronda of datos.rondas) {
    if (!Array.isArray(ronda.partidos)) {
      return { valido: false, error: `La ronda "${ronda.nombre ?? '?'}" no tiene un arreglo "partidos".` };
    }
  }
  return { valido: true };
}
