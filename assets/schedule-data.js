// ============================================================================
// DATOS DEL HORARIO — edítalos aquí si cambia algo
// ============================================================================

// Colores por asignatura (se ven bien en modo claro y oscuro)
export const SUBJECT_COLORS = {
  "Servicios en Red": "#4c8fa3",
  "Optativa-Introducción a la programación-AN04699": "#a3557d",
  "Seguridad Informática": "#6f8f3e",
  "Itinerario Personal para la Empleabilidad II": "#3e8f7a",
  "Aplicaciones Web": "#9a6b3e",
  "Proyecto Intermodular": "#6a5acd",
  "Inglés Profesional GM": "#3e8f5c",
  "Sistemas Operativos en Red": "#4a5a9a",
};

// weekday: 1 = lunes ... 5 = viernes
export const WEEK_SCHEDULE = {
  1: [ // Lunes
    { start: "08:15", end: "09:15", subject: "Servicios en Red", teacher: "Juan Luis R." },
    { start: "09:15", end: "10:15", subject: "Servicios en Red", teacher: "Juan Luis R." },
    { start: "10:15", end: "11:15", subject: "Optativa-Introducción a la programación-AN04699", teacher: "Daniel Marcelino P." },
    { start: "11:45", end: "12:45", subject: "Seguridad Informática", teacher: "Juan Luis R." },
    { start: "12:45", end: "13:45", subject: "Itinerario Personal para la Empleabilidad II", teacher: "Daniel Marcelino P." },
    { start: "13:45", end: "14:45", subject: "Aplicaciones Web", teacher: "Juan Andrés I." },
  ],
  2: [ // Martes
    { start: "08:15", end: "09:15", subject: "Aplicaciones Web", teacher: "Juan Andrés I." },
    { start: "09:15", end: "10:15", subject: "Aplicaciones Web", teacher: "Juan Andrés I." },
    { start: "10:15", end: "11:15", subject: "Seguridad Informática", teacher: "Juan Luis R." },
    { start: "11:45", end: "12:45", subject: "Seguridad Informática", teacher: "Juan Luis R." },
    { start: "12:45", end: "13:45", subject: "Proyecto Intermodular", teacher: "Juan Luis R." },
    { start: "13:45", end: "14:45", subject: "Proyecto Intermodular", teacher: "Juan Luis R." },
  ],
  3: [ // Miércoles
    { start: "08:15", end: "09:15", subject: "Aplicaciones Web", teacher: "Juan Andrés I." },
    { start: "09:15", end: "10:15", subject: "Inglés Profesional GM", teacher: "María Cruz J." },
    { start: "10:15", end: "11:15", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "11:45", end: "12:45", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "12:45", end: "13:45", subject: "Servicios en Red", teacher: "Juan Luis R." },
    { start: "13:45", end: "14:45", subject: "Servicios en Red", teacher: "Juan Luis R." },
  ],
  4: [ // Jueves
    { start: "08:15", end: "09:15", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "09:15", end: "10:15", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "10:15", end: "11:15", subject: "Optativa-Introducción a la programación-AN04699", teacher: "Daniel Marcelino P." },
    { start: "11:45", end: "12:45", subject: "Optativa-Introducción a la programación-AN04699", teacher: "Daniel Marcelino P." },
    { start: "12:45", end: "13:45", subject: "Seguridad Informática", teacher: "Juan Luis R." },
    { start: "13:45", end: "14:45", subject: "Itinerario Personal para la Empleabilidad II", teacher: "Daniel Marcelino P." },
  ],
  5: [ // Viernes
    { start: "08:15", end: "09:15", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "09:15", end: "10:15", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "10:15", end: "11:15", subject: "Servicios en Red", teacher: "Juan Luis R." },
    { start: "11:45", end: "12:45", subject: "Servicios en Red", teacher: "Juan Luis R." },
    { start: "12:45", end: "13:45", subject: "Inglés Profesional GM", teacher: "María Cruz J." },
    { start: "13:45", end: "14:45", subject: "Itinerario Personal para la Empleabilidad II", teacher: "Daniel Marcelino P." },
  ],
};

// Días con horario especial (una fecha concreta, no una semana normal).
// onlyFrom: solo se muestran/cuentan las clases que empiecen a esa hora o después.
export const SCHEDULE_EXCEPTIONS = {
  "2026-09-15": { onlyFrom: "13:00", label: "Primer día de curso — empiezas a las 13:00" },
};

// Calendario escolar Almería 2026-2027 (ESO, Bach, FP, Art y EPA), días no lectivos / festivos.
// Fuente: Delegación Territorial de Educación de Almería.
export const HOLIDAYS = [
  { date: "2026-09-09", label: "Día no lectivo" },
  { date: "2026-09-30", label: "Día no lectivo" },
  { date: "2026-10-09", label: "Día no lectivo" },
  { date: "2026-10-12", label: "Fiesta Nacional de España" },
  { date: "2026-10-30", label: "Día no lectivo" },
  { date: "2026-11-02", label: "Festivo por Todos los Santos" },
  { date: "2026-12-07", label: "Festivo por Constitución" },
  { date: "2026-12-08", label: "Inmaculada Concepción" },
  { date: "2026-12-23", label: "Día no lectivo" },
  // Vacaciones de Navidad: 24 dic 2026 - 6 ene 2027 (ambos inclusive)
  ...datesBetween("2026-12-24", "2027-01-06").map(date => ({ date, label: "Vacaciones de Navidad" })),
  { date: "2027-02-26", label: "Día de la Comunidad Educativa" },
  { date: "2027-02-28", label: "Día de Andalucía (traslado)" },
  { date: "2027-03-01", label: "Festivo por Día de Andalucía" },
  // Semana Santa: 21 mar - 28 mar 2027 (ambos inclusive)
  ...datesBetween("2027-03-21", "2027-03-28").map(date => ({ date, label: "Vacaciones de Semana Santa" })),
  { date: "2027-03-29", label: "Día no lectivo" },
  { date: "2027-04-30", label: "Día no lectivo" },
  { date: "2027-05-01", label: "Día del Trabajo" },
  { date: "2027-06-22", label: "Último día de clase" },
];

function datesBetween(startISO, endISO) {
  const out = [];
  let d = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export const HOLIDAY_MAP = Object.fromEntries(HOLIDAYS.map(h => [h.date, h.label]));

// Último día lectivo del curso, para no generar semanas después de esta fecha.
export const COURSE_END = "2027-06-22";
export const COURSE_START = "2026-09-15";

// ============================================================================
// TAREAS A ENTREGAR — añade aquí cada tarea y se mostrará en la web para toda
// la clase (se sube al repo, así que en cuanto hagas "git push" lo ven todos).
// Ejemplo:
// { subject: "Aplicaciones Web", title: "Práctica 3 - Formularios", due: "2026-09-22T23:59", link: "https://classroom.google.com/..." },
// ============================================================================
export const TASKS = [
  // Añade tus tareas aquí siguiendo el ejemplo de arriba
];
