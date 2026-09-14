import { ICONS } from "./icons.js";
import {
  WEEK_SCHEDULE,
  SUBJECT_COLORS,
  SCHEDULE_EXCEPTIONS,
  HOLIDAY_MAP,
  TASKS,
  COURSE_START,
  COURSE_END,
} from "./schedule-data.js";

function boot() {

// ----------------------------------------------------------------------------
// Utilidades de fecha
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

// ----------------------------------------------------------------------------
// Estado persistente (localStorage) — es personal de cada navegador/alumno
// ----------------------------------------------------------------------------
const LS_SKIPPED = "horario:skippedDates";
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

let skippedDates = loadSet(LS_SKIPPED);
let notifiedKeys = loadSet(LS_NOTIFIED_KEYS);

// ----------------------------------------------------------------------------
// Tema (claro / oscuro / automático)
// ----------------------------------------------------------------------------
const root = document.documentElement;

function applyTheme(mode) {
  if (mode === "light") root.setAttribute("data-theme", "light");
  else if (mode === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme"); // sistema
  renderThemeIcon(mode);
}

function renderThemeIcon(mode) {
  const btn = document.getElementById("themeBtn");
  const icon = mode === "dark" ? ICONS["sun"] : mode === "light" ? ICONS["moon"] : ICONS["sun"];
  btn.innerHTML = icon;
  btn.title =
    mode === "light" ? "Modo claro (toca para oscuro)"
    : mode === "dark" ? "Modo oscuro (toca para automático)"
    : "Tema automático (toca para claro)";
}

function getTheme() {
  return localStorage.getItem(LS_THEME) || "auto";
}
function setTheme(mode) {
  localStorage.setItem(LS_THEME, mode);
  applyTheme(mode);
}
function cycleTheme() {
  const cur = getTheme();
  const next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
  setTheme(next);
}

applyTheme(getTheme());
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
      body: "Te avisaré de tus clases y de los cambios de día mientras esta pestaña esté abierta.",
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

// Programa un aviso ~10 min antes de cada clase de HOY que no se haya saltado,
// mientras la pestaña siga abierta (las notificaciones reales tras cerrar el
// navegador requerirían un servidor push, que esta web estática no tiene).
const REMINDER_LEAD_MIN = 10;
function scheduleTodayReminders() {
  if (!notifSupported() || Notification.permission !== "granted") return;
  const now = new Date();
  const iso = toISO(now);
  if (HOLIDAY_MAP[iso] || iso < COURSE_START || iso > COURSE_END) return;
  const weekday = now.getDay();
  if (weekday === 0 || weekday === 6) return;
  if (skippedDates.has(iso)) return;

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
if (localStorage.getItem(LS_NOTIF_PREF) === "on") scheduleTodayReminders();

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
    const isHoliday = !!HOLIDAY_MAP[iso];
    const isSkipped = skippedDates.has(iso);
    const btn = document.createElement("button");
    btn.className = "day-tab";
    if (i === selectedDayIndex) btn.classList.add("active");
    if (isHoliday) btn.classList.add("is-holiday");
    if (isSkipped && !isHoliday) btn.classList.add("is-skipped");
    if (iso === todayISO) btn.classList.add("is-today");
    btn.innerHTML = `${DAY_SHORT[date.getDay()]}<span class="sub">${fmtShort(date)}</span>`;
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

  const holidayLabel = HOLIDAY_MAP[iso];
  const exception = SCHEDULE_EXCEPTIONS[iso];
  const isSkipped = skippedDates.has(iso);
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

  if (holidayLabel) {
    const banner = document.createElement("div");
    banner.className = "day-banner holiday";
    banner.innerHTML = `${ICONS["calendar-x"]}<div><strong>${holidayLabel}</strong><br/>No hay clase este día.</div>`;
    content.appendChild(banner);
    return;
  }

  if (exception) {
    const banner = document.createElement("div");
    banner.className = "day-banner exception";
    banner.innerHTML = `${ICONS["alert-triangle"]}<div>${exception.label}</div>`;
    content.appendChild(banner);
  }

  if (isSkipped) {
    const banner = document.createElement("div");
    banner.className = "day-banner exception";
    banner.innerHTML = `${ICONS["x-circle"]}<div><strong>Marcaste que no vas este día.</strong> Las clases se muestran tachadas de referencia.</div>`;
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
      card.className = "class-card" + (isSkipped ? " skipped" : "");
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

  const actions = document.createElement("div");
  actions.className = "day-actions";

  const skipBtn = document.createElement("button");
  skipBtn.className = "btn danger" + (isSkipped ? " is-active" : "");
  skipBtn.innerHTML = isSkipped
    ? `${ICONS["check-circle"]} Sí voy este día`
    : `${ICONS["x-circle"]} No voy este día`;
  skipBtn.addEventListener("click", () => toggleSkip(iso));
  actions.appendChild(skipBtn);

  content.appendChild(actions);
}

function toggleSkip(iso) {
  const nowSkipped = skippedDates.has(iso);
  if (nowSkipped) {
    skippedDates.delete(iso);
    notify("✅ Día restaurado", `Vuelves a tener marcado ${iso} como día de clase normal.`);
  } else {
    skippedDates.add(iso);
    notify("🚫 Día quitado", `Has marcado ${iso} como día sin asistir.`);
  }
  saveSet(LS_SKIPPED, skippedDates);
  render();
}

// ----------------------------------------------------------------------------
// Tareas a entregar
// ----------------------------------------------------------------------------
function renderTasks() {
  const listEl = document.getElementById("taskList");
  listEl.innerHTML = "";

  if (!TASKS || TASKS.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay tareas pendientes añadidas todavía.";
    listEl.appendChild(empty);
    return;
  }

  const now = new Date();
  const sorted = [...TASKS].sort((a, b) => new Date(a.due) - new Date(b.due));

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
      <p class="task-title">${task.title}</p>
      <p class="task-meta ${overdue ? "overdue" : ""}">${task.subject} · ${dueDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${dueDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}${overdue ? " · vencida" : ""}</p>
    `;
    card.appendChild(info);

    if (task.link) {
      const a = document.createElement("a");
      a.className = "task-link";
      a.href = task.link;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = ICONS["link6"];
      card.appendChild(a);
    }
    listEl.appendChild(card);
  });
}

// ----------------------------------------------------------------------------
// Service worker (opcional, permite instalar la web y verla offline)
// ----------------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
  render();
}


// ----------------------------------------------------------------------------
// Bloqueo con contraseña (solo un filtro básico: al ser una web estática,
// el hash es visible en el código fuente, así que no sustituye a una
// autenticación real, pero evita que se vea el horario a simple vista)
// ----------------------------------------------------------------------------
const LS_UNLOCKED = "horario:unlocked";
const PASSWORD_HASH = "18ee924cb67c6f6550c06fe2fa14a2e427d2c239c55c19d89de5cd5ffaa59030";

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isUnlocked() {
  return localStorage.getItem(LS_UNLOCKED) === "1";
}

function showApp() {
  document.getElementById("lockScreen").hidden = true;
  document.getElementById("app").hidden = false;
  boot();
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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hash = await sha256Hex(input.value);
    if (hash === PASSWORD_HASH) {
      error.hidden = true;
      localStorage.setItem(LS_UNLOCKED, "1");
      showApp();
    } else {
      error.hidden = false;
      input.value = "";
      input.focus();
    }
  });
  input.focus();
}

initLock();
