/**
 * admin.js
 * ---------------------------------------------------------------------------
 * Orquestador del panel de administración (admin.html).
 *
 * Coordina los módulos sin implementar reglas propias:
 *   auth.js     → quién puede entrar
 *   storage.js  → de dónde se leen los datos
 *   bracket.js  → qué significa cargar un resultado
 *   github.js   → cómo se persiste
 *   ui.js       → cómo se muestra
 *
 * Flujo de guardado de un partido:
 *   validar → aplicar en memoria (con propagación y cascada) → confirmar →
 *   commitear en GitHub → refrescar la vista.
 */

import { CONFIG } from './config.js';
import { iniciarSesion, cerrarSesion, exigirSesion } from './auth.js';
import { cargarTorneo, obtenerToken } from './storage.js';
import { aplicarResultado, crearVistaBracket, calcularAvance, ESTADO } from './bracket.js';
import { actualizarTorneo, verificarAcceso } from './github.js';
import {
  renderizarBracket,
  renderizarEncabezado,
  alternarSpinner,
  alternarBotonOcupado,
  mostrarToast,
  mostrarErrorEnBloque,
  mostrarAlerta,
  ocultarAlerta,
  confirmar,
  crearElemento,
  escapar,
} from './ui.js';

/** Referencias al DOM. */
const dom = {
  vistaLogin: document.getElementById('vista-login'),
  vistaPanel: document.getElementById('vista-panel'),
  formLogin: document.getElementById('form-login'),
  inputUsuario: document.getElementById('input-usuario'),
  inputPassword: document.getElementById('input-password'),
  grupoToken: document.getElementById('grupo-token'),
  inputToken: document.getElementById('input-token'),
  alertaLogin: document.getElementById('alerta-login'),
  botonLogin: document.getElementById('boton-login'),
  botonSalir: document.getElementById('boton-salir'),
  botonRecargar: document.getElementById('boton-recargar'),
  spinner: document.getElementById('spinner'),
  encabezado: document.getElementById('encabezado-torneo'),
  bracket: document.getElementById('contenedor-bracket'),
};

/**
 * Estado de la aplicación. Único objeto mutable del módulo: mantener el torneo
 * en un solo lugar evita que la vista y los datos se desincronicen.
 * @type {{torneo: object|null}}
 */
const estado = { torneo: null };

// ---------------------------------------------------------------------------
// Arranque y control de acceso
// ---------------------------------------------------------------------------

/**
 * Punto de entrada. La guardia decide qué vista se construye: el panel no se
 * renderiza jamás sin sesión activa.
 */
function iniciar() {
  // El campo de token sólo se pide si config.js no trae uno preconfigurado.
  if (CONFIG.github.token) dom.grupoToken.classList.add('d-none');

  dom.formLogin.addEventListener('submit', manejarLogin);
  dom.botonSalir.addEventListener('click', manejarLogout);
  dom.botonRecargar.addEventListener('click', () => cargarYRenderizar({ avisar: true }));

  exigirSesion(abrirPanel, mostrarLogin);
}

/** Muestra el formulario de acceso y oculta el panel. */
function mostrarLogin() {
  dom.vistaPanel.classList.add('d-none');
  dom.vistaLogin.classList.remove('d-none');
  dom.inputUsuario.focus();
}

/** Muestra el panel y dispara la carga inicial del torneo. */
function abrirPanel() {
  dom.vistaLogin.classList.add('d-none');
  dom.vistaPanel.classList.remove('d-none');
  cargarYRenderizar();
}

/**
 * Valida las credenciales y, si hay token, comprueba el acceso al repositorio
 * antes de dejar entrar: es preferible fallar en el login que al primer commit.
 * @param {SubmitEvent} evento
 */
async function manejarLogin(evento) {
  evento.preventDefault();
  ocultarAlerta(dom.alertaLogin);

  const resultado = iniciarSesion(
    dom.inputUsuario.value,
    dom.inputPassword.value,
    dom.inputToken?.value ?? ''
  );

  if (!resultado.ok) {
    mostrarAlerta(dom.alertaLogin, resultado.error);
    return;
  }

  alternarBotonOcupado(dom.botonLogin, true, 'Verificando…');
  try {
    if (obtenerToken()) {
      const acceso = await verificarAcceso();
      if (!acceso.ok) {
        cerrarSesion();
        mostrarAlerta(dom.alertaLogin, acceso.error);
        return;
      }
    }
    dom.formLogin.reset();
    abrirPanel();
  } finally {
    alternarBotonOcupado(dom.botonLogin, false);
  }
}

/** Cierra la sesión, descarta el token y vuelve al login. */
function manejarLogout() {
  cerrarSesion();
  estado.torneo = null;
  dom.bracket.innerHTML = '';
  mostrarLogin();
  mostrarToast('Sesión cerrada.', 'info');
}

// ---------------------------------------------------------------------------
// Carga y render
// ---------------------------------------------------------------------------

/**
 * Trae el torneo publicado y redibuja el panel.
 * @param {{avisar?: boolean}} [opciones] avisar: muestra un toast al terminar
 */
async function cargarYRenderizar({ avisar = false } = {}) {
  alternarSpinner(dom.spinner, true);
  try {
    estado.torneo = await cargarTorneo();
    renderizar();
    if (avisar) mostrarToast('Torneo actualizado desde el repositorio.', 'exito');
  } catch (error) {
    mostrarErrorEnBloque(dom.bracket, 'No se pudo cargar el torneo', error.message);
    console.error('[admin] Error al cargar el torneo:', error);
  } finally {
    alternarSpinner(dom.spinner, false);
  }
}

/** Redibuja encabezado y bracket a partir del estado actual. */
function renderizar() {
  const vista = crearVistaBracket(estado.torneo);
  renderizarEncabezado(dom.encabezado, vista, calcularAvance(estado.torneo));
  renderizarBracket(dom.bracket, vista, { pie: crearFormularioPartido });
}

// ---------------------------------------------------------------------------
// Formulario de carga de resultados
// ---------------------------------------------------------------------------

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
  const resultado = aplicarResultado(estado.torneo, partido.id, score1, score2);
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

  // 3. Persistir en GitHub. Sólo si el commit sale bien se adopta el estado.
  alternarBotonOcupado(boton, true);
  try {
    const commit = await actualizarTorneo(
      resultado.torneo,
      CONFIG.github.mensajeCommit.replace(
        '{partido}',
        `${partido.equipo1} vs ${partido.equipo2} (${score1}-${score2})`
      )
    );

    estado.torneo = resultado.torneo;
    renderizar();
    mostrarToast(`Guardado. Commit ${commit.commit} publicado; GitHub Pages tarda un momento.`, 'exito');
  } catch (error) {
    mostrarToast(error.message, 'error');
    console.error('[admin] Error al guardar en GitHub:', error);
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

iniciar();
