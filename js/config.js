/**
 * config.js
 * ---------------------------------------------------------------------------
 * Única fuente de configuración de la aplicación.
 *
 * Ningún otro módulo debe declarar constantes de entorno (usuario de GitHub,
 * repositorio, credenciales, rutas). Si un valor hace falta en dos lugares,
 * vive acá y se importa.
 *
 * IMPORTANTE — TOKEN DE GITHUB
 * Este sitio es 100 % estático: todo lo que se escriba en este archivo queda
 * publicado y es legible por cualquier visitante. Por eso `github.token` se
 * deja vacío de forma deliberada y el panel de administración lo solicita al
 * iniciar sesión, guardándolo únicamente en `sessionStorage` (se borra al
 * cerrar la pestaña). Ver la sección "Seguridad" del README.
 */

export const CONFIG = Object.freeze({
  /** Datos del repositorio donde vive el JSON versionado del torneo. */
  github: Object.freeze({
    /** Usuario u organización dueña del repositorio. */
    usuario: 'facundo876',
    /** Nombre del repositorio. */
    repositorio: 'torneo',
    /** Rama sobre la que se commitean los cambios. */
    branch: 'main',
    /** Ruta del JSON dentro del repositorio. */
    rutaJson: 'data/torneo.json',
    /**
     * Personal Access Token con permiso de escritura sobre `repositorio`.
     * Dejar vacío: el panel lo pide al iniciar sesión (recomendado).
     * Completarlo acá lo expone públicamente.
     */
    token: '',
    /** Plantilla del mensaje de commit. `{partido}` se reemplaza en runtime. */
    mensajeCommit: 'chore(torneo): actualiza resultado de {partido}',
    /** Endpoint base de la API. Se centraliza para poder apuntar a GH Enterprise. */
    apiBase: 'https://api.github.com',
  }),

  /** Credenciales del panel de administración (validación en el navegador). */
  admin: Object.freeze({
    usuario: 'admin',
    password: 'alfajor2026',
  }),

  /** Origen de datos para la lectura pública del torneo. */
  datos: Object.freeze({
    /** Ruta relativa al JSON servido por GitHub Pages. */
    rutaLocal: 'data/torneo.json',
  }),

  /** Claves utilizadas en `sessionStorage`. Centralizadas para evitar typos. */
  claves: Object.freeze({
    sesion: 'admin',
    token: 'gh_token',
  }),

  /** Ajustes de presentación. */
  ui: Object.freeze({
    /** Milisegundos que permanece visible un toast. */
    duracionToast: 4000,
  }),
});
