import { ICONS } from "./icons.js";
import {
  WEEK_SCHEDULE,
  SUBJECT_COLORS,
  SCHEDULE_EXCEPTIONS,
  HOLIDAY_MAP,
  COURSE_START,
  COURSE_END,
} from "./schedule-data.js";
import {
  isOwn,
  computeSiteKey,
  configureDb,
  fetchAbsences,
  addAbsence,
  deleteAbsence,
  subscribeAbsences,
  fetchTasks,
  addTask,
  deleteTask,
  subscribeTasks,
  fetchDayOverrides,
  addDayOverride,
  deleteDayOverride,
  subscribeDayOverrides,
  calendarFeedUrl,
} from "./db.js";

function boot() {

// ----------------------------------------------------------------------------
// Utilidades
// ----------------------------------------------------------------------------
const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoToDate(iso) {
  return new Date(iso + "T00:00:00");
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 domingo .. 6 sábado
  const diff = day === 0 ? -6 : 1 - day; // llevar a lunes
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtShort(date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function fmtLong(date) {
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function sanitizeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url, location.href);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* ignore */
  }
  return null;
}

// ----------------------------------------------------------------------------
// Estado persistente (localStorage) — preferencias personales de este navegador
// ----------------------------------------------------------------------------
const LS_THEME = "horario:theme";
const LS_NOTIF_PREF = "horario:notifPref";
const LS_NOTIFIED_KEYS = "horario:notifiedKeys";

function loadSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}
function saveSet(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

let notifiedKeys = loadSet(LS_NOTIFIED_KEYS);

// ----------------------------------------------------------------------------
// Estado en vivo (Supabase) — compartido por toda la clase en tiempo real
// ----------------------------------------------------------------------------
let absencesByDate = {}; // { "2026-09-21": [ {id, student_name, reason, owner_token, ...}, ... ] }
let tasksList = [];
let dayOverridesList = []; // avisos de huelgas/festivos locales/traspasos (ver buildEffectiveHoliday)

// Combina el calendario oficial (HOLIDAY_MAP) con los avisos que ha puesto la
// clase: "closed" añade un día sin clase que no estaba en el calendario
// oficial (huelga, festivo local...); "open" quita un festivo oficial que se
// ha trasladado a otro día. Si hay varios avisos para el mismo día, "closed"
// gana siempre (por seguridad, ante la duda no hay clase).
function effectiveHoliday(iso) {
  const closed = dayOverridesList.find((o) => o.date === iso && o.kind === "closed");
  if (closed) return { holiday: true, label: closed.label || "Aviso de la clase: no hay clase", override: closed };
  const open = dayOverridesList.find((o) => o.date === iso && o.kind === "open");
  if (open) return { holiday: false, override: open };
  if (HOLIDAY_MAP[iso]) return { holiday: true, label: HOLIDAY_MAP[iso] };
  return { holiday: false };
}

function groupAbsences(rows) {
  const map = {};
  rows.forEach((row) => {
    (map[row.class_date] ??= []).push(row);
  });
  return map;
}

function applyAbsenceChange(payload) {
  if (payload.eventType === "INSERT") {
    const row = payload.new;
    const arr = (absencesByDate[row.class_date] ??= []);
    if (!arr.some((a) => a.id === row.id)) arr.push(row);
  } else if (payload.eventType === "DELETE") {
    const row = payload.old;
    const arr = absencesByDate[row.class_date];
    if (arr) absencesByDate[row.class_date] = arr.filter((a) => a.id !== row.id);
  } else if (payload.eventType === "UPDATE") {
    const row = payload.new;
    const arr = absencesByDate[row.class_date];
    if (arr) {
      const idx = arr.findIndex((a) => a.id === row.id);
      if (idx >= 0) arr[idx] = row;
    }
  }
}

function applyTaskChange(payload) {
  if (payload.eventType === "INSERT") {
    if (!tasksList.some((t) => t.id === payload.new.id)) tasksList.push(payload.new);
  } else if (payload.eventType === "DELETE") {
    tasksList = tasksList.filter((t) => t.id !== payload.old.id);
  } else if (payload.eventType === "UPDATE") {
    const idx = tasksList.findIndex((t) => t.id === payload.new.id);
    if (idx >= 0) tasksList[idx] = payload.new;
  }
}

function applyOverrideChange(payload) {
  if (payload.eventType === "INSERT") {
    if (!dayOverridesList.some((o) => o.id === payload.new.id)) dayOverridesList.push(payload.new);
  } else if (payload.eventType === "DELETE") {
    dayOverridesList = dayOverridesList.filter((o) => o.id !== payload.old.id);
  } else if (payload.eventType === "UPDATE") {
    const idx = dayOverridesList.findIndex((o) => o.id === payload.new.id);
    if (idx >= 0) dayOverridesList[idx] = payload.new;
  }
}

async function loadAndSubscribe() {
  const [absences, tasks, overrides] = await Promise.all([fetchAbsences(), fetchTasks(), fetchDayOverrides()]);
  absencesByDate = groupAbsences(absences);
  tasksList = tasks;
  dayOverridesList = overrides;
  render();
  renderOverrides();

  subscribeAbsences((payload) => {
    applyAbsenceChange(payload);
    render();
  });
  subscribeTasks((payload) => {
    applyTaskChange(payload);
    renderTasks();
  });
  subscribeDayOverrides((payload) => {
    applyOverrideChange(payload);
    render();
    renderOverrides();
  });

  if (localStorage.getItem(LS_NOTIF_PREF) === "on") scheduleTodayReminders();
}

// ----------------------------------------------------------------------------
// Tema (claro / oscuro). Arranca según el sistema la primera vez; a partir
// de ahí es un interruptor simple de dos estados (antes tenía un tercer
// estado "automático" que compartía el mismo icono que "oscuro", por eso se
// sentía roto: a veces tocar el botón no parecía cambiar nada).
// ----------------------------------------------------------------------------
const root = document.documentElement;

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function currentTheme() {
  const stored = localStorage.getItem(LS_THEME);
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark() ? "dark" : "light";
}

function applyTheme(mode) {
  root.setAttribute("data-theme", mode);
  renderThemeIcon(mode);
}

function renderThemeIcon(mode) {
  const btn = document.getElementById("themeBtn");
  btn.innerHTML = mode === "dark" ? ICONS["sun"] : ICONS["moon"];
  btn.title = mode === "dark" ? "Modo oscuro (toca para claro)" : "Modo claro (toca para oscuro)";
}

function setTheme(mode) {
  localStorage.setItem(LS_THEME, mode);
  applyTheme(mode);
}
function cycleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

applyTheme(currentTheme());
document.getElementById("themeBtn").addEventListener("click", cycleTheme);
document.getElementById("brandIcon").innerHTML = ICONS["book-open"];
document.getElementById("tasksIcon").innerHTML = ICONS["bookmark2"];

// ----------------------------------------------------------------------------
// Notificaciones del navegador
// ----------------------------------------------------------------------------
function notifSupported() {
  return "Notification" in window;
}

function renderNotifIcon() {
  const btn = document.getElementById("notifBtn");
  if (!notifSupported()) {
    btn.innerHTML = ICONS["bell-ring"];
    btn.style.opacity = "0.35";
    btn.title = "Tu navegador no soporta notificaciones";
    return;
  }
  const perm = Notification.permission;
  btn.style.opacity = "1";
  btn.innerHTML = ICONS["bell-ring"];
  btn.title =
    perm === "granted" ? "Notificaciones activadas (toca para probar)"
    : perm === "denied" ? "Notificaciones bloqueadas en el navegador"
    : "Activar notificaciones";
}

async function requestNotifPermission() {
  if (!notifSupported()) {
    showToast("Este navegador no admite notificaciones");
    return;
  }
  if (Notification.permission === "granted") {
    new Notification("🔔 Notificaciones activadas", {
      body: "Te avisaré de tus clases mientras esta pestaña esté abierta.",
    });
    return;
  }
  if (Notification.permission === "denied") {
    showToast("Las notificaciones están bloqueadas para este sitio en tu navegador");
    return;
  }
  const result = await Notification.requestPermission();
  renderNotifIcon();
  if (result === "granted") {
    localStorage.setItem(LS_NOTIF_PREF, "on");
    new Notification("🔔 ¡Listo!", { body: "Te avisaré antes de cada clase mientras tengas esta pestaña abierta." });
    scheduleTodayReminders();
  } else {
    showToast("No se activaron las notificaciones");
  }
}

function notify(title, body) {
  if (notifSupported() && Notification.permission === "granted") {
    try {
      new Notification(title, { body });
      return;
    } catch {
      /* fall through to toast */
    }
  }
  showToast(`${title} — ${body}`);
}

document.getElementById("notifBtn").addEventListener("click", requestNotifPermission);
renderNotifIcon();

// Programa un aviso ~10 min antes de cada clase de HOY (si no has avisado que
// faltas), mientras la pestaña siga abierta. Las notificaciones reales tras
// cerrar el navegador requerirían un servidor push, que esta web estática no
// tiene.
const REMINDER_LEAD_MIN = 10;
function scheduleTodayReminders() {
  if (!notifSupported() || Notification.permission !== "granted") return;
  const now = new Date();
  const iso = toISO(now);
  if (effectiveHoliday(iso).holiday || iso < COURSE_START || iso > COURSE_END) return;
  const weekday = now.getDay();
  if (weekday === 0 || weekday === 6) return;
  const iAmOut = (absencesByDate[iso] || []).some((a) => isOwn(a));
  if (iAmOut) return;

  const exception = SCHEDULE_EXCEPTIONS[iso];
  const classes = (WEEK_SCHEDULE[weekday] || []).filter((c) => {
    if (exception && exception.onlyFrom) return timeToMinutes(c.end) > timeToMinutes(exception.onlyFrom);
    return true;
  });

  const nowMin = now.getHours() * 60 + now.getMinutes();
  classes.forEach((c) => {
    const key = `${iso}-${c.start}`;
    if (notifiedKeys.has(key)) return;
    const startMin = timeToMinutes(c.start);
    const fireMin = startMin - REMINDER_LEAD_MIN;
    const delay = (fireMin - nowMin) * 60 * 1000;
    if (delay <= 0 || delay > 1000 * 60 * 60 * 12) return; // ya pasó o demasiado lejos
    setTimeout(() => {
      notify(`📚 ${c.subject} en ${REMINDER_LEAD_MIN} min`, `${c.start}–${c.end} · ${c.teacher}`);
      notifiedKeys.add(key);
      saveSet(LS_NOTIFIED_KEYS, notifiedKeys);
    }, delay);
  });
}

// ----------------------------------------------------------------------------
// Toast
// ----------------------------------------------------------------------------
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// ----------------------------------------------------------------------------
// Navegación por semanas
// ----------------------------------------------------------------------------
const courseStartDate = isoToDate(COURSE_START);
const courseEndDate = isoToDate(COURSE_END);

let currentWeekStart = startOfWeek(new Date());
if (currentWeekStart < startOfWeek(courseStartDate)) currentWeekStart = startOfWeek(courseStartDate);

let selectedDayIndex = clampToWeekday(new Date().getDay());

function clampToWeekday(jsDay) {
  // jsDay: 0 domingo..6 sábado -> índice 0..4 (lunes..viernes)
  if (jsDay === 0 || jsDay === 6) return 0;
  return jsDay - 1;
}

function weekDates(weekStart) {
  return [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i));
}

document.getElementById("prevWeek").innerHTML = ICONS["chevron-left"];
document.getElementById("nextWeek").innerHTML = ICONS["chevron-right"];
document.getElementById("prevWeek").addEventListener("click", () => changeWeek(-1));
document.getElementById("nextWeek").addEventListener("click", () => changeWeek(1));

function changeWeek(delta) {
  const next = addDays(currentWeekStart, delta * 7);
  if (next < startOfWeek(courseStartDate) || next > startOfWeek(courseEndDate)) return;
  currentWeekStart = next;
  render();
}

// ----------------------------------------------------------------------------
// Render de pestañas de día
// ----------------------------------------------------------------------------
function render() {
  const dates = weekDates(currentWeekStart);
  const todayISO = toISO(new Date());

  document.getElementById("weekLabel").innerHTML =
    `<strong>${fmtShort(dates[0])} – ${fmtShort(dates[4])}</strong> · ${dates[0].toLocaleDateString("es-ES", { month: "long", year: "numeric" })}`;

  const tabsEl = document.getElementById("dayTabs");
  tabsEl.innerHTML = "";
  dates.forEach((date, i) => {
    const iso = toISO(date);
    const isHoliday = effectiveHoliday(iso).holiday;
    const absenceCount = (absencesByDate[iso] || []).length;
    const btn = document.createElement("button");
    btn.className = "day-tab";
    if (i === selectedDayIndex) btn.classList.add("active");
    if (isHoliday) btn.classList.add("is-holiday");
    if (iso === todayISO) btn.classList.add("is-today");
    btn.innerHTML = `${DAY_SHORT[date.getDay()]}<span class="sub">${fmtShort(date)}</span>${
      absenceCount > 0 && !isHoliday ? `<span class="absence-count">${absenceCount}</span>` : ""
    }`;
    btn.addEventListener("click", () => {
      selectedDayIndex = i;
      render();
    });
    tabsEl.appendChild(btn);
  });

  renderDay(dates[selectedDayIndex]);
  renderTasks();
}

// ----------------------------------------------------------------------------
// Render del contenido del día seleccionado
// ----------------------------------------------------------------------------
function renderDay(date) {
  const iso = toISO(date);
  const weekday = date.getDay();
  const content = document.getElementById("dayContent");
  content.innerHTML = "";

  const holidayInfo = effectiveHoliday(iso);
  const exception = SCHEDULE_EXCEPTIONS[iso];
  const beforeCourseStart = iso < COURSE_START;
  const afterCourseEnd = iso > COURSE_END;

  const heading = document.createElement("div");
  heading.style.cssText = "font-size:16px;font-weight:700;margin:2px 0 12px;";
  heading.textContent = `${DAY_NAMES[weekday]}, ${fmtLong(date)}`;
  content.appendChild(heading);

  if (beforeCourseStart || afterCourseEnd) {
    const banner = document.createElement("div");
    banner.className = "day-banner exception";
    banner.innerHTML = beforeCourseStart
      ? `${ICONS["calendar-x"]}<div><strong>El curso aún no ha empezado.</strong><br/>Tu primer día es el ${fmtLong(isoToDate(COURSE_START))}.</div>`
      : `${ICONS["calendar-x"]}<div><strong>El curso ya ha terminado.</strong></div>`;
    content.appendChild(banner);
    return;
  }

  if (holidayInfo.holiday) {
    const banner = document.createElement("div");
    banner.className = "day-banner holiday";
    banner.innerHTML = `${ICONS["calendar-x"]}<div><strong>${escapeHtml(holidayInfo.label)}</strong><br/>No hay clase este día.</div>`;
    content.appendChild(banner);
    return;
  }

  if (holidayInfo.override) {
    const banner = document.createElement("div");
    banner.className = "day-banner exception";
    banner.innerHTML = `${ICONS["calendar-check"]}<div><strong>Traspaso de festivo</strong>${
      holidayInfo.override.label ? `: ${escapeHtml(holidayInfo.override.label)}` : ""
    }<br/>Aunque el calendario oficial dijera que era festivo, hoy sí hay clase.</div>`;
    content.appendChild(banner);
  }

  if (exception) {
    const banner = document.createElement("div");
    banner.className = "day-banner exception";
    banner.innerHTML = `${ICONS["alert-triangle"]}<div>${exception.label}</div>`;
    content.appendChild(banner);
  }

  let classes = WEEK_SCHEDULE[weekday] || [];
  if (exception && exception.onlyFrom) {
    classes = classes.filter((c) => timeToMinutes(c.end) > timeToMinutes(exception.onlyFrom));
  }

  if (classes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No tienes clases programadas este día.";
    content.appendChild(empty);
  } else {
    const list = document.createElement("div");
    list.className = "class-list";
    classes.forEach((c) => {
      const card = document.createElement("div");
      card.className = "class-card";
      card.style.setProperty("--subject-color", SUBJECT_COLORS[c.subject] || "");
      card.innerHTML = `
        <div class="class-time"><span class="start">${c.start}</span><span class="end">${c.end}</span></div>
        <div class="class-body">
          <p class="class-title">${c.subject}</p>
          <p class="class-teacher">${ICONS["user"]}${c.teacher}</p>
        </div>`;
      list.appendChild(card);
    });
    content.appendChild(list);
  }

  content.appendChild(buildAbsenceSection(iso));
}

// ----------------------------------------------------------------------------
// Avisos de falta (en tiempo real, compartidos con toda la clase)
// ----------------------------------------------------------------------------
function buildAbsenceSection(iso) {
  const dayAbsences = (absencesByDate[iso] || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const section = document.createElement("div");
  section.className = "absence-section";

  const heading = document.createElement("div");
  heading.className = "absence-heading";
  heading.innerHTML = `${ICONS["user"]}Quién no va este día (${dayAbsences.length})`;
  section.appendChild(heading);

  const listWrap = document.createElement("div");
  if (dayAbsences.length === 0) {
    listWrap.innerHTML = `<div class="empty-inline">Nadie ha avisado que falta este día.</div>`;
  } else {
    dayAbsences.forEach((a) => {
      const item = document.createElement("div");
      item.className = "absence-item";
      const initial = (a.student_name || "?").trim().charAt(0).toUpperCase() || "?";
      item.innerHTML = `
        <div class="absence-avatar">${initial}</div>
        <div class="absence-info">
          <p class="absence-name">${escapeHtml(a.student_name)}</p>
          ${a.reason ? `<p class="absence-reason">${escapeHtml(a.reason)}</p>` : ""}
        </div>`;
      if (isOwn(a)) {
        const delBtn = document.createElement("button");
        delBtn.className = "absence-del";
        delBtn.title = "Borrar mi aviso";
        delBtn.innerHTML = ICONS["x"];
        delBtn.addEventListener("click", async () => {
          delBtn.disabled = true;
          const ok = await deleteAbsence(a.id);
          if (ok) {
            applyAbsenceChange({ eventType: "DELETE", old: a });
            render();
          } else {
            delBtn.disabled = false;
            showToast("No se pudo borrar, prueba de nuevo");
          }
        });
        item.appendChild(delBtn);
      }
      listWrap.appendChild(item);
    });
  }
  section.appendChild(listWrap);

  const form = document.createElement("form");
  form.className = "inline-form";
  form.hidden = true;
  form.innerHTML = `
    <input type="text" name="name" placeholder="Tu nombre" required maxlength="60" />
    <input type="text" name="reason" placeholder="Motivo (opcional)" maxlength="140" />
    <div class="inline-form-actions">
      <button type="button" class="btn" data-cancel>Cancelar</button>
      <button type="submit" class="btn primary">Enviar aviso</button>
    </div>`;
  section.appendChild(form);

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "btn danger";
  toggleBtn.innerHTML = `${ICONS["x-circle"]} Avisar que no voy`;
  toggleBtn.addEventListener("click", () => {
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input[name="name"]').focus();
  });
  section.appendChild(toggleBtn);

  form.querySelector("[data-cancel]").addEventListener("click", () => {
    form.hidden = true;
    form.reset();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const reason = form.reason.value.trim();
    if (!name) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const row = await addAbsence(iso, name, reason);
    submitBtn.disabled = false;
    if (row) {
      applyAbsenceChange({ eventType: "INSERT", new: row });
      form.reset();
      form.hidden = true;
      render();
    } else {
      showToast("No se pudo enviar el aviso, prueba de nuevo");
    }
  });

  return section;
}

// ----------------------------------------------------------------------------
// Tareas a entregar (en tiempo real, compartidas con toda la clase)
// ----------------------------------------------------------------------------
function renderTasks() {
  const listEl = document.getElementById("taskList");
  listEl.innerHTML = "";

  if (!tasksList || tasksList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay tareas pendientes añadidas todavía.";
    listEl.appendChild(empty);
    return;
  }

  const now = new Date();
  const sorted = [...tasksList].sort((a, b) => new Date(a.due) - new Date(b.due));

  sorted.forEach((task) => {
    const dueDate = new Date(task.due);
    const overdue = dueDate < now;
    const card = document.createElement("div");
    card.className = "task-card";
    const dot = document.createElement("span");
    dot.className = "subj-dot";
    dot.style.setProperty("--subject-color", SUBJECT_COLORS[task.subject] || "");
    card.appendChild(dot);

    const info = document.createElement("div");
    info.className = "task-info";
    info.innerHTML = `
      <p class="task-title">${escapeHtml(task.title)}</p>
      <p class="task-meta ${overdue ? "overdue" : ""}">${escapeHtml(task.subject)} · ${dueDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${dueDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}${overdue ? " · vencida" : ""}</p>
    `;
    card.appendChild(info);

    const safeLink = sanitizeUrl(task.link);
    if (safeLink) {
      const a = document.createElement("a");
      a.className = "task-link";
      a.href = safeLink;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = ICONS["link6"];
      card.appendChild(a);
    }

    if (isOwn(task)) {
      const delBtn = document.createElement("button");
      delBtn.className = "absence-del";
      delBtn.title = "Borrar tarea";
      delBtn.innerHTML = ICONS["x"];
      delBtn.addEventListener("click", async () => {
        delBtn.disabled = true;
        const ok = await deleteTask(task.id);
        if (ok) {
          applyTaskChange({ eventType: "DELETE", old: task });
          renderTasks();
        } else {
          delBtn.disabled = false;
          showToast("No se pudo borrar, prueba de nuevo");
        }
      });
      card.appendChild(delBtn);
    }

    listEl.appendChild(card);
  });
}

// ----------------------------------------------------------------------------
// Avisos para toda la clase (huelgas, festivos locales, traspasos de festivo)
// — en tiempo real y compartidos, igual que las tareas y las faltas.
// ----------------------------------------------------------------------------
document.getElementById("noticesIcon").innerHTML = ICONS["alert-triangle"];

function fmtNoticeDate(iso) {
  return isoToDate(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

function renderOverrides() {
  const listEl = document.getElementById("noticeList");
  listEl.innerHTML = "";

  const sorted = [...dayOverridesList].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nadie ha avisado de huelgas, festivos locales ni traspasos todavía.";
    listEl.appendChild(empty);
    return;
  }

  sorted.forEach((o) => {
    const item = document.createElement("div");
    item.className = "absence-item";
    const closed = o.kind === "closed";
    item.innerHTML = `
      <div class="absence-avatar">${closed ? ICONS["calendar-x"] : ICONS["calendar-check"]}</div>
      <div class="absence-info">
        <p class="absence-name">${fmtNoticeDate(o.date)} · ${closed ? "No hay clase" : "Sí hay clase"}</p>
        ${o.label ? `<p class="absence-reason">${escapeHtml(o.label)}</p>` : ""}
      </div>`;
    if (isOwn(o)) {
      const delBtn = document.createElement("button");
      delBtn.className = "absence-del";
      delBtn.title = "Borrar aviso";
      delBtn.innerHTML = ICONS["x"];
      delBtn.addEventListener("click", async () => {
        delBtn.disabled = true;
        const ok = await deleteDayOverride(o.id);
        if (ok) {
          applyOverrideChange({ eventType: "DELETE", old: o });
          render();
          renderOverrides();
        } else {
          delBtn.disabled = false;
          showToast("No se pudo borrar, prueba de nuevo");
        }
      });
      item.appendChild(delBtn);
    }
    listEl.appendChild(item);
  });
}

const addNoticeBtn = document.getElementById("addNoticeBtn");
const noticeForm = document.getElementById("noticeForm");
addNoticeBtn.textContent = "+";
addNoticeBtn.style.fontSize = "20px";
addNoticeBtn.style.fontWeight = "700";
addNoticeBtn.title = "Añadir aviso";

addNoticeBtn.addEventListener("click", () => {
  noticeForm.hidden = !noticeForm.hidden;
  if (!noticeForm.hidden) document.getElementById("noticeDate").focus();
});
document.getElementById("noticeCancelBtn").addEventListener("click", () => {
  noticeForm.hidden = true;
  noticeForm.reset();
});
noticeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const date = document.getElementById("noticeDate").value;
  const kind = document.getElementById("noticeKind").value;
  const label = document.getElementById("noticeLabel").value.trim();
  if (!date || !kind) return;
  const submitBtn = noticeForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  const row = await addDayOverride(date, kind, label);
  submitBtn.disabled = false;
  if (row) {
    applyOverrideChange({ eventType: "INSERT", new: row });
    render();
    renderOverrides();
    noticeForm.reset();
    noticeForm.hidden = true;
  } else {
    showToast("No se pudo enviar el aviso, prueba de nuevo");
  }
});

// ----------------------------------------------------------------------------
// Sincronizar con Google Calendar / Calendario de iCloud-Apple (enlace .ics
// suscribible — ver assets/db.js y supabase/functions/calendar-feed).
// ----------------------------------------------------------------------------
document.getElementById("syncIcon").innerHTML = ICONS["calendar-check"];
const syncToggleBtn = document.getElementById("syncToggleBtn");
const syncPanel = document.getElementById("syncPanel");
syncToggleBtn.innerHTML = ICONS["link6"];

const feedUrl = calendarFeedUrl(localStorage.getItem(LS_SITEKEY));
const feedUrlWebcal = feedUrl.replace(/^https?:/, "webcal:");
document.getElementById("syncGoogleBtn").href =
  "https://calendar.google.com/calendar/r/settings/addbyurl?cid=" + encodeURIComponent(feedUrl);
document.getElementById("syncAppleBtn").href = feedUrlWebcal;

syncToggleBtn.addEventListener("click", () => {
  syncPanel.hidden = !syncPanel.hidden;
});

document.getElementById("syncCopyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(feedUrl);
    showToast("Enlace copiado");
  } catch {
    showToast(feedUrl);
  }
});

const addTaskBtn = document.getElementById("addTaskBtn");
const taskForm = document.getElementById("taskForm");
addTaskBtn.textContent = "+";
addTaskBtn.style.fontSize = "20px";
addTaskBtn.style.fontWeight = "700";
addTaskBtn.title = "Añadir tarea";

addTaskBtn.addEventListener("click", () => {
  taskForm.hidden = !taskForm.hidden;
  if (!taskForm.hidden) {
    document.getElementById("subjectList").innerHTML = Object.keys(SUBJECT_COLORS)
      .map((s) => `<option value="${escapeHtml(s)}"></option>`)
      .join("");
    document.getElementById("taskSubject").focus();
  }
});
document.getElementById("taskCancelBtn").addEventListener("click", () => {
  taskForm.hidden = true;
  taskForm.reset();
});
taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const subject = document.getElementById("taskSubject").value.trim();
  const title = document.getElementById("taskTitle").value.trim();
  const dueLocal = document.getElementById("taskDue").value;
  const link = document.getElementById("taskLink").value.trim();
  if (!subject || !title || !dueLocal) return;
  const submitBtn = taskForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  const dueISO = new Date(dueLocal).toISOString();
  const row = await addTask(subject, title, dueISO, link);
  submitBtn.disabled = false;
  if (row) {
    applyTaskChange({ eventType: "INSERT", new: row });
    renderTasks();
    taskForm.reset();
    taskForm.hidden = true;
  } else {
    showToast("No se pudo añadir la tarea, prueba de nuevo");
  }
});

// ----------------------------------------------------------------------------
// Service worker (permite instalar la web y verla offline). Si se publica una
// versión nueva, se recarga sola una vez para que nunca se quede pillada en
// una copia vieja guardada en el navegador.
// ----------------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    location.reload();
  });
}

loadAndSubscribe();
}


// ----------------------------------------------------------------------------
// Bloqueo con contraseña. Verificarla en el navegador (comparando su hash)
// es solo la primera barrera y, al ser una web estática, alguien con el
// código fuente podría llegar a intentar romperla por fuerza bruta. La
// protección de verdad está en Supabase: sin escribir la contraseña
// correcta aquí nunca se calcula la clave que la base de datos exige (ver
// assets/db.js), así que aunque alguien se salte esta pantalla a mano
// tocando el HTML, no consigue leer ni escribir ni un solo dato.
// ----------------------------------------------------------------------------
const LS_UNLOCKED = "horario:unlocked";
const LS_SITEKEY = "horario:siteKey";
const LS_ATTEMPTS = "horario:lockAttempts";
const PASSWORD_HASH = "18ee924cb67c6f6550c06fe2fa14a2e427d2c239c55c19d89de5cd5ffaa59030";

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isUnlocked() {
  return localStorage.getItem(LS_UNLOCKED) === "1" && !!localStorage.getItem(LS_SITEKEY);
}

function showApp() {
  configureDb(localStorage.getItem(LS_SITEKEY));
  document.getElementById("lockScreen").hidden = true;
  document.getElementById("app").hidden = false;
  boot();
}

// Freno sencillo: cada fallo espera un poco más antes de dejar volver a
// probar (no detiene a quien llama a la función directamente desde la
// consola, pero sí frena los intentos repetidos desde el formulario).
function getAttempts() {
  return Number(localStorage.getItem(LS_ATTEMPTS) || "0");
}
function attemptDelayMs(attempts) {
  return Math.min(attempts * attempts * 500, 15000);
}

function initLock() {
  const lockIconEl = document.getElementById("lockIcon");
  if (lockIconEl) lockIconEl.innerHTML = ICONS["lock-keyhole"];

  if (isUnlocked()) {
    showApp();
    return;
  }

  document.getElementById("lockScreen").hidden = false;
  document.getElementById("app").hidden = true;

  const form = document.getElementById("lockForm");
  const input = document.getElementById("lockInput");
  const error = document.getElementById("lockError");
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const wait = attemptDelayMs(getAttempts());
    if (wait > 0) {
      submitBtn.disabled = true;
      error.hidden = false;
      error.textContent = `Espera ${Math.ceil(wait / 1000)}s antes de volver a probar.`;
      await new Promise((r) => setTimeout(r, wait));
      submitBtn.disabled = false;
    }

    const hash = await sha256Hex(input.value);
    if (hash === PASSWORD_HASH) {
      localStorage.removeItem(LS_ATTEMPTS);
      error.hidden = true;
      const siteKey = await computeSiteKey(input.value);
      localStorage.setItem(LS_UNLOCKED, "1");
      localStorage.setItem(LS_SITEKEY, siteKey);
      showApp();
    } else {
      localStorage.setItem(LS_ATTEMPTS, String(getAttempts() + 1));
      error.hidden = false;
      error.textContent = "Contraseña incorrecta.";
      input.value = "";
      input.focus();
    }
  });
  input.focus();
}

initLock();
