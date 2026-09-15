// ============================================================================
// Feed de calendario suscribible (.ics) — lo añades UNA vez en Google Calendar
// o en Calendario de iCloud/Apple con "Suscribirse desde URL" y a partir de
// ahí se actualiza solo (Google/Apple vuelven a pedir este archivo cada pocas
// horas), sin que nadie tenga que volver a importar nada ni iniciar sesión.
//
// Autenticación: como los calendarios NO pueden enviar cabeceras personalizadas
// al suscribirse, la clave va en la propia URL (?key=...). Es la misma clave
// derivada de la contraseña de la web (ver PASSWORD_HASH/computeSiteKey en el
// frontend y las políticas RLS en Supabase) — sin la contraseña correcta no se
// puede generar, así que solo quien la conoce puede tener un enlace válido.
//
// El horario en sí (clases, festivos, excepciones) está duplicado aquí a mano
// porque esta función no puede importar directamente assets/schedule-data.js
// del frontend. Si cambias el horario, actualiza los dos sitios (ver README).
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const EXPECTED_SITE_KEY = "213342736769a68f528299309bca91f465d5e427a463738149cae6fe8716b23e";

// --- Horario (debe coincidir con assets/schedule-data.js) ------------------
const WEEK_SCHEDULE: Record<number, { start: string; end: string; subject: string; teacher: string }[]> = {
  1: [
    { start: "08:15", end: "09:15", subject: "Servicios en Red", teacher: "Juan Luis R." },
    { start: "09:15", end: "10:15", subject: "Servicios en Red", teacher: "Juan Luis R." },
    { start: "10:15", end: "11:15", subject: "Optativa-Introducción a la programación-AN04699", teacher: "Daniel Marcelino P." },
    { start: "11:45", end: "12:45", subject: "Seguridad Informática", teacher: "Juan Luis R." },
    { start: "12:45", end: "13:45", subject: "Itinerario Personal para la Empleabilidad II", teacher: "Daniel Marcelino P." },
    { start: "13:45", end: "14:45", subject: "Aplicaciones Web", teacher: "Juan Andrés I." },
  ],
  2: [
    { start: "08:15", end: "09:15", subject: "Aplicaciones Web", teacher: "Juan Andrés I." },
    { start: "09:15", end: "10:15", subject: "Aplicaciones Web", teacher: "Juan Andrés I." },
    { start: "10:15", end: "11:15", subject: "Seguridad Informática", teacher: "Juan Luis R." },
    { start: "11:45", end: "12:45", subject: "Seguridad Informática", teacher: "Juan Luis R." },
    { start: "12:45", end: "13:45", subject: "Proyecto Intermodular", teacher: "Juan Luis R." },
    { start: "13:45", end: "14:45", subject: "Proyecto Intermodular", teacher: "Juan Luis R." },
  ],
  3: [
    { start: "08:15", end: "09:15", subject: "Aplicaciones Web", teacher: "Juan Andrés I." },
    { start: "09:15", end: "10:15", subject: "Inglés Profesional GM", teacher: "María Cruz J." },
    { start: "10:15", end: "11:15", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "11:45", end: "12:45", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "12:45", end: "13:45", subject: "Servicios en Red", teacher: "Juan Luis R." },
    { start: "13:45", end: "14:45", subject: "Servicios en Red", teacher: "Juan Luis R." },
  ],
  4: [
    { start: "08:15", end: "09:15", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "09:15", end: "10:15", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "10:15", end: "11:15", subject: "Optativa-Introducción a la programación-AN04699", teacher: "Daniel Marcelino P." },
    { start: "11:45", end: "12:45", subject: "Optativa-Introducción a la programación-AN04699", teacher: "Daniel Marcelino P." },
    { start: "12:45", end: "13:45", subject: "Seguridad Informática", teacher: "Juan Luis R." },
    { start: "13:45", end: "14:45", subject: "Itinerario Personal para la Empleabilidad II", teacher: "Daniel Marcelino P." },
  ],
  5: [
    { start: "08:15", end: "09:15", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "09:15", end: "10:15", subject: "Sistemas Operativos en Red", teacher: "Manuel R." },
    { start: "10:15", end: "11:15", subject: "Servicios en Red", teacher: "Juan Luis R." },
    { start: "11:45", end: "12:45", subject: "Servicios en Red", teacher: "Juan Luis R." },
    { start: "12:45", end: "13:45", subject: "Inglés Profesional GM", teacher: "María Cruz J." },
    { start: "13:45", end: "14:45", subject: "Itinerario Personal para la Empleabilidad II", teacher: "Daniel Marcelino P." },
  ],
};

const SCHEDULE_EXCEPTIONS: Record<string, { onlyFrom: string }> = {
  "2026-09-15": { onlyFrom: "13:00" },
};

function datesBetween(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let d = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const HOLIDAY_DATES = new Set<string>([
  "2026-09-09",
  "2026-09-30",
  "2026-10-09",
  "2026-10-12",
  "2026-10-30",
  "2026-11-02",
  "2026-12-07",
  "2026-12-08",
  "2026-12-23",
  ...datesBetween("2026-12-24", "2027-01-06"),
  "2027-02-26",
  "2027-02-28",
  "2027-03-01",
  ...datesBetween("2027-03-21", "2027-03-28"),
  "2027-03-29",
  "2027-04-30",
  "2027-05-01",
  "2027-06-22",
]);

const COURSE_START = "2026-09-15";
const COURSE_END = "2027-06-22";

// --- Utilidades ICS ----------------------------------------------------------
function escapeICS(text: string): string {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  if (line.length <= 74) return line;
  let out = "";
  let rest = line;
  out += rest.slice(0, 74);
  rest = rest.slice(74);
  while (rest.length > 0) {
    out += "\r\n " + rest.slice(0, 73);
    rest = rest.slice(73);
  }
  return out;
}

function icsDateTime(dateISO: string, timeHHMM: string): string {
  return `${dateISO.replace(/-/g, "")}T${timeHHMM.replace(":", "")}00`;
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function weekdayOf(dateISO: string): number {
  const dow = new Date(dateISO + "T00:00:00Z").getUTCDay(); // 0=domingo
  return dow === 0 ? 7 : dow;
}

// --- Generación del calendario ----------------------------------------------
function buildClassEvents(): string[] {
  const events: string[] = [];
  for (const dateISO of datesBetween(COURSE_START, COURSE_END)) {
    if (HOLIDAY_DATES.has(dateISO)) continue;
    const wd = weekdayOf(dateISO);
    if (wd > 5) continue;
    const slots = WEEK_SCHEDULE[wd] || [];
    const exception = SCHEDULE_EXCEPTIONS[dateISO];
    slots.forEach((slot, i) => {
      if (exception && slot.end <= exception.onlyFrom) return; // clase no lectiva ese día
      const uid = `class-${dateISO}-${i}@horario-clase.carontumrotumero`;
      events.push(
        [
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${icsStamp(new Date())}`,
          `DTSTART:${icsDateTime(dateISO, slot.start)}`,
          `DTEND:${icsDateTime(dateISO, slot.end)}`,
          foldLine(`SUMMARY:${escapeICS(slot.subject)}`),
          foldLine(`DESCRIPTION:${escapeICS("Profesor/a: " + slot.teacher)}`),
          "STATUS:CONFIRMED",
          "END:VEVENT",
        ].join("\r\n")
      );
    });
  }
  return events;
}

async function buildTaskEvents(): Promise<string[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("tasks")
    .select("id, subject, title, due, link")
    .order("due", { ascending: true });

  if (error || !data) return [];

  return data.map((t: any) => {
    const due = new Date(t.due);
    const dtstart = icsStamp(due).replace("Z", ""); // hora local del navegador que la creó, como evento sin TZID
    const uid = `task-${t.id}@horario-clase.carontumrotumero`;
    const lines = [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${dtstart}`,
      foldLine(`SUMMARY:${escapeICS("Entregar: " + t.subject + " — " + t.title)}`),
    ];
    if (t.link) lines.push(foldLine(`DESCRIPTION:${escapeICS(t.link)}`));
    lines.push(
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Recordatorio de tarea",
      "TRIGGER:-PT30M",
      "END:VALARM",
      "END:VEVENT"
    );
    return lines.join("\r\n");
  });
}

function buildCalendar(events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//horario-clase//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Mi Horario de Clase",
    "X-WR-TIMEZONE:Europe/Madrid",
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";

  if (key !== EXPECTED_SITE_KEY) {
    return new Response("No autorizado.", { status: 403 });
  }

  const classEvents = buildClassEvents();
  const taskEvents = await buildTaskEvents();
  const ics = buildCalendar([...classEvents, ...taskEvents]);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="horario-clase.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
});
