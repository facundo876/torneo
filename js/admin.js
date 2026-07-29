/**
 * admin.js
 * ---------------------------------------------------------------------------
 * Orquestador del panel de administración (admin.html).
 *
 * Responsabilidad acotada: arranque, control de acceso, carga inicial y
 * conexión entre el estado compartido y los controladores de cada pestaña.
 * La lógica de cada pantalla vive en su propio módulo:
 *
 *   admin-resultados.js  carga de marcadores
 *   admin-equipos.js     carga masiva de participantes
 *   admin-reinicio.js    reinicio del torneo
 *
 * Todos leen y escriben a través de admin-estado.js, que garantiza que las tres
 * pestañas vean siempre el mismo torneo.
 */

import { CONFIG } from './config.js';
import { iniciarSesion, cerrarSesion, exigirSesion } from './auth.js';
import { obtenerToken } from './storage.js';
import { verificarAcceso } from './github.js';
import { suscribir, recargar, limpiar } from './admin-estado.js';
import * as resultados from './admin-resultados.js';
import * as equipos from './admin-equipos.js';
import * as reinicio from './admin-reinicio.js';
import {
  alternarSpinner,
  alternarBotonOcupado,
  mostrarToast,
  mostrarErrorEnBloque,
  mostrarAlerta,
  ocultarAlerta,
} from './ui.js';

/** Referencias al DOM comunes al panel. */
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
  bracket: document.getElementById('contenedor-bracket'),
};

/**
 * Controladores de pestaña. Cada uno expone `inicializar(dom)` y
 * `renderizar(torneo)`: un contrato uniforme que permite tratarlos en conjunto.
 */
const pestanias = [resultados, equipos, reinicio];

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
  dom.botonRecargar.addEventListener('click', () => cargarTorneo({ avisar: true }));

  exigirSesion(abrirPanel, mostrarLogin);
}

/** Muestra el formulario de acceso y oculta el panel. */
function mostrarLogin() {
  dom.vistaPanel.classList.add('d-none');
  dom.vistaLogin.classList.remove('d-none');
  dom.inputUsuario.focus();
}

/**
 * Construye el panel: inicializa las pestañas, las suscribe al estado y dispara
 * la carga inicial. Todo esto ocurre sólo con sesión válida.
 */
function abrirPanel() {
  dom.vistaLogin.classList.add('d-none');
  dom.vistaPanel.classList.remove('d-none');

  inicializarPestanias();

  // Un único punto de re-render: cuando el estado cambia, todas las pestañas se
  // actualizan, sin importar cuál originó el cambio.
  suscribir((torneo) => pestanias.forEach((pestania) => pestania.renderizar(torneo)));

  cargarTorneo();
}

/** Entrega a cada controlador las referencias del DOM que le corresponden. */
function inicializarPestanias() {
  resultados.inicializar({
    encabezado: document.getElementById('encabezado-torneo'),
    bracket: dom.bracket,
  });

  equipos.inicializar({
    nombre: document.getElementById('input-nombre-torneo'),
    fecha: document.getElementById('input-fecha-torneo'),
    textarea: document.getElementById('input-equipos'),
    resumen: document.getElementById('resumen-equipos'),
    avisos: document.getElementById('avisos-equipos'),
    preview: document.getElementById('preview-bracket'),
    botonCompletar: document.getElementById('boton-completar-cuadro'),
    botonCargarActuales: document.getElementById('boton-cargar-actuales'),
    botonPublicar: document.getElementById('boton-publicar-cuadro'),
  });

  reinicio.inicializar({
    resumen: document.getElementById('resumen-reinicio'),
    listaParticipantes: document.getElementById('participantes-conservados'),
    confirmacion: document.getElementById('input-confirmacion-reinicio'),
    boton: document.getElementById('boton-reiniciar'),
  });
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

/** Cierra la sesión, descarta el token y el estado, y vuelve al login. */
function manejarLogout() {
  cerrarSesion();
  limpiar();
  dom.bracket.innerHTML = '';
  mostrarLogin();
  mostrarToast('Sesión cerrada.', 'info');
}

// ---------------------------------------------------------------------------
// Carga de datos
// ---------------------------------------------------------------------------

/**
 * Trae el torneo publicado. El store notifica a las pestañas, así que acá sólo
 * se maneja el spinner y el error.
 * @param {{avisar?: boolean}} [opciones] avisar: muestra un toast al terminar
 */
async function cargarTorneo({ avisar = false } = {}) {
  alternarSpinner(dom.spinner, true);
  try {
    await recargar();
    if (avisar) mostrarToast('Torneo actualizado desde el repositorio.', 'exito');
  } catch (error) {
    mostrarErrorEnBloque(dom.bracket, 'No se pudo cargar el torneo', error.message);
    console.error('[admin] Error al cargar el torneo:', error);
  } finally {
    alternarSpinner(dom.spinner, false);
  }
}

iniciar();
