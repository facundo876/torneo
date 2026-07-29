# Bracket de torneo — sitio estático para GitHub Pages

Aplicación web sin backend para publicar y administrar un torneo de eliminación
directa. Los visitantes ven el bracket; el administrador carga resultados desde
un panel y cada cambio queda versionado como un commit en este mismo repositorio.

Construida con HTML5, CSS3, Bootstrap 5 y JavaScript ES6+ (módulos nativos). Sin
frameworks, sin dependencias de build, sin librerías de brackets.

---

## Arquitectura

El JSON del repositorio es la única fuente de verdad. La página pública lo lee;
el panel lo lee, lo transforma en memoria y lo vuelve a escribir con la GitHub
REST API. GitHub Pages republica el sitio automáticamente.

```
Administrador → carga marcador → valida → propaga al siguiente partido
                                              ↓
                                  lee el SHA actual del JSON
                                              ↓
                                  PUT /repos/…/contents → commit
                                              ↓
                                  GitHub Pages publica → visitantes
```

### Estructura

```
/
├── index.html                Vista pública (sólo lectura)
├── admin.html                Login + panel de administración (3 pestañas)
├── css/styles.css            Layout del bracket, conectores y código de colores
├── js/
│   ├── config.js             Única fuente de configuración
│   ├── storage.js            Lectura del JSON y persistencia de sesión
│   ├── bracket.js            Dominio: resultados, validación, propagación
│   ├── generador.js          Dominio: armado del cuadro y reinicio
│   ├── ui.js                 Presentación: spinner, toasts, modales, render
│   ├── github.js             Escritura vía GitHub REST API
│   ├── auth.js               Login y guardia de sesión
│   ├── app.js                Orquestador de la vista pública
│   ├── admin.js              Orquestador del panel: acceso y navegación
│   ├── admin-estado.js       Estado compartido entre pestañas
│   ├── admin-resultados.js   Pestaña "Resultados"
│   ├── admin-equipos.js      Pestaña "Equipos" (carga masiva)
│   └── admin-reinicio.js     Pestaña "Reiniciar"
├── data/torneo.json          Estado del torneo, versionado
└── assets/                   Recursos estáticos
```

### Separación de responsabilidades

| Módulo | Responsabilidad | DOM | Red |
|---|---|---|---|
| `config.js` | Configuración | No | No |
| `bracket.js` | Reglas de los resultados | No | No |
| `generador.js` | Armado del cuadro y reinicio | No | No |
| `ui.js` | Render | Sí | No |
| `github.js` | Persistencia remota | No | Sí |
| `storage.js` | Lectura y sesión | No | Sí (lectura) |
| `auth.js` | Autenticación | No | No |
| `admin-estado.js` | Estado compartido y publicación | No | Sí (delega) |
| `app.js`, `admin.js`, `admin-*.js` | Orquestación | Sí | — |

El dominio está partido en dos módulos a propósito. `bracket.js` gobierna los
**resultados** (validar un marcador, propagar al ganador, invalidar en cascada);
`generador.js` gobierna la **configuración** del cuadro (armarlo desde una lista,
reiniciarlo). Son operaciones con reglas y riesgos distintos: cargar un marcador
afecta una rama, rearmar el cuadro reemplaza el torneo entero.

Dos decisiones sostienen el diseño:

**`bracket.js` no toca el DOM y `ui.js` no contiene reglas de negocio.** El
dominio recibe y devuelve datos planos, así que se puede probar sin navegador y
el diseño se puede rehacer sin riesgo de romper la lógica del torneo.

**Un solo renderer para todas las pantallas.** `renderizarBracket()` acepta un
hook `pie` con el que el panel inyecta su formulario debajo de cada tarjeta. Ese
mismo renderer dibuja el bracket público, el editable y la previsualización de la
carga masiva: no hay tres implementaciones que mantener sincronizadas, y lo que
se previsualiza es exactamente lo que se publica. La página pública sigue sin
cargar una sola línea de código administrativo: `index.html` importa `app.js`,
que no depende de `auth.js`, `github.js` ni de ningún módulo `admin-*`.

**Un único estado compartido.** Las tres pestañas leen y escriben a través de
`admin-estado.js`, que centraliza el commit y notifica a los suscriptores. Por
eso un cambio hecho en cualquier pestaña se refleja de inmediato en las otras
dos, y el estado local se adopta sólo si el commit en GitHub salió bien: lo que
se ve en pantalla siempre coincide con lo publicado.

---

## Puesta en marcha

### 1. Configurar el repositorio

Editá `js/config.js` con los datos reales:

```js
github: {
  usuario: 'tu-usuario',
  repositorio: 'tu-repo',
  branch: 'main',
  rutaJson: 'data/torneo.json',
  token: '',              // dejar vacío: se pide al iniciar sesión
}
```

### 2. Publicar en GitHub Pages

En **Settings → Pages**, elegí la rama y la carpeta raíz (`/`). No hace falta
ningún paso de build: el repositorio se sirve tal cual está.

### 3. Generar el token de escritura

Creá un **Fine-grained Personal Access Token** limitado a este repositorio, con
permiso `Contents: Read and write`. Es el único permiso necesario; no le des
alcance a otros repositorios ni a la organización.

### 4. Administrar

Entrá a `admin.html` e ingresá con las credenciales de `config.js` y el token. El
panel tiene tres pestañas.

#### Resultados

Cargá un marcador y presioná **Guardar**: el ganador se determina solo, se propaga
a la ronda siguiente y se crea el commit. GitHub Pages tarda hasta un minuto en
publicar el cambio.

#### Equipos — carga masiva

Pegá la lista de participantes y el cuadro se arma completo, sin tocar el JSON.
El orden define los cruces: el primero juega contra el segundo, el tercero contra
el cuarto, y así.

Acepta un nombre por línea y también listas separadas por comas, punto y coma o
tabulaciones, de modo que pegar desde una planilla funciona igual. Al interpretar
la lista descarta sola la numeración (`1.`, `2)`, `-`), las líneas vacías y los
nombres repetidos, comparando sin distinguir mayúsculas ni acentos. Un nombre que
empieza con número, como "9 de Julio", se conserva intacto.

Mientras escribís, el panel informa cuántos participantes detectó y **previsualiza
el cuadro** con el mismo renderer del sitio público. El botón de publicar recién
se habilita cuando la lista forma un cuadro válido.

Un cuadro necesita una potencia de 2 (2, 4, 8, 16, 32 o 64). Si la cantidad no da,
el botón **Completar con "Libre"** rellena los lugares vacantes hasta la potencia
siguiente. Los vacantes se numeran ("Libre 1", "Libre 2", …) porque todo el
sistema identifica a los participantes por su nombre: dos equipos homónimos en un
mismo partido se pintarían los dos como ganadores. Esos partidos se resuelven con
un clic desde la pestaña de resultados.

**Cargar los actuales** trae los participantes del torneo vigente al cuadro de
texto, para editar la lista en lugar de escribirla de nuevo.

Publicar reemplaza el torneo completo, así que la confirmación avisa cuántos
resultados se van a perder.

#### Reiniciar

Borra todos los marcadores y ganadores conservando los participantes de la
primera ronda. Antes de ejecutarlo la pantalla muestra cuántos resultados se van
a borrar y qué participantes se conservan, y el botón sólo se habilita después de
escribir `REINICIAR`.

Para empezar con **otros** participantes, el flujo es la pestaña Equipos, que
rearma el cuadro entero.

En los dos casos la versión anterior del torneo queda en el historial de commits
del repositorio, así que siempre se puede recuperar desde GitHub.

### Desarrollo local

Los módulos ES no funcionan con `file://`. Levantá cualquier servidor estático:

```bash
python -m http.server 4173
```

---

## Formato del JSON

```json
{
  "nombre": "Mundial de Alfajores",
  "fecha": "2026-08-01",
  "rondas": [
    {
      "nombre": "Octavos",
      "partidos": [
        { "id": 1, "equipo1": "Jorgito", "equipo2": "Guaymallén",
          "score1": 0, "score2": 0, "ganador": null, "siguiente": 9 }
      ]
    }
  ]
}
```

| Campo | Significado |
|---|---|
| `id` | Identificador único del partido |
| `equipo1` / `equipo2` | Participantes; `null` mientras no estén definidos |
| `score1` / `score2` | Marcador (enteros no negativos) |
| `ganador` | Nombre del ganador, o `null` |
| `siguiente` | Partido de la ronda posterior que recibe al ganador; `null` en la final |

**Editar este archivo a mano es opcional**: la pestaña Equipos del panel arma el
cuadro entero desde una lista de nombres y lo commitea. La descripción del formato
queda documentada para quien prefiera editarlo directamente o necesite revisar un
torneo existente.

La cantidad de rondas, columnas y la posición de cada partido se derivan del
contenido: el bracket se adapta solo de 2 a 64 participantes.

`siguiente` acepta el `id` del partido destino o su posición dentro de la ronda
siguiente; ambas formas se resuelven automáticamente. El slot que ocupa el
ganador (arriba o abajo) se deduce del orden de los partidos que alimentan ese
destino, así que no hay que declararlo. El campo opcional `siguienteSlot` (`1` o
`2`) permite forzarlo en brackets irregulares.

### Reglas aplicadas

- No se permiten empates: todo partido guardado tiene un único ganador.
- No se permiten marcadores negativos ni decimales.
- No se puede cargar un resultado si falta algún participante.
- Cambiar el ganador de un partido ya resuelto **invalida en cascada** los
  resultados posteriores que dependían de él: la aplicación los borra y avisa
  cuáles, antes de confirmar.

---

## Seguridad

> **Esta aplicación no tiene seguridad real, y no puede tenerla.** Es una
> consecuencia directa de la arquitectura elegida, no un descuido de
> implementación. Leé esta sección antes de publicar el sitio.

### El login es cosmético

Usuario y contraseña están escritos en `js/config.js`, un archivo que se sirve
públicamente. Cualquiera puede leerlos con Ver código fuente. El flag en
`sessionStorage` también se puede escribir a mano desde la consola.

Sirve para **evitar ediciones accidentales**, no para impedir el acceso de
alguien decidido. No reutilices esa contraseña en ningún otro lado.

### El token es lo único que importa

Lo único que GitHub valida es el token. De ahí las decisiones del proyecto:

- **`config.token` se deja vacío.** Un token escrito ahí queda publicado en el
  sitio y en el historial de Git; cualquier visitante podría commitear en el
  repositorio. GitHub lo detecta y lo revoca, pero puede tardar.
- **El token se pide al iniciar sesión** y se guarda sólo en `sessionStorage`:
  vive en una pestaña y desaparece al cerrarla o al cerrar sesión.
- **Usá un token fine-grained** con permiso `Contents: Read and write` sobre este
  único repositorio. Si se filtra, el daño se limita a este repo.

Aun así, el token queda en memoria del navegador y viaja en cada request desde
el cliente. Cualquier script de terceros inyectado en la página podría leerlo.
Por eso el sitio no carga más dependencias externas que Bootstrap, servido desde
CDN con `integrity` (SRI).

### Otras limitaciones

- **Todo el historial es público.** Cada corrección de un marcador queda como un
  commit visible en el repositorio.
- **No hay control de concurrencia fuerte.** Se usa el SHA del archivo para
  detectar escrituras simultáneas; ante un conflicto se reintenta una vez y, si
  persiste, se informa en lugar de sobrescribir.
- **`admin.html` es accesible para cualquiera.** Lleva `noindex`, pero eso sólo
  evita que aparezca en buscadores.

### Evolución: sacar el token del navegador

La forma correcta de resolverlo es que el token nunca llegue al cliente. Dos
caminos, de menor a mayor esfuerzo:

**GitHub Action con `repository_dispatch`.** El panel envía el resultado a un
endpoint que dispara un workflow; el workflow corre en GitHub, valida el
resultado y commitea con el `GITHUB_TOKEN` del runner, que nunca sale del
servidor. Sigue haciendo falta un secreto en el cliente para disparar el
dispatch, así que conviene combinarlo con la opción siguiente.

**Función serverless como intermediaria** (Cloudflare Workers, Netlify o Vercel
Functions, todas con plan gratuito suficiente). El panel se autentica contra la
función; la función guarda el token de GitHub como variable de entorno, valida
el resultado del lado del servidor y hace el commit. Con esto se puede además
implementar autenticación real (OAuth de GitHub o un proveedor de identidad),
rate limiting y una auditoría de quién cambió qué.

El cambio queda contenido: sólo hay que reemplazar `js/github.js` por un módulo
que haga `POST` a la función y devuelva la misma interfaz. Ni el dominio, ni el
render, ni los orquestadores se enteran.

---

## Escalabilidad

El diseño deja lugar para crecer sin rehacer la arquitectura:

| Funcionalidad futura | Cómo encaja |
|---|---|
| Varios torneos | `data/<slug>.json` y un selector; `storage.js` ya centraliza la ruta |
| Logos, sedes, horarios | Campos nuevos en el partido; `ui.js` los renderiza, el dominio los ignora |
| Fase de grupos | Nueva etapa previa en el JSON con su propio renderer; el bracket no cambia |
| Doble eliminación | Un segundo árbol de perdedores; `determinarPerdedor()` ya existe en el dominio |
| Historial de resultados | Ya está en los commits; falta exponerlo leyendo la API de commits |
| Estadísticas | Funciones puras nuevas en `bracket.js`, junto a `calcularAvance()` |
| Tema claro/oscuro | Todos los colores derivan de variables `--bs-*`: alcanza con `data-bs-theme` |
| Internacionalización | Los textos están agrupados en `ui.js` y en los orquestadores |
| Pantallas nuevas en el panel | Un módulo con `inicializar(dom)` y `renderizar(torneo)`, más una pestaña en `admin.html` |
| Sembrado por ranking | Reordenar la lista antes de `generarTorneo()`; el resto del dominio no cambia |
| Byes automáticos | Resolver los cruces con lugares "Libre" al generar, en lugar de dejarlos al administrador |

Las pestañas del panel siguen un contrato uniforme —`inicializar(dom)` y
`renderizar(torneo)`— y se registran en un único arreglo de `admin.js`. Agregar
una pantalla no obliga a tocar las existentes.

---

## Verificación

El proyecto se probó en el navegador antes de publicarse. Se confirmó que:

- El bracket se dibuja desde el JSON y los conectores alinean con precisión: el
  punto medio de cada par cae exactamente sobre el centro del partido receptor.
- En móvil el bracket se desplaza dentro de su contenedor sin que la página
  desborde horizontalmente.
- `admin.html` sin sesión deja el panel oculto y vacío; el bracket editable no
  llega al DOM.
- Se rechazan empates, negativos, decimales y partidos sin participantes, cada
  uno con su mensaje.
- El ganador se propaga al slot correcto de la ronda siguiente, en varios niveles.
- Cambiar un resultado de octavos invalida en cascada cuartos, semifinal y final.
- El JSON enviado conserva indentación y acentos (codificación UTF-8 → Base64).
- Un conflicto 409 dispara un reintento con el SHA actualizado; si persiste, se
  informa sin sobrescribir. Los errores 401 y 404 producen mensajes accionables,
  distinguiendo si falló el repositorio o el archivo.

Sobre las pantallas de configuración:

- El parseo resuelve en una sola lista numeración, viñetas, comas, punto y coma,
  tabulaciones y líneas vacías, y descarta repetidos ignorando mayúsculas y
  acentos ("jorgito" y "JORGITÓ" cuentan como "Jorgito"). "9 de Julio" y
  "25 de Mayo" conservan su prefijo numérico.
- El cuadro se genera correctamente para 2, 8 y 16 participantes, con nombres de
  ronda, `id` y `siguiente` calculados solos, y se rechazan las cantidades que no
  son potencia de 2 y los torneos sin nombre.
- Un cuadro generado desde cero se juega de punta a punta hasta consagrar campeón,
  lo que confirma que `generador.js` produce estructuras que `bracket.js` acepta.
- El reinicio borra 10 resultados, conserva los 16 participantes de la primera
  ronda, vacía el resto del cuadro, preserva `id` y `siguiente`, no muta el
  original y es idempotente (la segunda vez informa que no hay nada que borrar).
- Completar un cuadro de 12 produce 16 con vacantes numerados. La primera versión
  generaba 13 porque los "Libre" se deduplicaban entre sí; se corrigió durante la
  verificación.
- Publicar desde la pestaña Equipos actualiza la pestaña Resultados sin recargar
  la página, lo que confirma que el estado compartido notifica correctamente.
- El botón de reinicio se habilita con `reiniciar`, `REINICIAR` y con espacios
  alrededor, pero no con una palabra distinta.
- En móvil las tres pestañas se ven sin que la página desborde en horizontal, y
  tanto el bracket como la previsualización se desplazan dentro de su contenedor.
- La página pública carga sólo `app.js`, `storage.js`, `bracket.js`, `ui.js` y
  `config.js`: ni `generador.js` ni ningún módulo `admin-*` llegan al visitante.
