/**
 * github.js
 * ---------------------------------------------------------------------------
 * Único punto de acceso a la GitHub REST API. Implementado con Fetch API, sin
 * librerías externas.
 *
 * Encapsula por completo el flujo de escritura:
 *   leer SHA actual → serializar → codificar en Base64 → PUT /contents → commit
 *
 * El resto de la aplicación sólo conoce `actualizarTorneo(json)`; ni el panel
 * ni el dominio saben qué es un SHA o un blob de contenidos.
 *
 * Documentación: https://docs.github.com/rest/repos/contents
 */

import { CONFIG } from './config.js';
import { obtenerToken } from './storage.js';

/** Error con un mensaje ya redactado para el usuario final. */
export class ErrorGitHub extends Error {
  /**
   * @param {string} mensaje
   * @param {number} [status] código HTTP devuelto por la API
   */
  constructor(mensaje, status) {
    super(mensaje);
    this.name = 'ErrorGitHub';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** @returns {string} URL del endpoint de contenidos del JSON del torneo. */
function urlContenidos() {
  const { apiBase, usuario, repositorio, rutaJson } = CONFIG.github;
  return `${apiBase}/repos/${usuario}/${repositorio}/contents/${rutaJson}`;
}

/**
 * Cabeceras comunes a toda llamada autenticada.
 * @returns {Record<string, string>}
 * @throws {ErrorGitHub} si no hay token disponible
 */
function cabeceras() {
  const token = obtenerToken();
  if (!token) {
    throw new ErrorGitHub(
      'No hay un token de GitHub cargado. Cerrá sesión y volvé a ingresar incluyendo el token.'
    );
  }
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/**
 * Traduce un error HTTP de la API en un mensaje accionable en español.
 * @param {number} status
 * @param {object} cuerpo respuesta JSON de la API (puede estar vacía)
 * @returns {ErrorGitHub}
 */
function traducirError(status, cuerpo) {
  const { usuario, repositorio, branch, rutaJson } = CONFIG.github;
  const detalle = cuerpo?.message ? ` (${cuerpo.message})` : '';

  const mensajes = {
    401: 'El token de GitHub es inválido o expiró. Generá uno nuevo y volvé a iniciar sesión.',
    403: `El token no tiene permiso de escritura sobre ${usuario}/${repositorio}, o se alcanzó el límite de la API.`,
    404: `No se encontró ${usuario}/${repositorio}/${rutaJson} en la rama "${branch}". Revisá la configuración y los permisos del token.`,
    409: 'El archivo cambió en GitHub mientras editabas. Recargá el torneo y aplicá el cambio de nuevo.',
    422: 'GitHub rechazó el commit: el archivo fue modificado por otra persona o la rama no existe.',
  };

  return new ErrorGitHub((mensajes[status] || `GitHub respondió con un error ${status}.`) + detalle, status);
}

/**
 * Ejecuta una llamada a la API y normaliza el manejo de errores.
 * @param {string} url
 * @param {RequestInit} [opciones]
 * @returns {Promise<object>} cuerpo JSON de la respuesta
 * @throws {ErrorGitHub}
 */
async function llamar(url, opciones = {}) {
  // Fuera del try: si falta el token debe propagarse ese error y no quedar
  // enmascarado como un problema de conectividad.
  const headers = cabeceras();

  let respuesta;
  try {
    respuesta = await fetch(url, { ...opciones, headers });
  } catch (error) {
    throw new ErrorGitHub('No se pudo contactar la API de GitHub. Verificá tu conexión a internet.');
  }

  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw traducirError(respuesta.status, cuerpo);
  return cuerpo;
}

/**
 * Codifica una cadena UTF-8 en Base64.
 *
 * `btoa` sólo acepta Latin-1, por lo que los acentos y símbolos de los nombres
 * de equipo romperían la codificación. Se convierte primero a bytes UTF-8 y se
 * procesa por bloques para no desbordar la pila con archivos grandes.
 *
 * @param {string} texto
 * @returns {string} contenido en Base64
 */
function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  const TAMANIO_BLOQUE = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += TAMANIO_BLOQUE) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TAMANIO_BLOQUE));
  }
  return btoa(binario);
}

// ---------------------------------------------------------------------------
// API pública del módulo
// ---------------------------------------------------------------------------

/**
 * Lee el archivo del torneo directamente desde la API (no desde GitHub Pages).
 * Devuelve el SHA, necesario para poder commitear encima sin perder cambios.
 *
 * @returns {Promise<{sha: string, contenido: object}>}
 * @throws {ErrorGitHub}
 */
export async function obtenerArchivoTorneo() {
  const url = `${urlContenidos()}?ref=${encodeURIComponent(CONFIG.github.branch)}&t=${Date.now()}`;
  const datos = await llamar(url, { method: 'GET' });

  let contenido = null;
  try {
    // La API devuelve el contenido en Base64 con saltos de línea intercalados.
    const texto = new TextDecoder().decode(
      Uint8Array.from(atob(datos.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))
    );
    contenido = JSON.parse(texto);
  } catch (error) {
    throw new ErrorGitHub('El archivo del torneo en GitHub no contiene un JSON legible.');
  }

  return { sha: datos.sha, contenido };
}

/**
 * Persiste el torneo en el repositorio creando un commit.
 *
 * Flujo completo: lee el SHA vigente, serializa el JSON, lo codifica y lo envía
 * con PUT. Si otro commit se coló entre la lectura y la escritura (409/422),
 * reintenta una vez con el SHA actualizado; si el conflicto persiste, informa
 * al usuario en lugar de sobrescribir a ciegas.
 *
 * @param {object} json torneo completo a guardar
 * @param {string} [mensaje] mensaje de commit; por defecto el de la config
 * @returns {Promise<{commit: string, url: string}>} sha corto y URL del commit
 * @throws {ErrorGitHub}
 */
export async function actualizarTorneo(json, mensaje) {
  const mensajeCommit = mensaje || CONFIG.github.mensajeCommit.replace('{partido}', 'el torneo');
  const contenido = aBase64(`${JSON.stringify(json, null, 2)}\n`);

  /**
   * @param {number} intento
   * @returns {Promise<{commit: string, url: string}>}
   */
  const intentarGuardar = async (intento) => {
    const { sha } = await obtenerArchivoTorneo();

    try {
      const respuesta = await llamar(urlContenidos(), {
        method: 'PUT',
        body: JSON.stringify({
          message: mensajeCommit,
          content: contenido,
          sha,
          branch: CONFIG.github.branch,
        }),
      });

      return {
        commit: respuesta.commit.sha.substring(0, 7),
        url: respuesta.commit.html_url,
      };
    } catch (error) {
      const conflicto = error instanceof ErrorGitHub && (error.status === 409 || error.status === 422);
      if (conflicto && intento === 0) return intentarGuardar(1);
      throw error;
    }
  };

  return intentarGuardar(0);
}

/**
 * Verifica que el token tenga acceso de escritura al repositorio configurado.
 * Se usa al iniciar sesión para fallar temprano y con un mensaje claro, en
 * lugar de descubrirlo recién al guardar el primer resultado.
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function verificarAcceso() {
  const { apiBase, usuario, repositorio } = CONFIG.github;
  try {
    const repo = await llamar(`${apiBase}/repos/${usuario}/${repositorio}`, { method: 'GET' });
    if (!repo.permissions?.push) {
      return { ok: false, error: `El token no tiene permiso de escritura sobre ${usuario}/${repositorio}.` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
