/**
 * ui.js
 * ---------------------------------------------------------------------------
 * Capa de presentación. Es el único módulo que manipula el DOM.
 *
 * Contiene dos grupos de funciones:
 *   1. Componentes genéricos (spinner, toasts, alertas, modal de confirmación).
 *   2. El renderer del bracket, compartido por la página pública y el panel.
 *
 * No contiene reglas de negocio: consume la vista ya calculada por bracket.js.
 * El panel de administración inyecta sus controles mediante la opción `pie`,
 * de modo que existe una sola implementación del bracket para ambas páginas.
 */

import { CONFIG } from './config.js';
import { ESTADO, equipoDefinido } from './bracket.js';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * Escapa texto para insertarlo de forma segura en HTML.
 * Los nombres de equipo provienen de un JSON editable: nunca se interpolan sin
 * escapar.
 * @param {unknown} valor
 * @returns {string}
 */
export function escapar(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[caracter]));
}

/**
 * Crea un elemento con clases, atributos y contenido en una sola llamada.
 * @param {string} etiqueta
 * @param {{clases?: string[], texto?: string, html?: string, attrs?: object}} [opciones]
 * @returns {HTMLElement}
 */
export function crearElemento(etiqueta, opciones = {}) {
  const el = document.createElement(etiqueta);
  if (opciones.clases) el.classList.add(...opciones.clases);
  if (opciones.texto !== undefined) el.textContent = opciones.texto;
  if (opciones.html !== undefined) el.innerHTML = opciones.html;
  if (opciones.attrs) {
    for (const [nombre, valor] of Object.entries(opciones.attrs)) {
      el.setAttribute(nombre, valor);
    }
  }
  return el;
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) en formato legible en español.
 * Devuelve la cadena original si no se puede interpretar.
 * @param {string} iso
 * @returns {string}
 */
export function formatearFecha(iso) {
  if (!iso) return '';
  const fecha = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

/**
 * Muestra u oculta un spinner identificado por su elemento contenedor.
 * @param {HTMLElement|null} contenedor
 * @param {boolean} visible
 */
export function alternarSpinner(contenedor, visible) {
  if (!contenedor) return;
  contenedor.classList.toggle('d-none', !visible);
}

/**
 * Aplica o quita el estado "ocupado" de un botón, mostrando un spinner interno
 * y evitando envíos duplicados.
 * @param {HTMLButtonElement} boton
 * @param {boolean} ocupado
 * @param {string} [textoOcupado='Guardando…']
 */
export function alternarBotonOcupado(boton, ocupado, textoOcupado = 'Guardando…') {
  if (!boton) return;
  if (ocupado) {
    boton.dataset.textoOriginal = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML =
      `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${escapar(textoOcupado)}`;
  } else {
    boton.disabled = false;
    if (boton.dataset.textoOriginal) boton.innerHTML = boton.dataset.textoOriginal;
    delete boton.dataset.textoOriginal;
  }
}

// ---------------------------------------------------------------------------
// Toasts y mensajes
// ---------------------------------------------------------------------------

/** Contenedor de toasts, creado una única vez de forma perezosa. */
let contenedorToasts = null;

/** @returns {HTMLElement} el contenedor de toasts, creándolo si hace falta. */
function obtenerContenedorToasts() {
  if (contenedorToasts && document.body.contains(contenedorToasts)) return contenedorToasts;
  contenedorToasts = document.getElementById('contenedor-toasts');
  if (!contenedorToasts) {
    contenedorToasts = crearElemento('div', {
      clases: ['toast-container', 'position-fixed', 'bottom-0', 'end-0', 'p-3'],
      attrs: { id: 'contenedor-toasts' },
    });
    document.body.appendChild(contenedorToasts);
  }
  return contenedorToasts;
}

/**
 * Muestra un toast de Bootstrap. Reemplaza por completo el uso de alert().
 * @param {string} mensaje
 * @param {'exito'|'error'|'info'|'aviso'} [tipo='info']
 */
export function mostrarToast(mensaje, tipo = 'info') {
  const estilos = {
    exito: { fondo: 'text-bg-success', icono: '✓', titulo: 'Listo' },
    error: { fondo: 'text-bg-danger', icono: '✕', titulo: 'Error' },
    aviso: { fondo: 'text-bg-warning', icono: '!', titulo: 'Atención' },
    info: { fondo: 'text-bg-secondary', icono: 'i', titulo: 'Información' },
  };
  const estilo = estilos[tipo] || estilos.info;

  const toast = crearElemento('div', {
    clases: ['toast', 'align-items-center', 'border-0', estilo.fondo],
    attrs: { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' },
    html: `
      <div class="d-flex">
        <div class="toast-body">
          <strong class="me-1">${estilo.icono}</strong>
          <span class="visually-hidden">${escapar(estilo.titulo)}: </span>${escapar(mensaje)}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto"
                data-bs-dismiss="toast" aria-label="Cerrar"></button>
      </div>`,
  });

  obtenerContenedorToasts().appendChild(toast);
  const instancia = new bootstrap.Toast(toast, { delay: CONFIG.ui.duracionToast });
  toast.addEventListener('hidden.bs.toast', () => toast.remove());
  instancia.show();
}

/**
 * Renderiza un mensaje de error persistente dentro de un contenedor,
 * reemplazando su contenido. Se usa para fallos que impiden continuar.
 * @param {HTMLElement} contenedor
 * @param {string} titulo
 * @param {string} detalle
 */
export function mostrarErrorEnBloque(contenedor, titulo, detalle) {
  if (!contenedor) return;
  contenedor.innerHTML = '';
  contenedor.appendChild(
    crearElemento('div', {
      clases: ['alert', 'alert-danger', 'shadow-sm'],
      attrs: { role: 'alert' },
      html: `<h2 class="h6 alert-heading">${escapar(titulo)}</h2><p class="mb-0 small">${escapar(detalle)}</p>`,
    })
  );
}

/**
 * Muestra un mensaje inline dentro de un contenedor de alertas reutilizable.
 * @param {HTMLElement} contenedor
 * @param {string} mensaje
 * @param {'danger'|'success'|'warning'|'info'} [variante='danger']
 */
export function mostrarAlerta(contenedor, mensaje, variante = 'danger') {
  if (!contenedor) return;
  contenedor.className = `alert alert-${variante} py-2 small`;
  contenedor.textContent = mensaje;
  contenedor.classList.remove('d-none');
}

/**
 * Oculta el contenedor de alertas inline.
 * @param {HTMLElement} contenedor
 */
export function ocultarAlerta(contenedor) {
  if (contenedor) contenedor.classList.add('d-none');
}

// ---------------------------------------------------------------------------
// Modal de confirmación
// ---------------------------------------------------------------------------

/**
 * Muestra un modal de Bootstrap y resuelve con la decisión del usuario.
 * Sustituye a confirm(): no bloquea el hilo y respeta el diseño del sitio.
 *
 * @param {{titulo: string, mensaje: string, detalle?: string,
 *          textoConfirmar?: string, variante?: string}} opciones
 * @returns {Promise<boolean>} true si el usuario confirmó
 */
export function confirmar({ titulo, mensaje, detalle = '', textoConfirmar = 'Confirmar', variante = 'primary' }) {
  return new Promise((resolve) => {
    const modal = crearElemento('div', {
      clases: ['modal', 'fade'],
      attrs: { tabindex: '-1', 'aria-hidden': 'true' },
      html: `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title h6">${escapar(titulo)}</h2>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <p class="mb-${detalle ? '2' : '0'}">${escapar(mensaje)}</p>
              ${detalle ? `<div class="alert alert-warning py-2 mb-0 small">${escapar(detalle)}</div>` : ''}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-${variante}" data-accion="confirmar">${escapar(textoConfirmar)}</button>
            </div>
          </div>
        </div>`,
    });

    document.body.appendChild(modal);
    const instancia = new bootstrap.Modal(modal);
    let confirmado = false;

    modal.querySelector('[data-accion="confirmar"]').addEventListener('click', () => {
      confirmado = true;
      instancia.hide();
    });
    modal.addEventListener('hidden.bs.modal', () => {
      modal.remove();
      resolve(confirmado);
    });

    instancia.show();
  });
}

// ---------------------------------------------------------------------------
// Render del bracket
// ---------------------------------------------------------------------------

/** Clases de Bootstrap asociadas a cada estado de partido. */
const CLASES_ESTADO = {
  [ESTADO.FINALIZADO]: { card: 'partido--finalizado', badge: 'text-bg-success', etiqueta: 'Finalizado' },
  [ESTADO.LISTO]: { card: 'partido--listo', badge: 'text-bg-warning', etiqueta: 'Pendiente' },
  [ESTADO.PENDIENTE]: { card: 'partido--pendiente', badge: 'text-bg-warning', etiqueta: 'A definir' },
};

/**
 * Dibuja el bracket completo dentro de un contenedor.
 *
 * La cantidad de columnas, su ancho y la posición vertical de cada partido se
 * derivan de la vista: agregar o quitar rondas en el JSON no requiere cambios
 * acá ni en el CSS.
 *
 * @param {HTMLElement} contenedor
 * @param {object} vista resultado de bracket.crearVistaBracket()
 * @param {{pie?: (partido: object, ronda: object) => HTMLElement|null}} [opciones]
 *        `pie` permite al panel de administración inyectar controles debajo de
 *        cada tarjeta sin duplicar el renderer.
 */
export function renderizarBracket(contenedor, vista, opciones = {}) {
  contenedor.innerHTML = '';
  contenedor.style.setProperty('--total-rondas', vista.totalRondas);

  const grilla = crearElemento('div', { clases: ['bracket'] });

  vista.rondas.forEach((ronda) => {
    grilla.appendChild(renderizarRonda(ronda, opciones));
  });

  contenedor.appendChild(grilla);
}

/**
 * Dibuja una columna del bracket.
 * @param {object} ronda
 * @param {object} opciones
 * @returns {HTMLElement}
 */
function renderizarRonda(ronda, opciones) {
  const columna = crearElemento('section', {
    clases: ['bracket__ronda', ...(ronda.conectores ? ['bracket__ronda--conectada'] : [])],
    attrs: { 'aria-label': ronda.nombre },
  });

  columna.appendChild(
    crearElemento('h2', { clases: ['bracket__titulo'], texto: ronda.nombre })
  );

  const pista = crearElemento('div', { clases: ['bracket__pista'] });
  ronda.partidos.forEach((partido, indice) => {
    const slot = crearElemento('div', { clases: ['bracket__slot'] });
    slot.appendChild(renderizarPartido(partido, ronda, opciones));

    // Barra vertical que une el par de partidos que alimentan al mismo destino.
    // Se dibuja desde el slot par porque su centro dista exactamente una altura
    // de slot del centro del siguiente (todos los slots miden lo mismo).
    if (ronda.conectores && indice % 2 === 0) {
      slot.appendChild(crearElemento('span', { clases: ['bracket__union'], attrs: { 'aria-hidden': 'true' } }));
    }
    pista.appendChild(slot);
  });

  columna.appendChild(pista);
  return columna;
}

/**
 * Dibuja la tarjeta de un partido.
 * @param {object} partido
 * @param {object} ronda
 * @param {object} opciones
 * @returns {HTMLElement}
 */
function renderizarPartido(partido, ronda, opciones) {
  const estilo = CLASES_ESTADO[partido.estado];
  const card = crearElemento('article', {
    clases: ['card', 'partido', estilo.card, 'shadow-sm'],
    attrs: { 'data-partido': partido.id },
  });

  const cabecera = crearElemento('div', {
    clases: ['card-header', 'partido__cabecera'],
    html: `
      <span class="partido__id">#${escapar(partido.id)}</span>
      <span class="badge ${estilo.badge}">${escapar(estilo.etiqueta)}</span>`,
  });

  const cuerpo = crearElemento('div', { clases: ['card-body', 'partido__cuerpo'] });
  cuerpo.appendChild(renderizarLadoEquipo(partido, 1));
  cuerpo.appendChild(renderizarLadoEquipo(partido, 2));

  card.appendChild(cabecera);
  card.appendChild(cuerpo);

  // Punto de extensión: el panel de administración agrega acá su formulario.
  const pie = opciones.pie ? opciones.pie(partido, ronda) : null;
  if (pie) {
    const contenedorPie = crearElemento('div', { clases: ['card-footer', 'partido__pie'] });
    contenedorPie.appendChild(pie);
    card.appendChild(contenedorPie);
  }

  return card;
}

/**
 * Dibuja una de las dos filas de equipo de un partido.
 * @param {object} partido
 * @param {1|2} numero
 * @returns {HTMLElement}
 */
function renderizarLadoEquipo(partido, numero) {
  const nombre = numero === 1 ? partido.equipo1 : partido.equipo2;
  const score = numero === 1 ? partido.score1 : partido.score2;
  const definido = equipoDefinido(nombre);
  const esGanador = definido && partido.ganador === nombre;
  const esPerdedor = definido && equipoDefinido(partido.ganador) && !esGanador;

  const modificador = esGanador
    ? 'equipo--ganador'
    : esPerdedor
      ? 'equipo--perdedor'
      : definido
        ? 'equipo--neutral'
        : 'equipo--indefinido';

  return crearElemento('div', {
    clases: ['equipo', modificador],
    html: `
      <span class="equipo__nombre">${definido ? escapar(nombre) : 'A definir'}</span>
      <span class="equipo__score">${equipoDefinido(partido.ganador) ? escapar(score ?? 0) : '–'}</span>`,
  });
}

/**
 * Renderiza la cabecera del torneo: nombre, fecha, avance y campeón.
 * @param {HTMLElement} contenedor
 * @param {object} vista
 * @param {{jugados: number, total: number, porcentaje: number}} avance
 */
export function renderizarEncabezado(contenedor, vista, avance) {
  if (!contenedor) return;
  const fecha = formatearFecha(vista.fecha);

  contenedor.innerHTML = `
    <h1 class="h3 mb-1">${escapar(vista.nombre)}</h1>
    ${fecha ? `<p class="text-body-secondary mb-3">${escapar(fecha)}</p>` : ''}
    <div class="d-flex flex-wrap align-items-center gap-3">
      <div class="flex-grow-1" style="min-width: 12rem; max-width: 24rem;">
        <div class="progress" role="progressbar" aria-label="Avance del torneo"
             aria-valuenow="${avance.porcentaje}" aria-valuemin="0" aria-valuemax="100" style="height: .5rem;">
          <div class="progress-bar bg-success" style="width: ${avance.porcentaje}%"></div>
        </div>
      </div>
      <span class="small text-body-secondary">
        ${avance.jugados} de ${avance.total} partidos disputados
      </span>
      ${vista.campeon
        ? `<span class="badge text-bg-success fs-6">🏆 Campeón: ${escapar(vista.campeon)}</span>`
        : ''}
    </div>`;
}
