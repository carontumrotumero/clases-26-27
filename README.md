# Mi Horario de Clase

Web estática con el horario semanal de clase (SMR), festivos del calendario
escolar de Almería 2026‑2027, botón para marcar días a los que no puedes
asistir, avisos por notificación del navegador y una sección de tareas a
entregar.

## Ver la web

Publicada con GitHub Pages. El enlace **no se comparte aquí ni en ningún
sitio público**: pásaselo tú mismo a tus compañeros de clase por el canal
que prefieras (WhatsApp, Discord...).

La página lleva `robots.txt` y meta `noindex` para que Google y demás
buscadores no la indexen, y el repositorio no tiene descripción ni topics
que la hagan más fácil de encontrar. Ten en cuenta que, al ser GitHub Pages
gratuito, el repositorio es técnicamente público (necesario para que Pages
funcione sin plan de pago) y alguien con el enlace exacto —o que dé con el
repo buscando en GitHub— podría acceder. Los nombres de los profesores se
muestran como nombre + inicial del apellido para reducir lo identificable.

## Contraseña de acceso

La web pide una contraseña antes de mostrar el horario. Compártesela tú
mismo a tus compañeros por el canal que uses (no está escrita en ningún
sitio público). En el código (`assets/app.js`) solo se guarda su hash
SHA-256, nunca la contraseña en texto plano — aun así, al ser una web
estática sin servidor, cualquiera con acceso al código fuente podría
intentar romper ese hash por fuerza bruta; es una barrera razonable para
que no la vea cualquiera de paso, no una protección de nivel bancario.

Para cambiar la contraseña: calcula el SHA-256 (en minúsculas, hexadecimal)
de la nueva contraseña y sustituye el valor de `PASSWORD_HASH` en
`assets/app.js`. Por ejemplo, desde una terminal:
```bash
echo -n "TuNuevaContraseña" | shasum -a 256
```

## Cómo añadir una tarea a entregar

Edita `assets/schedule-data.js`, dentro del array `TASKS`, y añade una línea
así:

```js
{ subject: "Aplicaciones Web", title: "Práctica 3 - Formularios", due: "2026-09-22T23:59", link: "https://classroom.google.com/..." },
```

- `subject`: debe coincidir con el nombre exacto de una asignatura del horario
  para heredar su color.
- `due`: fecha y hora límite en formato `AAAA-MM-DDTHH:MM`.
- `link`: enlace de entrega (opcional, puedes quitar la propiedad).

Guarda, haz commit y `git push`: en cuanto GitHub Pages actualice el sitio
(1-2 minutos) lo verá toda la clase.

## Cómo cambiar el horario o añadir un festivo

Todo está en `assets/schedule-data.js`:

- `WEEK_SCHEDULE`: horario por día de la semana (1 lunes … 5 viernes).
- `SCHEDULE_EXCEPTIONS`: días concretos con horario especial (por ejemplo el
  15 de septiembre, que empieza a las 13:00).
- `HOLIDAYS`: festivos y días no lectivos del calendario escolar.

## Sobre el botón "No voy este día" y las notificaciones

- El botón "No voy este día" guarda tu elección **solo en tu navegador**
  (localStorage), así que es personal de cada alumno: no afecta a lo que ven
  tus compañeros.
- Al pulsar el icono de la campana el navegador (Chrome, Safari, Edge,
  Firefox...) te pedirá permiso para mostrar notificaciones. Si lo aceptas,
  la web te avisará ~10 minutos antes de cada clase del día **mientras
  mantengas la pestaña abierta**. Los navegadores no permiten a una web
  estática (sin servidor propio) enviar notificaciones push cuando el
  navegador está completamente cerrado; para eso haría falta un backend con
  Web Push, que queda fuera de este proyecto.

## Iconos

Los iconos usados (sol/luna para el tema, campana, calendario, flechas,
etc.) provienen de [reicon](https://github.com/dqev/reicon) (licencia MIT),
incrustados como SVG en `assets/icons.js` para que funcionen sin
dependencias externas y se adapten automáticamente a modo claro y oscuro.

## Publicar cambios

```bash
git add -A
git commit -m "Actualiza horario/tareas"
git push
```

GitHub Pages se actualiza solo tras el push (Settings → Pages → Deploy from
branch → main /root).
