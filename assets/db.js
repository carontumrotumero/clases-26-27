// ============================================================================
// Conexión a Supabase — base de datos en tiempo real compartida por toda la
// clase (avisos de falta y tareas a entregar). La URL y la clave "anon" son
// públicas por diseño: la protección real está en las políticas de RLS del
// proyecto (cualquiera puede leer/insertar, pero solo quien creó una fila
// puede borrarla, comprobado en el servidor con un token propio del
// navegador — ver la cabecera x-owner-token más abajo).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://zgsdlgmvcpdavtscvbyi.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnc2RsZ212Y3BkYXZ0c2N2YnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTgxNzMsImV4cCI6MjEwNDk5NDE3M30.ilxEuaRC_Rj31GFps8-f-Ap9ZBY3wxGeFb35gU4LCRo";

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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { "x-owner-token": ownerToken } },
});

export function isOwn(row) {
  return row.owner_token === ownerToken;
}

// ---------------------------------------------------------------------------
// Avisos de falta ("no puedo ir a clase")
// ---------------------------------------------------------------------------
export async function fetchAbsences() {
  const { data, error } = await supabase
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
  const { data, error } = await supabase
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
  const { error } = await supabase.from("absences").delete().eq("id", id);
  if (error) console.error("deleteAbsence", error);
  return !error;
}

export function subscribeAbsences(onChange) {
  return supabase
    .channel("absences-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, onChange)
    .subscribe();
}

// ---------------------------------------------------------------------------
// Tareas a entregar
// ---------------------------------------------------------------------------
export async function fetchTasks() {
  const { data, error } = await supabase
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
  const { data, error } = await supabase
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
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) console.error("deleteTask", error);
  return !error;
}

export function subscribeTasks(onChange) {
  return supabase
    .channel("tasks-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
    .subscribe();
}
