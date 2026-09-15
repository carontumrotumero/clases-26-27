# Mi Horario de Clase

Web con el horario semanal de clase (SMR), festivos del calendario escolar
de Almería 2026‑2027, avisos de falta y tareas a entregar **en tiempo real y
compartidos por toda la clase** (base de datos Supabase), y notificaciones
del navegador.

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

La web pide una contraseña antes de mostrar el horario y antes de poder leer
o escribir nada en la base de datos. Compártesela tú mismo a tus compañeros
por el canal que uses — no está escrita en este repositorio ni en ningún
sitio público. Si necesitas cambiarla, pídemelo directamente a mí en vez de
documentar aquí cómo está hecho.

## Avisos de falta y tareas (base de datos en tiempo real)

Ya no se editan en el código. Directamente en la web:

- En cualquier día, el botón **"Avisar que no voy"** abre un formulario
  (nombre + motivo opcional) que se guarda al momento y lo ve toda la clase,
  sin recargar la página.
- En "Tareas a entregar", el botón **"+"** abre un formulario (asignatura,
  título, fecha/hora límite y enlace opcional) que también aparece al
  instante para todos.
- Cada aviso o tarea solo se puede borrar desde el mismo navegador que lo
  creó (se identifica con un token propio guardado en tu dispositivo, nunca
  con tu nombre); nadie más ve el botón de borrar en tus entradas.

Esto usa [Supabase](https://supabase.com) (plan gratuito) como base de
datos en tiempo real. La base de datos no acepta ninguna petición (ni
lectura ni escritura) de quien no sepa la contraseña de la web, aunque
tenga el código fuente delante — está comprobado en el servidor, no solo en
la pantalla de la web. Aun así, como no hay login individual por alumno,
cualquiera con la contraseña puede leer y añadir entradas de cualquiera; es
una protección pensada para una clase de confianza, no para datos
sensibles.

## Sincronizar con Google Calendar / Calendario de iCloud-Apple

En "Sincronizar con tu calendario" hay un enlace que se añade **una sola
vez** como calendario "suscrito" en Google Calendar o en Calendario de
Apple/iCloud. A partir de ahí se actualiza solo con las clases, festivos y
tareas — Google y Apple lo vuelven a pedir automáticamente cada pocas horas
(no es instantáneo al segundo, pero no hay que volver a importar nada ni
iniciar sesión con ninguna cuenta).

Técnicamente es una Edge Function de Supabase
(`supabase/functions/calendar-feed`) que genera un archivo `.ics` al vuelo.
Como los calendarios no pueden mandar cabeceras personalizadas al
suscribirse, la clave de acceso va en la propia URL — es la misma clave
derivada de la contraseña de la web, así que sin la contraseña correcta no
se puede generar un enlace válido. Una sincronización de verdad en tiempo
real y en los dos sentidos (que además escribiera en el calendario)
necesitaría que cada alumno iniciara sesión con su cuenta de Google
(OAuth) y, para iCloud, no existe una API pública para eso — por eso se
optó por este enlace suscribible, que funciona para cualquiera sin pedir
ningún inicio de sesión.

**Importante:** el horario (`WEEK_SCHEDULE`, `SCHEDULE_EXCEPTIONS`,
festivos) está duplicado dentro de esa función porque no puede importar
`assets/schedule-data.js` directamente. Si cambias el horario, actualiza
los dos sitios y vuelve a desplegar la función (`supabase functions
deploy calendar-feed` o desde el panel de Supabase).

## Recordar la contraseña por dispositivo

Al introducirla correctamente una vez, el navegador la recuerda (guardada
de forma no legible, nunca en texto plano) y no la vuelve a pedir en ese
mismo dispositivo/navegador. En iPhone/iPad, Safari a veces borra estos
datos si pasas más de una semana sin abrir la web; para evitarlo, añade la
página a la pantalla de inicio (compartir → "Añadir a pantalla de inicio"),
así Safari la trata como una app y no la borra.

## Cómo cambiar el horario o añadir un festivo

Todo está en `assets/schedule-data.js`:

- `WEEK_SCHEDULE`: horario por día de la semana (1 lunes … 5 viernes).
- `SCHEDULE_EXCEPTIONS`: días concretos con horario especial (por ejemplo el
  15 de septiembre, que empieza a las 13:00).
- `HOLIDAYS`: festivos y días no lectivos del calendario escolar.

## Sobre las notificaciones

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
