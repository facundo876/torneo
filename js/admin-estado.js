/**
 * admin-estado.js
 * ---------------------------------------------------------------------------
 * Estado compartido del panel de administración.
 *
 * Existe porque las tres pestañas (resultados, equipos, reinicio) necesitan lo
 * mismo: leer el torneo vigente, publicar una versión nueva en GitHub y avisar
 * al resto de la interfaz que se redibuje. Sin este módulo, ese flujo estaría
 * duplicado tres veces y las pestañas podrían quedar mostrando datos distintos.
 *
 * No toca el DOM: expone datos y notifica cambios. Quién se suscribe decide qué
 * dibujar.
 *
 * Regla de oro: el estado local se adopta SÓLO si el commit en GitHub salió
 * bien. Así lo que se ve en pantalla siempre coincide con lo que está publicado.
 */

import { cargarTorneo } from './storage.js';
import { actualizarTorneo } from './github.js';

/** Torneo vigente, tal como está publicado. @type {object|null} */
let torneoActual = null;

/** Suscriptores notificados ante cada cambio. @type {Set<Function>} */
const suscriptores = new Set();

/**
 * Registra un observador que se ejecuta cada vez que el torneo cambia.
 * @param {(torneo: object) => void} callback
 * @returns {() => void} función para darse de baja
 */
export function suscribir(callback) {
  suscriptores.add(callback);
  return () => suscriptores.delete(callback);
}

/** Notifica a todos los suscriptores con el torneo vigente. */
function notificar() {
  suscriptores.forEach((callback) => callback(torneoActual));
}

/** @returns {object|null} el torneo vigente. */
export function obtenerTorneo() {
  return torneoActual;
}

/**
 * Lee el torneo publicado y notifica a los suscriptores.
 * @returns {Promise<object>} el torneo cargado
 * @throws {ErrorDeCarga} si no se pudo leer o el JSON es inválido
 */
export async function recargar() {
  torneoActual = await cargarTorneo();
  notificar();
  return torneoActual;
}

/**
 * Publica una versión nueva del torneo y, si el commit tiene éxito, la adopta
 * como estado vigente y redibuja la interfaz.
 *
 * Es el único camino de escritura del panel: centralizar acá el commit evita
 * que cada pestaña reimplemente el manejo de errores y la sincronización.
 *
 * @param {object} torneoNuevo
 * @param {string} mensajeCommit
 * @returns {Promise<{ok: boolean, commit?: object, error?: string}>}
 */
export async function publicar(torneoNuevo, mensajeCommit) {
  try {
    const commit = await actualizarTorneo(torneoNuevo, mensajeCommit);
    torneoActual = torneoNuevo;
    notificar();
    return { ok: true, commit };
  } catch (error) {
    // El estado local no se toca: sigue reflejando lo que hay publicado.
    console.error('[admin-estado] Falló la publicación:', error);
    return { ok: false, error: error.message };
  }
}

/** Descarta el estado en memoria. Se usa al cerrar sesión. */
export function limpiar() {
  torneoActual = null;
  notificar();
}
