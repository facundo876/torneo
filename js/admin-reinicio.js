/**
 * admin-reinicio.js
 * ---------------------------------------------------------------------------
 * Controlador de la pestaña "Reiniciar": borra todos los resultados y deja el
 * torneo listo para empezar de nuevo con los mismos participantes.
 *
 * Es la operación más destructiva del panel, así que la pantalla está diseñada
 * para que nadie la ejecute por accidente: muestra de antemano qué se borra y
 * qué se conserva, y exige una confirmación escrita.
 */

import { CONFIG } from './config.js';
import { reiniciarTorneo, listarParticipantes } from './generador.js';
import { calcularAvance } from './bracket.js';
import { obtenerTorneo, publicar } from './admin-estado.js';
import { alternarBotonOcupado, mostrarToast, confirmar, crearElemento, escapar } from './ui.js';

/** Palabra que el administrador debe escribir para habilitar el reinicio. */
const PALABRA_CONFIRMACION = 'REINICIAR';

/** Referencias al DOM de esta pestaña. */
let dom = {};

/**
 * Inicializa la pestaña y engancha sus eventos.
 * @param {object} elementos referencias al DOM
 */
export function inicializar(elementos) {
  dom = elementos;

  // El botón sólo se habilita cuando la palabra coincide exactamente.
  dom.confirmacion.addEventListener('input', evaluarConfirmacion);
  dom.boton.addEventListener('click', manejarReinicio);
}

/**
 * Redibuja el resumen de lo que ocurriría al reiniciar.
 * @param {object|null} torneo
 */
export function renderizar(torneo) {
  if (!dom.resumen) return;

  if (!torneo) {
    dom.resumen.innerHTML = '';
    dom.boton.disabled = true;
    return;
  }

  const avance = calcularAvance(torneo);
  const participantes = listarParticipantes(torneo);

  dom.resumen.innerHTML = `
    <dl class="row mb-0 small">
      <dt class="col-sm-4">Torneo</dt>
      <dd class="col-sm-8">${escapar(torneo.nombre ?? 'Sin nombre')}</dd>

      <dt class="col-sm-4">Resultados cargados</dt>
      <dd class="col-sm-8">${avance.jugados} de ${avance.total} partidos</dd>

      <dt class="col-sm-4">Se conservan</dt>
      <dd class="col-sm-8">${participantes.length} participantes de la primera ronda</dd>
    </dl>`;

  dom.listaParticipantes.innerHTML = '';
  participantes.forEach((nombre) => {
    dom.listaParticipantes.appendChild(
      crearElemento('span', { clases: ['badge', 'text-bg-light', 'border'], texto: nombre })
    );
  });

  // Un cambio de torneo invalida cualquier confirmación ya escrita.
  dom.confirmacion.value = '';
  evaluarConfirmacion();
}

/** Habilita el botón sólo si la palabra de confirmación es exacta. */
function evaluarConfirmacion() {
  const coincide = dom.confirmacion.value.trim().toUpperCase() === PALABRA_CONFIRMACION;
  dom.boton.disabled = !coincide || !obtenerTorneo();
}

/**
 * Ejecuta el reinicio: limpia los resultados en memoria, confirma y publica.
 */
async function manejarReinicio() {
  const torneo = obtenerTorneo();
  const resultado = reiniciarTorneo(torneo);

  if (!resultado.ok) {
    mostrarToast(resultado.error, 'error');
    return;
  }

  if (resultado.partidosLimpiados === 0) {
    mostrarToast('El torneo ya está sin resultados: no hay nada que reiniciar.', 'info');
    return;
  }

  const confirmado = await confirmar({
    titulo: 'Reiniciar el torneo',
    mensaje: `Se borrarán los resultados de ${resultado.partidosLimpiados} partido(s).`,
    detalle:
      'Los participantes de la primera ronda se conservan y el resto del cuadro queda a definir. ' +
      'La versión actual seguirá disponible en el historial de commits del repositorio.',
    textoConfirmar: 'Reiniciar torneo',
    variante: 'danger',
  });
  if (!confirmado) return;

  alternarBotonOcupado(dom.boton, true, 'Reiniciando…');
  const publicacion = await publicar(resultado.torneo, CONFIG.github.mensajeCommitReinicio);
  alternarBotonOcupado(dom.boton, false);

  if (publicacion.ok) {
    dom.confirmacion.value = '';
    evaluarConfirmacion();
    mostrarToast(`Torneo reiniciado. Commit ${publicacion.commit.commit}.`, 'exito');
  } else {
    mostrarToast(publicacion.error, 'error');
  }
}
