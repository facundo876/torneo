/**
 * admin-resultados.js
 * ---------------------------------------------------------------------------
 * Controlador de la pestaña "Resultados": carga de marcadores partido por
 * partido.
 *
 * Coordina el dominio (bracket.js), el render (ui.js) y el estado compartido
 * (admin-estado.js). No implementa reglas ni habla con GitHub directamente.
 */

import { CONFIG } from './config.js';
import { aplicarResultado, crearVistaBracket, calcularAvance, ESTADO } from './bracket.js';
import { obtenerTorneo, publicar } from './admin-estado.js';
import {
  renderizarBracket,
  renderizarEncabezado,
  alternarBotonOcupado,
  mostrarToast,
  confirmar,
  crearElemento,
  escapar,
} from './ui.js';

/** Referencias al DOM de esta pestaña. */
let dom = {};

/**
 * Inicializa la pestaña. Se llama una vez, después de validar la sesión.
 * @param {{encabezado: HTMLElement, bracket: HTMLElement}} elementos
 */
export function inicializar(elementos) {
  dom = elementos;
}

/**
 * Redibuja el bracket editable. La invoca el orquestador ante cada cambio de
 * estado.
 * @param {object|null} torneo
 */
export function renderizar(torneo) {
  if (!torneo || !dom.bracket) return;
  const vista = crearVistaBracket(torneo);
  renderizarEncabezado(dom.encabezado, vista, calcularAvance(torneo));
  renderizarBracket(dom.bracket, vista, { pie: crearFormularioPartido });
}

/**
 * Construye el formulario que se inyecta al pie de cada tarjeta.
 *
 * Los partidos sin ambos participantes definidos no son editables: en su lugar
 * se muestra una leyenda, porque cargar un resultado ahí no tiene sentido.
 *
 * @param {object} partido partido de la vista
 * @returns {HTMLElement}
 */
function crearFormularioPartido(partido) {
  if (partido.estado === ESTADO.PENDIENTE) {
    return crearElemento('p', {
      clases: ['small', 'text-body-secondary', 'mb-0'],
      texto: 'Esperando a los clasificados de la ronda anterior.',
    });
  }

  const formulario = crearElemento('form', {
    clases: ['partido__form'],
    attrs: { 'data-partido': partido.id, novalidate: '' },
    html: `
      <div class="partido__scores">
        <label class="visually-hidden" for="score1-${escapar(partido.id)}">Marcador de ${escapar(partido.equipo1)}</label>
        <input class="form-control form-control-sm" type="number" min="0" step="1" inputmode="numeric"
               id="score1-${escapar(partido.id)}" name="score1" value="${escapar(partido.score1 ?? 0)}" required>
        <span class="partido__separador" aria-hidden="true">–</span>
        <label class="visually-hidden" for="score2-${escapar(partido.id)}">Marcador de ${escapar(partido.equipo2)}</label>
        <input class="form-control form-control-sm" type="number" min="0" step="1" inputmode="numeric"
               id="score2-${escapar(partido.id)}" name="score2" value="${escapar(partido.score2 ?? 0)}" required>
      </div>
      <button type="submit" class="btn btn-sm btn-primary w-100 mt-2">Guardar</button>`,
  });

  formulario.addEventListener('submit', (evento) => manejarGuardado(evento, partido));
  return formulario;
}

/**
 * Maneja el guardado de un partido de punta a punta.
 * @param {SubmitEvent} evento
 * @param {object} partido
 */
async function manejarGuardado(evento, partido) {
  evento.preventDefault();

  const formulario = evento.currentTarget;
  const boton = formulario.querySelector('button[type="submit"]');
  const score1 = Number.parseInt(formulario.elements.score1.value, 10);
  const score2 = Number.parseInt(formulario.elements.score2.value, 10);

  // 1. Aplicar el resultado en memoria. El dominio valida y propaga.
  const resultado = aplicarResultado(obtenerTorneo(), partido.id, score1, score2);
  if (!resultado.ok) {
    mostrarToast(resultado.error, 'error');
    return;
  }

  // 2. Confirmar, advirtiendo si el cambio invalida resultados posteriores.
  const confirmado = await confirmar({
    titulo: 'Confirmar resultado',
    mensaje: `${partido.equipo1} ${score1} – ${score2} ${partido.equipo2}. Gana ${resultado.ganador}.`,
    detalle: describirConsecuencias(resultado),
    textoConfirmar: 'Guardar y commitear',
  });
  if (!confirmado) return;

  // 3. Publicar. El store adopta el estado sólo si el commit sale bien y
  //    dispara el re-render, que reemplaza este formulario por uno nuevo.
  alternarBotonOcupado(boton, true);
  const publicacion = await publicar(
    resultado.torneo,
    CONFIG.github.mensajeCommit.replace(
      '{partido}',
      `${partido.equipo1} vs ${partido.equipo2} (${score1}-${score2})`
    )
  );

  if (publicacion.ok) {
    mostrarToast(
      `Guardado. Commit ${publicacion.commit.commit} publicado; GitHub Pages tarda un momento.`,
      'exito'
    );
  } else {
    mostrarToast(publicacion.error, 'error');
    alternarBotonOcupado(boton, false);
  }
}

/**
 * Redacta la advertencia que acompaña a la confirmación cuando el cambio
 * arrastra consecuencias sobre otros partidos.
 * @param {{avanzaA: object|null, ganador: string, invalidados: object[]}} resultado
 * @returns {string} cadena vacía si no hay nada que advertir
 */
function describirConsecuencias(resultado) {
  const partes = [];

  if (resultado.avanzaA) {
    partes.push(`${resultado.ganador} avanza al partido #${resultado.avanzaA.id}.`);
  } else {
    partes.push(`${resultado.ganador} se consagra campeón del torneo.`);
  }

  if (resultado.invalidados.length > 0) {
    const ids = resultado.invalidados.map((p) => `#${p.id}`).join(', ');
    partes.push(
      `Cambia el clasificado, así que se borrarán los resultados de ${resultado.invalidados.length} ` +
      `partido(s) posterior(es): ${ids}.`
    );
  }

  return partes.join(' ');
}
