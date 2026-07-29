/**
 * admin-equipos.js
 * ---------------------------------------------------------------------------
 * Controlador de la pestaña "Equipos": carga masiva de participantes.
 *
 * El administrador pega una lista, la aplicación la interpreta, muestra en vivo
 * cómo quedaría el cuadro y sólo entonces permite publicarlo.
 *
 * La previsualización usa el MISMO renderer que el bracket público, así que lo
 * que se ve antes de confirmar es exactamente lo que se va a publicar.
 */

import { CONFIG } from './config.js';
import { crearVistaBracket, nombreDeRonda } from './bracket.js';
import {
  parsearEquipos,
  generarTorneo,
  esPotenciaDeDos,
  completarCuadro,
  siguientePotenciaDeDos,
  listarParticipantes,
  esParticipanteLibre,
  PARTICIPANTE_LIBRE,
  LIMITES,
} from './generador.js';
import { obtenerTorneo, publicar } from './admin-estado.js';
import {
  renderizarBracket,
  alternarBotonOcupado,
  mostrarToast,
  confirmar,
  crearElemento,
} from './ui.js';

/** Referencias al DOM de esta pestaña. */
let dom = {};

/**
 * Último análisis válido de la lista. Se guarda para que "Publicar" no tenga
 * que volver a parsear y publique exactamente lo previsualizado.
 * @type {{equipos: string[], torneo: object}|null}
 */
let propuesta = null;

/** Identificador del temporizador de debounce del textarea. */
let temporizador = null;

/**
 * Inicializa la pestaña y engancha sus eventos.
 * @param {object} elementos referencias al DOM
 */
export function inicializar(elementos) {
  dom = elementos;

  // Debounce: analizar en cada tecla redibujaría el cuadro demasiadas veces.
  dom.textarea.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(analizar, 250);
  });

  dom.nombre.addEventListener('input', analizar);
  dom.fecha.addEventListener('input', analizar);
  dom.botonCompletar.addEventListener('click', completarConLibres);
  dom.botonCargarActuales.addEventListener('click', cargarParticipantesActuales);
  dom.botonPublicar.addEventListener('click', manejarPublicacion);

  analizar();
}

/**
 * Precarga los campos con los datos del torneo vigente y reanaliza la lista.
 * La invoca el orquestador ante cada cambio de estado, para que la pestaña no
 * quede desfasada tras una publicación hecha desde otra pestaña.
 * @param {object|null} torneo
 */
export function renderizar(torneo) {
  if (!torneo || !dom.nombre) return;
  // Sólo se completan los campos vacíos: no se pisa lo que el admin escribió.
  if (!dom.nombre.value.trim()) dom.nombre.value = torneo.nombre ?? '';
  if (!dom.fecha.value) dom.fecha.value = torneo.fecha ?? '';
  analizar();
}

/** Vuelca en el textarea los participantes del torneo vigente. */
function cargarParticipantesActuales() {
  const torneo = obtenerTorneo();
  const participantes = listarParticipantes(torneo);

  if (participantes.length === 0) {
    mostrarToast('El torneo actual no tiene participantes cargados.', 'aviso');
    return;
  }

  dom.textarea.value = participantes.join('\n');
  dom.nombre.value = torneo.nombre ?? '';
  dom.fecha.value = torneo.fecha ?? '';
  analizar();
  mostrarToast(`Se cargaron ${participantes.length} participantes para editar.`, 'info');
}

/** Completa la lista con "Libre" hasta la siguiente potencia de 2. */
function completarConLibres() {
  const { equipos } = parsearEquipos(dom.textarea.value);
  const { equipos: completados, agregados } = completarCuadro(equipos);

  if (agregados === 0) {
    mostrarToast('El cuadro ya está completo.', 'info');
    return;
  }

  dom.textarea.value = completados.join('\n');
  analizar();
  mostrarToast(`Se agregaron ${agregados} lugar(es) "${PARTICIPANTE_LIBRE}".`, 'info');
}

// ---------------------------------------------------------------------------
// Análisis y previsualización
// ---------------------------------------------------------------------------

/**
 * Interpreta la lista, informa el estado y previsualiza el cuadro resultante.
 * Es el corazón de la pestaña: se ejecuta ante cualquier cambio del formulario.
 */
function analizar() {
  const analisis = parsearEquipos(dom.textarea.value);
  const cantidad = analisis.equipos.length;

  propuesta = null;
  dom.avisos.innerHTML = '';
  dom.preview.innerHTML = '';

  // Sin nombres: estado inicial, nada que informar.
  if (cantidad === 0) {
    dom.resumen.textContent = 'Pegá la lista de participantes para ver el cuadro.';
    dom.resumen.className = 'form-text';
    dom.botonCompletar.classList.add('d-none');
    dom.botonPublicar.disabled = true;
    return;
  }

  analisis.avisos.forEach((aviso) => agregarAviso(aviso, 'warning'));
  analisis.errores.forEach((error) => agregarAviso(error, 'danger'));

  const cuadroValido = esPotenciaDeDos(cantidad) && analisis.errores.length === 0;
  dom.botonCompletar.classList.toggle('d-none', cuadroValido || cantidad >= LIMITES.maximoEquipos);

  if (!cuadroValido) {
    describirCuadroIncompleto(cantidad, analisis.errores.length > 0);
    dom.botonPublicar.disabled = true;
    return;
  }

  // Cuadro válido: se genera y se previsualiza.
  const generado = generarTorneo({
    nombre: dom.nombre.value,
    fecha: dom.fecha.value,
    equipos: analisis.equipos,
  });

  if (!generado.ok) {
    agregarAviso(generado.error, 'danger');
    dom.resumen.textContent = 'Revisá los datos del torneo.';
    dom.resumen.className = 'form-text text-danger';
    dom.botonPublicar.disabled = true;
    return;
  }

  propuesta = { equipos: analisis.equipos, torneo: generado.torneo };
  describirCuadroValido(cantidad, generado.torneo);
  renderizarBracket(dom.preview, crearVistaBracket(generado.torneo));
  dom.botonPublicar.disabled = false;
}

/**
 * Informa el resumen de un cuadro válido y listo para publicar.
 * @param {number} cantidad
 * @param {object} torneo
 */
function describirCuadroValido(cantidad, torneo) {
  const rondas = torneo.rondas.length;
  const libres = torneo.rondas[0].partidos.flatMap((p) => [p.equipo1, p.equipo2])
    .filter(esParticipanteLibre).length;

  dom.resumen.textContent =
    `${cantidad} participantes · ${rondas} ronda(s), de ${nombreDeRonda(0, rondas).toLowerCase()} a la final` +
    (libres > 0 ? ` · ${libres} lugar(es) "${PARTICIPANTE_LIBRE}"` : '');
  dom.resumen.className = 'form-text text-success';
}

/**
 * Explica por qué la cantidad de participantes todavía no forma un cuadro.
 * @param {number} cantidad
 * @param {boolean} hayErrores
 */
function describirCuadroIncompleto(cantidad, hayErrores) {
  if (hayErrores) {
    dom.resumen.textContent = `${cantidad} participantes detectados.`;
    dom.resumen.className = 'form-text text-danger';
    return;
  }

  const objetivo = siguientePotenciaDeDos(cantidad);
  const faltan = objetivo - cantidad;
  dom.resumen.textContent =
    `${cantidad} participantes. Un cuadro necesita una potencia de 2: ` +
    `agregá ${faltan} más para llegar a ${objetivo}, o completá los lugares con "${PARTICIPANTE_LIBRE}".`;
  dom.resumen.className = 'form-text text-warning-emphasis';
}

/**
 * Agrega un aviso al panel de mensajes de la pestaña.
 * @param {string} mensaje
 * @param {'warning'|'danger'} variante
 */
function agregarAviso(mensaje, variante) {
  dom.avisos.appendChild(
    crearElemento('div', {
      clases: ['alert', `alert-${variante}`, 'py-2', 'px-3', 'small', 'mb-2'],
      attrs: { role: 'alert' },
      texto: mensaje,
    })
  );
}

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------

/**
 * Publica el cuadro previsualizado, tras una confirmación que deja claro que la
 * operación reemplaza el torneo completo.
 */
async function manejarPublicacion() {
  if (!propuesta) {
    mostrarToast('Primero cargá una lista de participantes válida.', 'aviso');
    return;
  }

  const vigente = obtenerTorneo();
  const partidosJugados = (vigente?.rondas ?? [])
    .flatMap((r) => r.partidos)
    .filter((p) => p.ganador).length;

  const confirmado = await confirmar({
    titulo: 'Publicar cuadro nuevo',
    mensaje:
      `Se creará un torneo de ${propuesta.equipos.length} participantes ` +
      `llamado "${propuesta.torneo.nombre}".`,
    detalle:
      partidosJugados > 0
        ? `Esto reemplaza el torneo actual por completo: se perderán los ${partidosJugados} ` +
          'resultado(s) ya cargado(s). La versión anterior queda en el historial de commits.'
        : 'Esto reemplaza el cuadro actual por completo.',
    textoConfirmar: 'Publicar cuadro',
    variante: 'danger',
  });
  if (!confirmado) return;

  alternarBotonOcupado(dom.botonPublicar, true, 'Publicando…');
  const resultado = await publicar(
    propuesta.torneo,
    CONFIG.github.mensajeCommitEquipos.replace('{cantidad}', String(propuesta.equipos.length))
  );
  alternarBotonOcupado(dom.botonPublicar, false);

  if (resultado.ok) {
    mostrarToast(
      `Cuadro publicado con ${propuesta.equipos.length} participantes. Commit ${resultado.commit.commit}.`,
      'exito'
    );
    dom.textarea.value = '';
    analizar();
  } else {
    mostrarToast(resultado.error, 'error');
  }
}

