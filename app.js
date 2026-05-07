import { scheduleStore, formatNow, toISODate, DAYS, MORNING_HOURS, FULL_DAY_HOURS } from './schedule.js';

const ALERT_MINUTES_BEFORE = 5;
const ADVANCED_CODE_HASH = '78ebc62c48849784f70a077d3f7a4da5021eae950c0e7b609276d3e8208eeb4f';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}

const $ = (id) => document.getElementById(id);

const nowTimeEl = $('nowTime');
const nowLessonEl = $('nowLesson');
const studentDisplayEl = $('studentDisplay');
const classDisplayEl = $('classDisplay');
const dayStatusEl = $('dayStatus');
const timetableEl = $('timetable');
const editBtn = $('editBtn');
const remindersBtn = $('remindersBtn');
const settingsBtn = $('settingsBtn');
const alertsToggle = $('alertsToggle');
const showAllDaysBtn = $('showAllDays');
const showTodayBtn = $('showToday');
const showTomorrowBtn = $('showTomorrow');
const weekNavigator = $('weekNavigator');
const prevWeekBtn = $('prevWeek');
const nextWeekBtn = $('nextWeek');
const currentWeekBtn = $('currentWeek');
const weekLabelEl = $('weekLabel');
const setupModal = $('setupModal');
const setupStudent = $('setupStudent');
const setupClass = $('setupClass');
const saveSetup = $('saveSetup');
const onboardingHint = $('onboardingHint');

const editor = $('editor');
const editorGrid = $('editorGrid');
const closeEditor = $('closeEditor');
const saveSchedule = $('saveSchedule');
const cancelEdit = $('cancelEdit');

const remindersModal = $('remindersModal');
const closeReminders = $('closeReminders');
const reminderDate = $('reminderDate');
const reminderHour = $('reminderHour');
const reminderText = $('reminderText');
const addReminder = $('addReminder');
const remindersList = $('remindersList');

const settingsModal = $('settingsModal');
const closeSettings = $('closeSettings');
const cancelSettings = $('cancelSettings');
const saveSettings = $('saveSettings');
const studentNameInput = $('studentName');
const studentClassInput = $('studentClass');

const resetBtn = $('resetBtn');
const exportBtn = $('exportBtn');
const fileInput = $('scheduleFile');

const brandTrigger = $('brandTrigger');
const advancedModal = $('advancedModal');
const closeAdvanced = $('closeAdvanced');
const advancedLocked = $('advancedLocked');
const advancedTools = $('advancedTools');
const advancedCode = $('advancedCode');
const unlockAdvanced = $('unlockAdvanced');
const advancedError = $('advancedError');

let nextTimer = null;
let viewMode = 'today';
let selectedWeekStart = startOfSchoolWeek(new Date());
let brandTapCount = 0;
let brandTapTimer = null;
let brandPressTimer = null;

init();

function init(){
  setupModal.classList.toggle('hidden', scheduleStore.isConfigured());

  saveSetup.onclick = saveInitialSetup;
  editBtn.onclick = openEditor;
  closeEditor.onclick = closeEditorFunc;
  cancelEdit.onclick = closeEditorFunc;
  saveSchedule.onclick = saveEditor;

  remindersBtn.onclick = openReminders;
  closeReminders.onclick = closeRemindersFunc;
  addReminder.onclick = addReminderFunc;

  settingsBtn.onclick = openSettings;
  closeSettings.onclick = closeSettingsFunc;
  cancelSettings.onclick = closeSettingsFunc;
  saveSettings.onclick = saveSettingsFunc;

  setupAdvancedMode();

  exportBtn.onclick = exportSchedule;
  fileInput.onchange = importSchedule;
  document.querySelector('.fileButton')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });

  resetBtn.onclick = () => {
    if (!confirm('Vuoi cancellare orario, promemoria e impostazioni da questo dispositivo?')) return;
    scheduleStore.resetAll();
    alertsToggle.checked = false;
    cancelNextNotification();
    setupModal.classList.remove('hidden');
    renderAll();
  };

  showTodayBtn.onclick = () => setViewMode('today');
  showTomorrowBtn.onclick = () => setViewMode('tomorrow');
  showAllDaysBtn.onclick = () => setViewMode('week');

  prevWeekBtn.onclick = () => {
    selectedWeekStart.setDate(selectedWeekStart.getDate() - 7);
    renderTimetable();
  };

  nextWeekBtn.onclick = () => {
    selectedWeekStart.setDate(selectedWeekStart.getDate() + 7);
    renderTimetable();
  };

  currentWeekBtn.onclick = () => {
    selectedWeekStart = startOfSchoolWeek(new Date());
    renderTimetable();
  };

  restoreAlertPreference();
  populateReminderHours();
  setViewMode('today');
  renderAll();
  setInterval(tick, 30_000);

  alertsToggle.onchange = async () => {
    localStorage.setItem('alertsEnabledStudent', alertsToggle.checked ? '1':'0');
    if (alertsToggle.checked) {
      const p = await requestNotificationPermission();
      if (p !== 'granted') {
        alert('Permesso notifiche negato. Gli alert sono opzionali e l’app resta utilizzabile anche senza notifiche.');
        alertsToggle.checked = false;
        localStorage.setItem('alertsEnabledStudent', '0');
        cancelNextNotification();
        return;
      }
      scheduleNextNotification();
    } else {
      cancelNextNotification();
    }
  };
}

function setViewMode(mode){
  viewMode = mode;
  const buttons = {today: showTodayBtn, tomorrow: showTomorrowBtn, week: showAllDaysBtn};
  for (const [key, btn] of Object.entries(buttons)){
    const active = key === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  weekNavigator.classList.toggle('hidden', mode !== 'week');

  if (mode === 'week') {
    selectedWeekStart = startOfSchoolWeek(selectedWeekStart || new Date());
  }

  renderTimetable();
}

function setupAdvancedMode(){
  if (!brandTrigger || !advancedModal) return;

  brandTrigger.addEventListener('click', () => {
    brandTapCount += 1;
    clearTimeout(brandTapTimer);
    brandTapTimer = setTimeout(() => { brandTapCount = 0; }, 1800);
    if (brandTapCount >= 5) {
      brandTapCount = 0;
      openAdvancedModal();
    }
  });

  brandTrigger.addEventListener('pointerdown', () => {
    clearTimeout(brandPressTimer);
    brandPressTimer = setTimeout(openAdvancedModal, 3500);
  });

  ['pointerup','pointercancel','pointerleave'].forEach(evt => {
    brandTrigger.addEventListener(evt, () => clearTimeout(brandPressTimer));
  });

  closeAdvanced.onclick = closeAdvancedModal;
  unlockAdvanced.onclick = unlockAdvancedMode;
  advancedCode.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') unlockAdvancedMode();
  });
}

function openAdvancedModal(){
  advancedModal.classList.remove('hidden');
  advancedLocked.classList.remove('hidden');
  advancedTools.classList.add('hidden');
  advancedCode.value = '';
  advancedError.classList.add('hidden');
  setTimeout(() => advancedCode.focus(), 50);
}

function closeAdvancedModal(){
  advancedModal.classList.add('hidden');
}

async function unlockAdvancedMode(){
  const ok = await verifyAdvancedCode(advancedCode.value);
  if (!ok) {
    advancedError.classList.remove('hidden');
    advancedCode.select();
    return;
  }
  advancedError.classList.add('hidden');
  advancedLocked.classList.add('hidden');
  advancedTools.classList.remove('hidden');
}

async function verifyAdvancedCode(value){
  const normalized = String(value || '').trim().toUpperCase();
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === ADVANCED_CODE_HASH;
}

function saveInitialSetup(){
  const mode = document.querySelector('input[name="setupMode"]:checked')?.value || 'morning';
  const alerts = document.querySelector('input[name="setupAlerts"]:checked')?.value || 'off';
  const pomeridiano = mode === 'full';
  scheduleStore.setStudent(setupStudent.value);
  scheduleStore.setClass(setupClass.value);
  scheduleStore.setConfig({ pomeridiano, hours: pomeridiano ? FULL_DAY_HOURS : MORNING_HOURS });
  localStorage.setItem('alertsEnabledStudent', alerts === 'on' ? '1' : '0');
  alertsToggle.checked = alerts === 'on';
  setupModal.classList.add('hidden');
  renderAll();
}

function openSettings(){
  const config = scheduleStore.getConfig();
  studentNameInput.value = scheduleStore.getStudent();
  studentClassInput.value = scheduleStore.getClass();
  const selected = config.pomeridiano ? 'full' : 'morning';
  document.querySelectorAll('input[name="settingsMode"]').forEach(r => r.checked = r.value === selected);
  settingsModal.classList.remove('hidden');
}

function saveSettingsFunc(){
  const mode = document.querySelector('input[name="settingsMode"]:checked')?.value || 'morning';
  const pomeridiano = mode === 'full';
  scheduleStore.setStudent(studentNameInput.value);
  scheduleStore.setClass(studentClassInput.value);
  scheduleStore.setConfig({ pomeridiano, hours: pomeridiano ? FULL_DAY_HOURS : MORNING_HOURS });
  closeSettingsFunc();
  populateReminderHours();
  renderAll();
  if (alertsToggle.checked) scheduleNextNotification();
}

function closeSettingsFunc(){
  settingsModal.classList.add('hidden');
}

function renderAll(){
  renderStudentAndClass();
  renderTimetable();
  renderRemindersList();
  tick();
}

function renderStudentAndClass(){
  const student = scheduleStore.getStudent();
  const className = scheduleStore.getClass();
  const config = scheduleStore.getConfig();
  studentDisplayEl.textContent = student ? `Studente: ${student}` : 'Studente non impostato';
  classDisplayEl.textContent = className ? `Classe: ${className} · ${config.pomeridiano ? 'Mattina + pomeriggio' : 'Solo mattina'}` : 'Classe non impostata';
  onboardingHint.classList.toggle('hidden', scheduleStore.isConfigured() && !!className);
}

function renderTimetable(){
  timetableEl.innerHTML = '';
  const sched = scheduleStore.get();
  const hours = scheduleStore.getHours();
  const now = new Date();
  const today = getDateInfo(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow = getDateInfo(tomorrowDate);
  const nowSlot = scheduleStore.nowSlot(now);

  let weekDates = null;
  if (viewMode === 'week') {
    weekDates = getSchoolWeekDates(selectedWeekStart);
    updateWeekLabel(weekDates);
  }

  for (const day of DAYS) {
    let include = true;
    let dateISOForDay = null;
    let dateLabel = '';

    if (viewMode === 'today') {
      include = day === today.dayName;
      dateISOForDay = today.iso;
      dateLabel = formatDayMonth(now);
    } else if (viewMode === 'tomorrow') {
      include = day === tomorrow.dayName;
      dateISOForDay = tomorrow.iso;
      dateLabel = formatDayMonth(tomorrowDate);
    } else {
      const dateForDay = weekDates.find(item => item.dayName === day)?.date || null;
      dateISOForDay = dateForDay ? toISODate(dateForDay) : null;
      dateLabel = dateForDay ? formatDayMonth(dateForDay) : '';
    }

    if (!include) continue;

    const isToday = today.dayName === day && today.iso === dateISOForDay;
    const col = document.createElement('section');
    col.className = 'dayCol';
    col.setAttribute('aria-label', `Orario di ${day} ${dateLabel}`);
    if (isToday) col.classList.add('today');

    const title = document.createElement('div');
    title.className = 'dayTitle';
    title.innerHTML = `<span>${day}<small>${dateLabel}</small></span>${isToday ? '<span class="dayBadge">Oggi</span>' : ''}`;
    col.appendChild(title);

    for (const h of hours) {
      const rawText = sched[day] && sched[day][h] ? sched[day][h] : null;
      const text = rawText || 'Libero';
      const reminders = dateISOForDay ? scheduleStore.remindersFor(dateISOForDay, h) : [];
      const slot = document.createElement('div');
      slot.className = rawText ? 'slot' : 'slot free';

      const remindersHtml = reminders.length
        ? `<div class="reminderInline">📌 ${reminders.map(r => escapeHTML(r.text)).join('<br>📌 ')}</div>`
        : '';

      slot.innerHTML = `<span class="slotHour">${h}:00</span><span class="slotText">${escapeHTML(text)}${remindersHtml}</span>`;

      if (isToday && nowSlot.hour === h) {
        slot.classList.add('now');
        slot.setAttribute('aria-current', 'true');
      }
      col.appendChild(slot);
    }
    timetableEl.appendChild(col);
  }

  if (!timetableEl.children.length){
    timetableEl.innerHTML = `<section class="dayCol"><div class="dayTitle">Nessun giorno</div><div class="slot free"><span class="slotText">Nessun orario disponibile per questa vista.</span></div></section>`;
  }
}

function updateWeekLabel(weekDates){
  if (!weekDates || !weekDates.length) {
    weekLabelEl.textContent = 'Settimana';
    return;
  }
  const first = weekDates[0].date;
  const last = weekDates[weekDates.length - 1].date;
  weekLabelEl.textContent = `${formatDayMonth(first)} – ${formatDayMonth(last)}`;
}

function renderGrid(){
  editorGrid.innerHTML = '';
  const sched = scheduleStore.get();
  const hours = scheduleStore.getHours();
  for (const day of DAYS){
    const dayBlock = document.createElement('section');
    dayBlock.className = 'editorDay';
    const h3 = document.createElement('h3');
    h3.textContent = day;
    dayBlock.appendChild(h3);

    for (const h of hours){
      const row = document.createElement('label');
      row.className = 'editorRow';
      const span = document.createElement('span');
      span.textContent = `${h}:00`;
      const input = document.createElement('input');
      input.id = inputId(day, h);
      input.placeholder = 'Materia - Docente (Aula)';
      input.value = (sched[day] && sched[day][h]) || '';
      row.appendChild(span);
      row.appendChild(input);
      dayBlock.appendChild(row);
    }
    editorGrid.appendChild(dayBlock);
  }
}

function openEditor(){
  if (!scheduleStore.isConfigured()) setupModal.classList.remove('hidden');
  renderGrid();
  editor.classList.remove('hidden');
}

function closeEditorFunc(){
  editor.classList.add('hidden');
}

function saveEditor(){
  const hours = scheduleStore.getHours();
  const newSched = {};
  for (const day of DAYS) {
    newSched[day] = {};
    for (const h of hours) {
      const id = inputId(day, h);
      const val = document.getElementById(id).value.trim();
      newSched[day][h] = val || null;
    }
  }
  scheduleStore.set(newSched);
  closeEditorFunc();
  renderAll();
  if (alertsToggle.checked) scheduleNextNotification();
}

function openReminders(){
  reminderDate.value = toISODate(new Date());
  reminderText.value = '';
  populateReminderHours();
  renderRemindersList();
  remindersModal.classList.remove('hidden');
}

function closeRemindersFunc(){
  remindersModal.classList.add('hidden');
}

function populateReminderHours(){
  reminderHour.innerHTML = '';
  for (const h of scheduleStore.getHours()){
    const opt = document.createElement('option');
    opt.value = String(h);
    opt.textContent = `${h}:00`;
    reminderHour.appendChild(opt);
  }
}

function addReminderFunc(){
  scheduleStore.addReminder({
    date: reminderDate.value,
    hour: Number(reminderHour.value),
    text: reminderText.value
  });
  reminderText.value = '';
  renderRemindersList();
  renderTimetable();
}

function renderRemindersList(){
  remindersList.innerHTML = '';
  const items = scheduleStore.getReminders();
  if (!items.length){
    remindersList.innerHTML = '<p class="muted">Nessun promemoria salvato.</p>';
    return;
  }
  for (const item of items){
    const row = document.createElement('div');
    row.className = 'reminderItem';
    row.innerHTML = `<div><strong>${escapeHTML(item.date)} · ${item.hour}:00</strong><br>${escapeHTML(item.text)}</div>`;
    const btn = document.createElement('button');
    btn.className = 'danger smallBtn';
    btn.type = 'button';
    btn.textContent = 'Elimina';
    btn.onclick = () => {
      scheduleStore.deleteReminder(item.id);
      renderRemindersList();
      renderTimetable();
    };
    row.appendChild(btn);
    remindersList.appendChild(row);
  }
}

async function importSchedule(e){
  const f = e.target.files[0];
  if (!f) return;
  try {
    const txt = await f.text();
    scheduleStore.loadFromJSON(txt);
    setupModal.classList.add('hidden');
    renderAll();
    if (alertsToggle.checked) scheduleNextNotification();
    alert('Copia orario importata correttamente.');
  } catch(err){
    alert('Copia orario non valida o non compatibile.');
  } finally {
    fileInput.value = '';
  }
}

function exportSchedule(){
  const data = JSON.stringify(scheduleStore.exportObject(), null, 2);
  const blob = new Blob([data], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const className = scheduleStore.getClass() || 'classe';
  const safeName = className.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'classe';
  const a = document.createElement('a');
  a.href = url;
  a.download = `orario-alunni-${safeName}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function tick(){
  const now = new Date();
  nowTimeEl.textContent = formatNow(now);
  const {dayName, hour} = scheduleStore.nowSlot(now);
  const lesson = scheduleStore.getLesson(dayName, hour);
  const reminders = scheduleStore.remindersFor(toISODate(now), hour);
  dayStatusEl.textContent = dayName || 'Fuori settimana';
  const reminderText = reminders.length ? ` · 📌 ${reminders.map(r => r.text).join(' · ')}` : '';
  nowLessonEl.textContent = lesson ? `${hour}:00 — ${lesson}${reminderText}` : 'Nessuna lezione in questo orario';
  renderTimetable();
}

function isNowSlot(dayName, hour){
  const s = scheduleStore.nowSlot(new Date());
  return s.dayName === dayName && s.hour === hour;
}

async function requestNotificationPermission(){
  if (!('Notification' in window)) return 'denied';
  return await Notification.requestPermission();
}

function restoreAlertPreference(){
  const pref = localStorage.getItem('alertsEnabledStudent') === '1';
  alertsToggle.checked = pref;
  if (pref) scheduleNextNotification();
}

function scheduleNextNotification(){
  cancelNextNotification();
  const next = scheduleStore.findNextLessonNotification(new Date(), ALERT_MINUTES_BEFORE);
  if (!next) return;

  const delay = Math.max(1000, next.notifyAt.getTime() - Date.now());
  nextTimer = setTimeout(async () => {
    await showLessonNotification(next);
    scheduleNextNotification();
  }, delay);
}

function cancelNextNotification(){
  if (!nextTimer) return;
  clearTimeout(nextTimer);
  nextTimer = null;
}

async function showLessonNotification(item){
  const reminderPart = item.reminders?.length ? `\nPromemoria: ${item.reminders.map(r => r.text).join(' · ')}` : '';
  const title = `Tra ${ALERT_MINUTES_BEFORE} minuti: ${item.hour}:00`;
  const body = `${item.lesson}${reminderPart}`;

  if (navigator.serviceWorker) {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, { body, tag:`student-${item.dayName}-${item.hour}`, renotify:true });
      return;
    } catch(e) {}
  }
  if (Notification.permission === 'granted') new Notification(title, {body});
}

function inputId(day, h){
  return `cell-${day.replace(/[^a-z0-9]/gi, '')}-${h}`;
}

function getDateInfo(date){
  const dow = date.getDay();
  const dayIndex = dow === 0 ? -1 : dow - 1;
  return {
    dayName: (dayIndex >= 0 && dayIndex < DAYS.length) ? DAYS[dayIndex] : null,
    iso: toISODate(date)
  };
}

function startOfSchoolWeek(date){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay(); // 0 domenica, 1 lunedì
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getSchoolWeekDates(weekStart){
  const start = startOfSchoolWeek(weekStart);
  return DAYS.map((dayName, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return {dayName, date: d};
  });
}

function formatDayMonth(date){
  return date.toLocaleDateString('it-IT', {day:'2-digit', month:'short'});
}

function escapeHTML(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}
