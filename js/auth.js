/**
 * auth.js
 * ---------------------------------------------------------------------------
 * Autenticación del panel de administración.
 *
 * Se trata de una validación puramente cosmética que ocurre en el navegador:
 * su objetivo es evitar ediciones accidentales, NO impedir el acceso de un
 * atacante. Las credenciales viajan en el bundle público. La seguridad real la
 * aporta el token de GitHub, que es lo único que la API valida.
 * Ver la sección "Seguridad" del README.
 *
 * Este módulo no toca el DOM: expone decisiones, no pantallas.
 */

import { CONFIG } from './config.js';
import { marcarSesionIniciada, limpiarSesion, haySesion, guardarToken } from './storage.js';

/**
 * Valida las credenciales del administrador y, si son correctas, abre la
 * sesión en la pestaña actual.
 *
 * @param {string} usuario
 * @param {string} password
 * @param {string} [token] token de GitHub opcional; se guarda sólo si config.js
 *        no trae uno preconfigurado
 * @returns {{ok: boolean, error?: string}}
 */
export function iniciarSesion(usuario, password, token = '') {
  const usuarioNormalizado = String(usuario ?? '').trim();

  if (!usuarioNormalizado || !password) {
    return { ok: false, error: 'Ingresá usuario y contraseña.' };
  }
  if (usuarioNormalizado !== CONFIG.admin.usuario || password !== CONFIG.admin.password) {
    return { ok: false, error: 'Usuario o contraseña incorrectos.' };
  }

  marcarSesionIniciada();
  if (token) guardarToken(token.trim());

  return { ok: true };
}

/** Cierra la sesión y descarta el token cargado en la pestaña. */
export function cerrarSesion() {
  limpiarSesion();
}

/** @returns {boolean} true si la pestaña tiene una sesión de administrador. */
export function estaAutenticado() {
  return haySesion();
}

/**
 * Guardia de acceso: ejecuta `alPermitir` si hay sesión y `alDenegar` si no.
 *
 * El panel se construye dentro de `alPermitir`, de modo que su marcado nunca
 * llega a existir en el DOM mientras no haya sesión.
 *
 * @param {() => void} alPermitir
 * @param {() => void} alDenegar
 */
export function exigirSesion(alPermitir, alDenegar) {
  if (estaAutenticado()) {
    alPermitir();
  } else {
    alDenegar();
  }
}
