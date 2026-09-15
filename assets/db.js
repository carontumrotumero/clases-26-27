// ============================================================================
// Conexión a Supabase — base de datos en tiempo real compartida por toda la
// clase (avisos de falta y tareas a entregar). La URL y la clave "anon" son
// públicas por diseño (cualquier web que use Supabase las expone), pero la
// base de datos en sí NO se puede leer ni escribir sin la contraseña de la
// web: cada petición debe llevar una cabecera x-site-key derivada de esa
// contraseña, y el valor que se espera solo existe en las políticas RLS de
// Supabase — nunca en este repositorio. Además, solo quien creó una fila
// puede borrarla (cabecera x-owner-token, un identificador propio del
// navegador, no la contraseña).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://zgsdlgmvcpdavtscvbyi.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnc2RsZ212Y3BkYXZ0c2N2YnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTgxNzMsImV4cCI6MjEwNDk5NDE3M30.ilxEuaRC_Rj31GFps8-f-Ap9ZBY3wxGeFb35gU4LCRo";

// Debe coincidir con el sufijo usado al calcular la clave que se guardó en
// las políticas RLS de Supabase (ver el comentario de PASSWORD_HASH en
// app.js). No es un secreto — el secreto es la contraseña, no este sufijo.
const SITE_KEY_SALT = "::db-key-v1";

const LS_OWNER = "horario:ownerToken";

function getOwnerToken() {
  let t = localStorage.getItem(LS_OWNER);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(LS_OWNER, t);
  }
  return t;
}

export const ownerToken = getOwnerToken();

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function computeSiteKey(password) {
  return sha256Hex(password + SITE_KEY_SALT);
}

// URL del feed de calendario (.ics) suscribible desde Google Calendar o
// Calendario de iCloud/Apple. Lleva la misma clave derivada de la contraseña
// como parámetro (los calendarios no pueden mandar cabeceras al suscribirse),
// así que solo quien conoce la contraseña puede generar un enlace válido.
export function calendarFeedUrl(siteKey) {
  return `${SUPABASE_URL}/functions/v1/calendar-feed?key=${encodeURIComponent(siteKey)}`;
}

let supabase = null;

// Se llama una vez, justo después de comprobar la contraseña (o al recuperar
// la clave ya calculada de una visita anterior). Hasta que esto no se llama,
// ninguna de las funciones de abajo puede usarse.
export function configureDb(siteKey) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { "x-owner-token": ownerToken, "x-site-key": siteKey } },
  });
}

function client() {
  if (!supabase) throw new Error("configureDb() no se ha llamado todavía");
  return supabase;
}

export function isOwn(row) {
  return row.owner_token === ownerToken;
}

// ---------------------------------------------------------------------------
// Avisos de falta ("no puedo ir a clase")
// ---------------------------------------------------------------------------
export async function fetchAbsences() {
  const { data, error } = await client()
    .from("absences")
    .select("id, class_date, student_name, reason, owner_token, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchAbsences", error);
    return [];
  }
  return data;
}

export async function addAbsence(classDate, studentName, reason) {
  const { data, error } = await client()
    .from("absences")
    .insert({
      class_date: classDate,
      student_name: studentName,
      reason: reason || null,
      owner_token: ownerToken,
    })
    .select()
    .single();
  if (error) {
    console.error("addAbsence", error);
    return null;
  }
  return data;
}

export async function deleteAbsence(id) {
  const { error } = await client().from("absences").delete().eq("id", id);
  if (error) console.error("deleteAbsence", error);
  return !error;
}

export function subscribeAbsences(onChange) {
  return client()
    .channel("absences-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, onChange)
    .subscribe();
}

// ---------------------------------------------------------------------------
// Tareas a entregar
// ---------------------------------------------------------------------------
export async function fetchTasks() {
  const { data, error } = await client()
    .from("tasks")
    .select("id, subject, title, due, link, owner_token, created_at")
    .order("due", { ascending: true });
  if (error) {
    console.error("fetchTasks", error);
    return [];
  }
  return data;
}

export async function addTask(subject, title, due, link) {
  const { data, error } = await client()
    .from("tasks")
    .insert({
      subject,
      title,
      due,
      link: link || null,
      owner_token: ownerToken,
    })
    .select()
    .single();
  if (error) {
    console.error("addTask", error);
    return null;
  }
  return data;
}

export async function deleteTask(id) {
  const { error } = await client().from("tasks").delete().eq("id", id);
  if (error) console.error("deleteTask", error);
  return !error;
}

export function subscribeTasks(onChange) {
  return client()
    .channel("tasks-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
    .subscribe();
}

// ---------------------------------------------------------------------------
// Avisos para toda la clase (huelgas, festivos locales, traspasos de festivo)
// kind: "closed" -> ese día no hay clase (aunque el calendario oficial diga
//       que sí, por ejemplo una huelga o un festivo local no incluido).
// kind: "open"   -> ese día SÍ hay clase aunque el calendario oficial lo
//       marque como festivo (traspaso: el festivo se mueve a otro día).
// ---------------------------------------------------------------------------
export async function fetchDayOverrides() {
  const { data, error } = await client()
    .from("day_overrides")
    .select("id, date, kind, label, owner_token, created_at")
    .order("date", { ascending: true });
  if (error) {
    console.error("fetchDayOverrides", error);
    return [];
  }
  return data;
}

export async function addDayOverride(date, kind, label) {
  const { data, error } = await client()
    .from("day_overrides")
    .insert({ date, kind, label: label || null, owner_token: ownerToken })
    .select()
    .single();
  if (error) {
    console.error("addDayOverride", error);
    return null;
  }
  return data;
}

export async function deleteDayOverride(id) {
  const { error } = await client().from("day_overrides").delete().eq("id", id);
  if (error) console.error("deleteDayOverride", error);
  return !error;
}

export function subscribeDayOverrides(onChange) {
  return client()
    .channel("day-overrides-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "day_overrides" }, onChange)
    .subscribe();
}
