/**
 * storage.js
 * ---------------------------------------------------------------------------
 * Acceso a datos persistentes desde el navegador.
 *
 * Cubre dos orígenes:
 *   - El JSON del torneo publicado por GitHub Pages (sólo lectura).
 *   - `sessionStorage`, para el flag de sesión y el token de GitHub.
 *
 * La escritura del torneo NO vive acá: es responsabilidad de github.js, porque
 * implica autenticación y una API remota con semántica propia.
 */

import { CONFIG } from './config.js';
import { validarEstructura } from './bracket.js';

/**
 * Error de dominio para fallos de carga. Permite a los orquestadores
 * distinguir un problema de datos de cualquier otra excepción.
 */
export class ErrorDeCarga extends Error {
  /**
   * @param {string} mensaje mensaje apto para mostrar al usuario
   * @param {Error} [causa]
   */
  constructor(mensaje, causa) {
    super(mensaje);
    this.name = 'ErrorDeCarga';
    this.causa = causa;
  }
}

/**
 * Carga el torneo desde el archivo publicado.
 *
 * GitHub Pages cachea los assets de forma agresiva; se agrega un parámetro de
 * invalidación y `cache: 'no-store'` para que el panel siempre trabaje sobre la
 * versión más reciente y no pise un commit ajeno.
 *
 * @returns {Promise<object>} el torneo validado
 * @throws {ErrorDeCarga}
 */
export async function cargarTorneo() {
  const url = `${CONFIG.datos.rutaLocal}?v=${Date.now()}`;

  let respuesta;
  try {
    respuesta = await fetch(url, { cache: 'no-store' });
  } catch (error) {
    throw new ErrorDeCarga(
      'No se pudo contactar el servidor para leer los datos del torneo. Verificá tu conexión.',
      error
    );
  }

  if (!respuesta.ok) {
    throw new ErrorDeCarga(
      `No se encontró el archivo del torneo en "${CONFIG.datos.rutaLocal}" (HTTP ${respuesta.status}).`
    );
  }

  let datos;
  try {
    datos = await respuesta.json();
  } catch (error) {
    throw new ErrorDeCarga(
      'El archivo del torneo existe pero no es un JSON válido. Revisá su sintaxis.',
      error
    );
  }

  const validacion = validarEstructura(datos);
  if (!validacion.valido) {
    throw new ErrorDeCarga(validacion.error);
  }

  return datos;
}

// ---------------------------------------------------------------------------
// Sesión del administrador
// ---------------------------------------------------------------------------

/**
 * Marca la sesión como iniciada.
 * `sessionStorage` se elige a propósito sobre `localStorage`: la sesión muere
 * al cerrar la pestaña.
 */
export function marcarSesionIniciada() {
  sessionStorage.setItem(CONFIG.claves.sesion, 'true');
}

/** Borra el flag de sesión y el token asociado. */
export function limpiarSesion() {
  sessionStorage.removeItem(CONFIG.claves.sesion);
  sessionStorage.removeItem(CONFIG.claves.token);
}

/** @returns {boolean} true si hay una sesión activa en esta pestaña. */
export function haySesion() {
  return sessionStorage.getItem(CONFIG.claves.sesion) === 'true';
}

// ---------------------------------------------------------------------------
// Token de GitHub
// ---------------------------------------------------------------------------

/**
 * Guarda el token de escritura para la pestaña actual.
 * @param {string} token
 */
export function guardarToken(token) {
  sessionStorage.setItem(CONFIG.claves.token, token);
}

/**
 * Devuelve el token disponible: el configurado en config.js si existe, o el
 * que el administrador cargó al iniciar sesión.
 * @returns {string} cadena vacía si no hay ninguno
 */
export function obtenerToken() {
  return CONFIG.github.token || sessionStorage.getItem(CONFIG.claves.token) || '';
}
