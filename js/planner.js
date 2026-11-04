(() => {
  'use strict';

  // ---------- Sesión ----------
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem('fp.session')); } catch { /* sin sesión */ }
  if (!session) { location.replace('index.html'); return; }

  // ---------- Constantes ----------
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DOW_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MEMBERS = FP_CONFIG.members;
  const memberById = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));
  const HOUR_PX = 60;          // alto de una hora en la vista diaria
  const SLOT_MIN = 30;         // duración de cada franja seleccionable
  const STORE_KEY = 'fp.events.' + session.username;   // cada usuario tiene su propia agenda
  const DATA_VERSION = '2';           // al subir este número se borran las actividades guardadas
  try {
    if (localStorage.getItem('fp.dataVersion') !== DATA_VERSION) {
      Object.keys(localStorage).filter((k) => k.startsWith('fp.events')).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('fp.dataVersion', DATA_VERSION);
    }
  } catch { /* almacenamiento no disponible */ }

  /*
   * Flexible Column Layout
   * LAYOUTS[columnas máximas que caben][columnas abiertas] = variantes de reparto (%)
   * ARROWS indica, para cada variante, qué hace la flecha del separador A (1|2) y B (2|3).
   */
  const LAYOUTS = {
    3: { 1: [[100, 0, 0]], 2: [[67, 33, 0], [33, 67, 0]], 3: [[50, 25, 25], [25, 50, 25], [25, 25, 50]] },
    2: { 1: [[100, 0, 0]], 2: [[67, 33, 0], [33, 67, 0]], 3: [[0, 67, 33], [0, 33, 67]] },
    1: { 1: [[100, 0, 0]], 2: [[0, 100, 0]], 3: [[0, 0, 100]] }
  };
  const ARROWS = {
    '3-2': [{ a: ['left', 1] }, { a: ['right', 0] }],
    '3-3': [
      { a: ['left', 1], b: ['left', 2] },
      { a: ['right', 0], b: ['left', 2] },
      { a: ['right', 0], b: ['right', 1] }
    ],
    '2-2': [{ a: ['left', 1] }, { a: ['right', 0] }],
    '2-3': [{ b: ['left', 1] }, { b: ['right', 0] }]
  };

  // ---------- Utilidades ----------
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const longDate = (iso) => { const d = parseIso(iso); return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`; };

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...children.flat().filter((c) => c != null));
    return el;
  }

  // ---------- Datos ----------
  function loadEvents() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
  }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(events)); return true; }
    catch { toast('No se ha podido guardar en este navegador'); return false; }
  }
  let events = loadEvents();
  const eventsOn = (date) => events.filter((e) => e.date === date).sort((a, b) => a.start.localeCompare(b.start));

  // ---------- Estado ----------
  const state = {
    year: new Date().getFullYear(),
    date: null,          // día seleccionado (YYYY-MM-DD)
    depth: 1,            // columnas abiertas (1..3)
    variant: { 1: 0, 2: 0, 3: 0 },
    fullscreen: false,
    draft: null,         // actividad mostrada en la columna 3
    slot: null           // minuto de inicio de la franja seleccionada
  };

  // ---------- Referencias DOM ----------
  const cols = [$('col1'), $('col2'), $('col3')];
  const sepA = $('sep-a'), sepB = $('sep-b');
  const form = $('detail-form');
  const f = { name: $('f-name'), desc: $('f-desc'), date: $('f-date'), start: $('f-start'), end: $('f-end'), att: $('f-attendees'), companion: $('f-companion') };


  // Leyenda y checkboxes de asistentes
  const companions = MEMBERS.filter((m) => m.canAccompany);
  companions.forEach((m) => f.companion.append(h('option', { value: m.id }, m.name)));
  if (companions.length > 1) {
    f.companion.append(h('option', { value: companions.map((m) => m.id).join(',') },
      companions.map((m) => m.name).join(', ').replace(/, ([^,]*)$/, ' y $1')));
  }

  // "Acompañante" es obligatorio si y solo si asiste alguien marcado con needsCompanion
  function companionRequired() {
    return [...f.att.querySelectorAll('input:checked')].some((cb) => memberById[cb.value]?.needsCompanion);
  }
  function updateCompanionRequired() {
    const required = companionRequired();
    $('companion-req').hidden = !required;
    f.companion.required = required;
    f.companion.setAttribute('aria-required', String(required));
  }
  f.att.addEventListener('change', updateCompanionRequired);

  MEMBERS.forEach((m) => {
    $('legend').append(h('li', { style: `--c:${m.color}` }, h('span', { class: 'dot' }), m.name));
    f.att.append(
      h('label', { class: 'chip', style: `--c:${m.color}` },
        h('input', { type: 'checkbox', value: m.id }),
        h('span', { class: 'dot' }),
        m.name)
    );
  });

  // ============ Columna 1: calendario ============
  function renderCalendar() {
    $('year-label').textContent = state.year;
    const now = new Date();
    const today = isoOf(now);
    const byDate = {};
    for (const e of events) if (e.date.startsWith(state.year + '-')) (byDate[e.date] ||= []).push(e);

    const frag = document.createDocumentFragment();
    for (let m = 0; m < 12; m++) {
      const isCurrent = now.getFullYear() === state.year && now.getMonth() === m;
      const grid = h('div', { class: 'month__grid' },
        DOW_SHORT.map((d, i) => h('span', { class: 'month__dow' + (i >= 5 ? ' is-weekend' : ''), 'aria-hidden': 'true' }, d)));

      const offset = (new Date(state.year, m, 1).getDay() + 6) % 7; // lunes = 0
      const days = new Date(state.year, m + 1, 0).getDate();
      for (let i = 0; i < offset; i++) grid.append(h('span', { class: 'day day--empty', 'aria-hidden': 'true' }));

      for (let d = 1; d <= days; d++) {
        const date = `${state.year}-${pad(m + 1)}-${pad(d)}`;
        const dow = (offset + d - 1) % 7;
        const evs = (byDate[date] || []).sort((a, b) => a.start.localeCompare(b.start));
        const cls = ['day'];
        if (dow >= 5) cls.push('is-weekend');
        if (date === today) cls.push('is-today');
        if (date === state.date) cls.push('is-selected');
        if (evs.length) cls.push('has-events');

        const dots = evs.length
          ? h('span', { class: 'day__dots', 'aria-hidden': 'true' },
              evs.slice(0, 3).map((e) => h('i', { style: `background:${(memberById[e.attendees[0]] || {}).color || '#64748b'}` })))
          : null;

        grid.append(h('button', {
          type: 'button', class: cls.join(' '), 'data-date': date,
          'aria-pressed': String(date === state.date),
          'aria-label': `${d} de ${MONTHS[m]}${evs.length ? `, ${evs.length} ${evs.length === 1 ? 'actividad' : 'actividades'}` : ''}`
        }, h('span', { class: 'day__num' }, String(d)), dots));
      }

      frag.append(h('section', { class: 'month' + (isCurrent ? ' is-current' : '') },
        h('h3', { class: 'month__title' }, `${MONTHS[m]} ${state.year}`), grid));
    }
    $('months').replaceChildren(frag);
  }

  $('months').addEventListener('click', (e) => {
    const btn = e.target.closest('button.day');
    if (btn) selectDate(btn.dataset.date);
  });
  $('year-prev').addEventListener('click', () => { state.year--; renderCalendar(); });
  $('year-next').addEventListener('click', () => { state.year++; renderCalendar(); });
  $('btn-today').addEventListener('click', () => {
    state.year = new Date().getFullYear();
    renderCalendar();
    selectDate(isoOf(new Date()));
  });

  function selectDate(date, { keepDetail = false } = {}) {
    state.date = date;
    state.year = parseIso(date).getFullYear();
    if (!keepDetail) { state.draft = null; state.slot = null; setDepth(2); }
    renderCalendar();
    renderDay(true);
    const sel = $('months').querySelector('.day.is-selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  // ============ Columna 2: vista horaria ============
  function layoutOverlaps(list) {
    const items = list.map((e) => ({ e, s: toMin(e.start), en: Math.max(toMin(e.end), toMin(e.start) + 15) }))
      .sort((a, b) => a.s - b.s || b.en - a.en);
    const out = [];
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const ends = [];
      for (const it of cluster) {
        let c = ends.findIndex((end) => end <= it.s);
        if (c < 0) { c = ends.length; ends.push(0); }
        ends[c] = it.en; it.col = c;
      }
      cluster.forEach((it) => { it.ncols = ends.length; out.push(it); });
      cluster = []; clusterEnd = -1;
    };
    for (const it of items) {
      if (cluster.length && it.s >= clusterEnd) flush();
      cluster.push(it); clusterEnd = Math.max(clusterEnd, it.en);
    }
    if (cluster.length) flush();
    return out;
  }

  function renderDay(scroll) {
    if (!state.date) return;
    const d = parseIso(state.date);
    $('day-title').textContent = longDate(state.date);
    $('day-weekday').textContent = DOW_LONG[d.getDay()];

    const labels = h('div', { class: 'timeline__labels', 'aria-hidden': 'true' });
    const area = h('div', { class: 'timeline__area', style: `height:${24 * HOUR_PX}px` });
    for (let hr = 0; hr < 24; hr++) {
      labels.append(h('span', { style: `top:${hr * HOUR_PX}px` }, String(hr)));
    }
    for (let m = 0; m < 24 * 60; m += SLOT_MIN) {
      area.append(h('button', {
        type: 'button',
        class: 'slot' + (m % 60 === 0 ? ' slot--hour' : '') + (state.slot === m && !state.draft?.id ? ' is-selected' : ''),
        style: `top:${(m / 60) * HOUR_PX}px;height:${(SLOT_MIN / 60) * HOUR_PX}px`,
        'data-min': m,
        'aria-label': `Nueva actividad a las ${fromMin(m)}`
      }));
    }
    for (const it of layoutOverlaps(eventsOn(state.date))) {
      const e = it.e;
      const color = (memberById[e.attendees[0]] || {}).color || '#64748b';
      const top = (it.s / 60) * HOUR_PX;
      const height = Math.max(((it.en - it.s) / 60) * HOUR_PX - 2, 20);
      area.append(h('button', {
        type: 'button',
        class: 'event' + (state.draft?.id === e.id ? ' is-selected' : '') + (height < 40 ? ' event--short' : ''),
        'data-id': e.id,
        title: `${e.name} · ${e.start} – ${e.end}`,
        style: `--c:${color};top:${top}px;height:${height}px;left:calc((100% - var(--free)) * ${it.col / it.ncols} + 2px);width:calc((100% - var(--free)) / ${it.ncols} - 4px)`
      },
        h('span', { class: 'event__name' }, e.name),
        h('span', { class: 'event__time' }, `${e.start} – ${e.end}`)
      ));
    }
    if (state.date === isoOf(new Date())) {
      const now = new Date();
      area.append(h('div', { class: 'now-line', style: `top:${((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX}px`, 'aria-hidden': 'true' }));
    }
    $('timeline').replaceChildren(labels, area);

    if (scroll) {
      const first = eventsOn(state.date)[0];
      const hour = first ? Math.min(toMin(first.start) / 60, FP_CONFIG.scrollToHour) : FP_CONFIG.scrollToHour;
      $('day-body').scrollTop = Math.max(0, hour * HOUR_PX - 12);
    }
  }

  $('timeline').addEventListener('click', (e) => {
    const ev = e.target.closest('.event');
    if (ev) { openExisting(ev.dataset.id); return; }
    const slot = e.target.closest('.slot');
    if (slot) openNew(Number(slot.dataset.min));
  });
  $('day-prev').addEventListener('click', () => shiftDay(-1));
  $('day-next').addEventListener('click', () => shiftDay(1));
  function shiftDay(n) {
    const d = parseIso(state.date);
    d.setDate(d.getDate() + n);
    selectDate(isoOf(d));
  }

  // ============ Columna 3: detalle ============
  function openNew(startMin) {
    state.slot = startMin;
    state.draft = {
      id: null, name: '', description: '', date: state.date,
      start: fromMin(startMin), end: fromMin(Math.min(startMin + SLOT_MIN, 23 * 60 + 59)), attendees: [], companion: ''
    };
    showDetail();
    f.name.focus({ preventScroll: true });
  }
  function openExisting(id) {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    state.slot = toMin(e.start);
    state.draft = structuredClone(e);
    showDetail();
  }
  function showDetail() {
    const d = state.draft;
    $('detail-title').textContent = d.id ? 'Detalle de la actividad' : 'Nueva actividad';
    f.name.value = d.name;
    f.desc.value = d.description;
    f.date.value = d.date;
    f.start.value = d.start;
    f.end.value = d.end;
    f.att.querySelectorAll('input').forEach((cb) => { cb.checked = d.attendees.includes(cb.value); });
    f.companion.value = [...f.companion.options].some((o) => o.value === d.companion) ? d.companion : '';
    updateCompanionRequired();
    $('btn-delete').hidden = !d.id;
    resetDelete();
    setFormError('');
    if (state.depth < 3) setDepth(3); else applyLayout();
    renderDay(false);
  }
  function closeDetail() {
    state.draft = null;
    state.slot = null;
    setDepth(2);
    renderDay(false);
  }
  function setFormError(msg, field) {
    const box = $('form-error');
    box.textContent = msg;
    box.hidden = !msg;
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      id: state.draft?.id || null,
      name: f.name.value.trim(),
      description: f.desc.value.trim(),
      date: f.date.value,
      start: f.start.value,
      end: f.end.value,
      attendees: [...f.att.querySelectorAll('input:checked')].map((cb) => cb.value),
      companion: f.companion.value
    };
    if (!data.name) return setFormError('Indica el nombre de la actividad.', f.name);
    if (!data.date) return setFormError('Indica la fecha.', f.date);
    if (!data.start) return setFormError('Indica la hora de inicio.', f.start);
    if (!data.end) return setFormError('Indica la hora de fin.', f.end);
    if (toMin(data.end) <= toMin(data.start)) return setFormError('La hora de fin debe ser posterior a la de inicio.', f.end);
    if (!data.attendees.length) return setFormError('Selecciona al menos un asistente.', f.att.querySelector('input'));
    if (companionRequired() && !data.companion) {
      const kids = data.attendees.map((id) => memberById[id]).filter((m) => m?.needsCompanion).map((m) => m.name);
      return setFormError(`Selecciona un acompañante: es obligatorio cuando ${kids.length > 1 ? 'asisten' : 'asiste'} ${kids.join(' y ')}.`, f.companion);
    }

    const isNew = !data.id;
    if (isNew) { data.id = uid(); events.push(data); }
    else events = events.map((x) => (x.id === data.id ? data : x));
    if (!persist()) return;

    state.draft = structuredClone(data);
    state.slot = toMin(data.start);
    $('detail-title').textContent = 'Detalle de la actividad';
    $('btn-delete').hidden = false;
    setFormError('');
    const dateChanged = data.date !== state.date;
    state.date = data.date;
    state.year = parseIso(data.date).getFullYear();
    renderCalendar();
    renderDay(dateChanged);
    toast(isNew ? 'Actividad creada' : 'Actividad actualizada');
  });

  // Confirmación dentro de la página: primer clic arma el botón, segundo clic elimina
  let deleteArmed = false;
  function resetDelete() {
    deleteArmed = false;
    $('btn-delete').textContent = 'Eliminar';
    $('btn-delete').classList.remove('is-armed');
  }
  $('btn-delete').addEventListener('click', () => {
    if (!state.draft?.id) return;
    if (!deleteArmed) {
      deleteArmed = true;
      $('btn-delete').textContent = 'Pulsa para eliminar';
      $('btn-delete').classList.add('is-armed');
      return;
    }
    resetDelete();
    events = events.filter((x) => x.id !== state.draft.id);
    persist();
    renderCalendar();
    closeDetail();
    toast('Actividad eliminada');
  });
  $('btn-cancel').addEventListener('click', closeDetail);

  // ============ Layout (Flexible Column Layout) ============
  function maxColumns() {
    const w = window.innerWidth;
    return w >= 1280 ? 3 : w >= 960 ? 2 : 1;
  }
  function setDepth(n) {
    if (n !== state.depth) {
      if (n > state.depth) state.variant[n] = 0; // al abrir una columna se usa el reparto por defecto
      state.fullscreen = false;
      state.depth = n;
    }
    applyLayout();
  }
  function applyLayout() {
    const max = maxColumns();
    const n = state.depth;
    const variants = LAYOUTS[max][n];
    const v = Math.min(state.variant[n] || 0, variants.length - 1);
    let w = variants[v];
    if (state.fullscreen) { w = [0, 0, 0]; w[n - 1] = 100; }

    cols.forEach((c, i) => { c.hidden = w[i] === 0; c.style.flex = `${w[i]} 1 0`; });

    const arrows = state.fullscreen ? {} : (ARROWS[`${max}-${n}`] || [])[v] || {};
    setSeparator(sepA, arrows.a, w[0] > 0 && w[1] > 0, n);
    setSeparator(sepB, arrows.b, w[1] > 0 && w[2] > 0, n);

    // Botones "atrás" cuando la columna anterior no está visible
    $('back-day').hidden = !(n >= 2 && w[0] === 0);
    $('back-detail').hidden = !(n === 3 && w[1] === 0);

    // Pantalla completa y cerrar sólo en la última columna abierta
    const fsBtn = n === 3 ? $('fs-detail') : $('fs-day');
    $('fs-day').hidden = !(n === 2 && max > 1);
    $('fs-detail').hidden = !(n === 3 && max > 1);
    fsBtn.querySelector('use').setAttribute('href', state.fullscreen ? '#i-exitfull' : '#i-full');
    fsBtn.setAttribute('aria-label', state.fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa');
    fsBtn.title = fsBtn.getAttribute('aria-label');
    $('close-day').hidden = !(n === 2 && max > 1);
    $('close-detail').hidden = !(n === 3 && max > 1);

    document.body.dataset.columns = max;
  }
  function setSeparator(sep, arrow, visible, n) {
    sep.hidden = !visible;
    const btn = sep.querySelector('button');
    btn.hidden = !arrow;
    if (!arrow) return;
    const [dir, to] = arrow;
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${dir}"/></svg>`;
    btn.setAttribute('aria-label', dir === 'left' ? 'Ampliar columna derecha' : 'Ampliar columna izquierda');
    btn.title = btn.getAttribute('aria-label');
    btn.onclick = () => { state.variant[n] = to; applyLayout(); };
  }

  $('back-day').addEventListener('click', () => {
    if (state.depth === 3 && maxColumns() === 2) closeDetail();   // tablet: vuelve a calendario + día
    else { state.draft = null; state.slot = null; setDepth(1); }
  });
  $('back-detail').addEventListener('click', closeDetail);
  $('close-day').addEventListener('click', () => { state.slot = null; setDepth(1); });
  $('close-detail').addEventListener('click', closeDetail);
  $('fs-day').addEventListener('click', () => { state.fullscreen = !state.fullscreen; applyLayout(); });
  $('fs-detail').addEventListener('click', () => { state.fullscreen = !state.fullscreen; applyLayout(); });

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(applyLayout);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (state.fullscreen) { state.fullscreen = false; applyLayout(); }
    else if (state.depth === 3) closeDetail();
    else if (state.depth === 2) setDepth(1);
  });

  $('logout').addEventListener('click', () => {
    try { sessionStorage.removeItem('fp.session'); } catch { /* nada que borrar */ }
    location.replace('index.html');
  });

  // ---------- Menú de usuario ----------
  const fullName = session.name || session.username;
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  $('user-initials').textContent = initials;
  $('user-initials-lg').textContent = initials;
  $('user-fullname').textContent = fullName;
  $('user-email').textContent = session.username;
  $('user-button').setAttribute('aria-label', `Cuenta de ${fullName}`);
  $('user-button').title = fullName;

  function setUserMenu(open) {
    $('user-menu').hidden = !open;
    $('user-button').setAttribute('aria-expanded', String(open));
    if (open) $('logout').focus();
  }
  $('user-button').addEventListener('click', (e) => { e.stopPropagation(); setUserMenu($('user-menu').hidden); });
  document.addEventListener('click', (e) => {
    if (!$('user-menu').hidden && !e.target.closest('#user-menu')) setUserMenu(false);
  });
  // Escape cierra primero el menú (antes que las columnas)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('user-menu').hidden) {
      e.stopImmediatePropagation();
      setUserMenu(false);
      $('user-button').focus();
    }
  }, true);

  // ---------- Toast ----------
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-visible'), 2400);
  }

  // ---------- Side Navigation ----------
  function showView() {
    const view = location.hash === '#reports' ? 'reports' : 'planner';
    document.querySelectorAll('.sidenav__item').forEach((a) => {
      const active = a.dataset.view === view;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('fcl').hidden = view !== 'planner';
    $('reports-view').hidden = view !== 'reports';
    if (view === 'planner') applyLayout();
  }
  window.addEventListener('hashchange', showView);

  // ---------- Inicio ----------
  showView();
  renderCalendar();
  applyLayout();
  const cur = $('months').querySelector('.month.is-current');
  if (cur) cur.scrollIntoView({ block: 'start' });
})();
