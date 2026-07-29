/**
 * app.js
 * ---------------------------------------------------------------------------
 * Orquestador de la página pública (index.html).
 *
 * Sólo lee: carga el JSON del torneo, construye la vista y la dibuja. No
 * importa auth.js ni github.js, por lo que ninguna función administrativa
 * llega al navegador de un visitante.
 */

import { cargarTorneo } from './storage.js';
import { crearVistaBracket, calcularAvance } from './bracket.js';
import { renderizarBracket, renderizarEncabezado, alternarSpinner, mostrarErrorEnBloque } from './ui.js';

/** Referencias al DOM, resueltas una única vez. */
const dom = {
  spinner: document.getElementById('spinner'),
  encabezado: document.getElementById('encabezado-torneo'),
  bracket: document.getElementById('contenedor-bracket'),
  actualizado: document.getElementById('ultima-actualizacion'),
};

/**
 * Carga el torneo y lo dibuja. Cualquier fallo se comunica en pantalla:
 * la página nunca queda en blanco ni con el spinner colgado.
 */
async function iniciar() {
  alternarSpinner(dom.spinner, true);

  try {
    const torneo = await cargarTorneo();
    const vista = crearVistaBracket(torneo);

    document.title = `${vista.nombre} · Bracket`;
    renderizarEncabezado(dom.encabezado, vista, calcularAvance(torneo));
    renderizarBracket(dom.bracket, vista);
    mostrarMarcaDeTiempo();
  } catch (error) {
    mostrarErrorEnBloque(
      dom.bracket,
      'No se pudo cargar el torneo',
      error.message || 'Ocurrió un error inesperado al leer los datos.'
    );
    console.error('[app] Error al cargar el torneo:', error);
  } finally {
    alternarSpinner(dom.spinner, false);
  }
}

/** Informa al visitante en qué momento se leyeron los datos que está viendo. */
function mostrarMarcaDeTiempo() {
  if (!dom.actualizado) return;
  // Se recorta el punto final que algunos locales agregan tras "p. m.", para no
  // encadenarlo con el punto de la oración.
  const hora = new Date()
    .toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    .replace(/\.$/, '');
  dom.actualizado.textContent = `Datos leídos a las ${hora}. Actualizá la página para ver los últimos resultados.`;
}

iniciar();
