/*
 * Pantalla Calendario (views/planner.html): Flexible Column Layout de 3 columnas.
 *   Columna 1: calendario anual · Columna 2: horas del día · Columna 3: detalle de la actividad
 */
window.FP = window.FP || {};
FP.views = FP.views || {};

FP.views.planner = (() => {
  'use strict';

  let applyLayoutRef = null;
  let reloadRef = null;

  function mount(root) {

    // ---------- Constantes ----------
    const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const DOW_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const MEMBERS = FP_CONFIG.members;
    const memberById = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));
    const HOUR_PX = 60;          // alto de una hora en la vista diaria
    const SLOT_MIN = 30;         // duración de cada franja seleccionable

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
    const { $, h } = FP.dom;
    const pad = (n) => String(n).padStart(2, '0');
    const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const { toMin } = FP.time;
    const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    const longDate = (iso) => { const d = parseIso(iso); return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`; };

    // ---------- Datos ----------
    // Actividades de toda la familia, cargadas desde Supabase (ver reload())
    let events = [];
    const eventsOn = (date) => events.filter((e) => e.date === date).sort((a, b) => a.start.localeCompare(b.start));

    // ---------- Estado ----------
    const state = {
      year: new Date().getFullYear(),
      date: null,          // día seleccionado (YYYY-MM-DD)
      depth: 1,            // columnas abiertas (1..3)
      variant: { 1: 0, 2: 0, 3: 0 },
      draft: null,         // actividad mostrada en la columna 3
      slot: null           // minuto de inicio de la franja seleccionada
    };

    // ---------- Referencias DOM ----------
    const cols = [$('col1'), $('col2'), $('col3')];
    const sepA = $('sep-a'), sepB = $('sep-b');
    const form = $('detail-form');
    const f = { name: $('f-name'), desc: $('f-desc'), date: $('f-date'), start: $('f-start'), end: $('f-end'), att: $('f-attendees'), companion: $('f-companion') };


    // Leyenda y checkboxes de asistentes
    FP.family.companionOptions.forEach((o) => f.companion.append(h('option', { value: o.value }, o.label)));

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
                evs.slice(0, 4).map((e) => h('i', { style: `background:${(memberById[e.attendees[0]] || {}).color || '#64748b'}` })))
            : null;
          const more = evs.length > 4 ? h('span', { class: 'day__count', 'aria-hidden': 'true' }, String(evs.length)) : null;

          grid.append(h('button', {
            type: 'button', class: cls.join(' '), 'data-date': date,
            'aria-pressed': String(date === state.date),
            'aria-label': `${d} de ${MONTHS[m]}${evs.length ? `, ${evs.length} ${evs.length === 1 ? 'actividad' : 'actividades'}` : ''}`
          }, h('span', { class: 'day__num' }, String(d)), dots, more));
        }

        frag.append(h('section', { class: 'month' + (isCurrent ? ' is-current' : '') },
          h('h3', { class: 'month__title' }, `${MONTHS[m]} ${state.year}`), grid));
      }
      $('months').replaceChildren(frag);
    }

    $('months').addEventListener('click', (e) => {
      const btn = e.target.closest('button.day');
      if (btn) guard(() => selectDate(btn.dataset.date));
    });
    $('year-prev').addEventListener('click', () => { state.year--; renderCalendar(); });
    $('year-next').addEventListener('click', () => { state.year++; renderCalendar(); });
    $('btn-today').addEventListener('click', () => guard(() => {
      state.year = new Date().getFullYear();
      renderCalendar();
      selectDate(isoOf(new Date()));
    }));

    function selectDate(date, { keepDetail = false } = {}) {
      state.date = date;
      state.year = parseIso(date).getFullYear();
      if (!keepDetail) { state.mode = null; state.draft = null; state.slot = null; setDepth(2); }
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
      if (ev) { guard(() => openExisting(ev.dataset.id)); return; }
      const slot = e.target.closest('.slot');
      if (slot) guard(() => openNew(Number(slot.dataset.min)));
    });
    $('day-prev').addEventListener('click', () => guard(() => shiftDay(-1)));
    $('day-next').addEventListener('click', () => guard(() => shiftDay(1)));
    function shiftDay(n) {
      const d = parseIso(state.date);
      d.setDate(d.getDate() + n);
      selectDate(isoOf(d));
    }

    // ============ Columna 3: detalle ============
    /*
     * Estados del detalle (state.mode):
     *   'new'      creando una actividad      → campos editables · Guardar
     *   'view'     viendo una actividad mía   → campos bloqueados · Editar · papelera
     *   'edit'     editando una actividad mía → campos editables · Guardar · papelera
     *   'readonly' viendo la de otra persona  → campos bloqueados · aviso "Creada por…"
     * La X de la cabecera (o "‹ Día" en móvil) cierra el detalle en cualquier estado.
     */
    let snapshot = '';        // contenido del formulario al empezar a crear o editar
    let pendingAction = null; // acción en espera mientras se muestra el aviso de cambios sin guardar

    const readForm = () => ({
      id: state.draft?.id || null,
      name: f.name.value.trim(),
      description: f.desc.value.trim(),
      date: f.date.value,
      start: f.start.value,
      end: f.end.value,
      attendees: [...f.att.querySelectorAll('input:checked')].map((cb) => cb.value),
      companion: f.companion.value
    });
    const isDirty = () => (state.mode === 'new' || state.mode === 'edit') && JSON.stringify(readForm()) !== snapshot;

    // Ejecuta la acción; si hay cambios sin guardar, antes pregunta
    function guard(action) {
      if (!isDirty()) { hideUnsaved(); action(); return; }
      pendingAction = action;
      $('detail-unsaved').hidden = false;
      $('unsaved-keep').focus();
    }
    function hideUnsaved() {
      pendingAction = null;
      $('detail-unsaved').hidden = true;
    }
    $('unsaved-discard').addEventListener('click', () => {
      const action = pendingAction;
      hideUnsaved();
      snapshot = JSON.stringify(readForm());   // los cambios se descartan
      if (action) action();
    });
    $('unsaved-keep').addEventListener('click', () => { hideUnsaved(); f.name.focus(); });

    function fillForm(d) {
      f.name.value = d.name;
      f.desc.value = d.description;
      f.date.value = d.date;
      f.start.value = d.start;
      f.end.value = d.end;
      f.att.querySelectorAll('input').forEach((cb) => { cb.checked = d.attendees.includes(cb.value); });
      f.companion.value = [...f.companion.options].some((o) => o.value === d.companion) ? d.companion : '';
      updateCompanionRequired();
    }

    function setMode(mode) {
      state.mode = mode;
      const editable = mode === 'new' || mode === 'edit';
      form.classList.toggle('is-readonly', !editable);
      form.querySelectorAll('input, textarea, select').forEach((el) => { el.disabled = !editable; });
      $('detail-title').textContent = mode === 'new' ? 'Nueva actividad' : mode === 'edit' ? 'Editar actividad' : 'Detalle actividad';
      $('btn-save').hidden = !editable;
      $('btn-edit').hidden = mode !== 'view';
      $('detail-actions').hidden = mode === 'readonly';
      $('btn-delete').hidden = !(mode === 'view' || mode === 'edit');
      resetDelete();
      const owner = $('detail-owner');
      owner.hidden = mode !== 'readonly';
      if (mode === 'readonly') {
        const name = FP.session.nameOf(state.draft.createdBy) || 'otra persona';
        owner.textContent = `Creada por ${name}. Solo quien la creó puede modificarla o eliminarla.`;
      }
      if (editable) snapshot = JSON.stringify(readForm());
      hideUnsaved();
      setFormError('');
    }

    function openNew(startMin) {
      state.slot = startMin;
      state.draft = {
        id: null, name: '', description: '', date: state.date,
        start: fromMin(startMin), end: fromMin(Math.min(startMin + SLOT_MIN, 23 * 60 + 59)), attendees: [], companion: ''
      };
      showDetail('new');
      f.name.focus({ preventScroll: true });
    }
    function openExisting(id) {
      const e = events.find((x) => x.id === id);
      if (!e) return;
      state.slot = toMin(e.start);
      state.draft = structuredClone(e);
      showDetail(FP.storage.canEdit(e) ? 'view' : 'readonly');
    }
    function showDetail(mode) {
      fillForm(state.draft);
      setMode(mode);
      if (state.depth < 3) setDepth(3); else applyLayout();
      renderDay(false);
    }
    function closeDetail() {
      hideUnsaved();
      state.mode = null;
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

    // Editar: habilita los campos; el botón pasa a Guardar
    $('btn-edit').addEventListener('click', () => {
      if (state.mode !== 'view') return;
      setMode('edit');
      f.name.focus();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.mode !== 'new' && state.mode !== 'edit') return;
      const data = readForm();
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
      let saved;
      $('btn-save').disabled = true;
      try {
        saved = isNew ? await FP.storage.create(data) : await FP.storage.update(data);
      } catch (err) {
        return setFormError(err.message);
      } finally {
        $('btn-save').disabled = false;
      }
      if (isNew) events.push(saved);
      else events = events.map((x) => (x.id === saved.id ? saved : x));

      // Guardada: vuelve a "ver" (campos bloqueados, botón Editar)
      state.draft = structuredClone(saved);
      state.slot = toMin(saved.start);
      fillForm(saved);
      setMode('view');
      const dateChanged = saved.date !== state.date;
      state.date = saved.date;
      state.year = parseIso(saved.date).getFullYear();
      renderCalendar();
      renderDay(dateChanged);
      FP.toast(isNew ? 'Actividad creada' : 'Actividad actualizada');
    });

    // Papelera: primer clic la arma ("Eliminar" en rojo), segundo clic elimina
    let deleteArmed = false;
    function resetDelete() {
      deleteArmed = false;
      $('btn-delete').classList.remove('is-armed');
      $('btn-delete').setAttribute('aria-label', 'Eliminar actividad');
      $('btn-delete').title = 'Eliminar actividad';
    }
    $('btn-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!state.draft?.id || !FP.storage.canEdit(state.draft)) return;
      if (!deleteArmed) {
        deleteArmed = true;
        $('btn-delete').classList.add('is-armed');
        $('btn-delete').setAttribute('aria-label', 'Pulsa otra vez para eliminar la actividad');
        $('btn-delete').title = 'Pulsa otra vez para eliminar';
        return;
      }
      resetDelete();
      const id = state.draft.id;
      $('btn-delete').disabled = true;
      try {
        await FP.storage.remove(id);
      } catch (err) {
        return setFormError(err.message);
      } finally {
        $('btn-delete').disabled = false;
      }
      events = events.filter((x) => x.id !== id);
      renderCalendar();
      closeDetail();
      FP.toast('Actividad eliminada');
    });
    // Pulsar en cualquier otro sitio desarma la papelera (pointerdown también llega
    // desde los campos bloqueados, que no generan "click")
    document.addEventListener('pointerdown', (e) => {
      if (deleteArmed && !e.target.closest('#btn-delete')) resetDelete();
    }, true);

    // ============ Layout (Flexible Column Layout) ============
    function maxColumns() {
      const w = window.innerWidth;
      return w >= 1280 ? 3 : w >= 960 ? 2 : 1;
    }
    function setDepth(n) {
      if (n !== state.depth) {
        if (n > state.depth) state.variant[n] = 0; // al abrir una columna se usa el reparto por defecto
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

      cols.forEach((c, i) => { c.hidden = w[i] === 0; c.style.flex = `${w[i]} 1 0`; });

      const arrows = (ARROWS[`${max}-${n}`] || [])[v] || {};
      setSeparator(sepA, arrows.a, w[0] > 0 && w[1] > 0, n);
      setSeparator(sepB, arrows.b, w[1] > 0 && w[2] > 0, n);

      // Botones "atrás" cuando la columna anterior no está visible
      $('back-day').hidden = !(n >= 2 && w[0] === 0);
      $('back-detail').hidden = !(n === 3 && w[1] === 0);

      // Cerrar sólo en la última columna abierta
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
      if (state.depth === 3 && maxColumns() === 2) guard(closeDetail);   // tablet: vuelve a calendario + día
      else guard(() => { state.mode = null; state.draft = null; state.slot = null; setDepth(1); });
    });
    $('back-detail').addEventListener('click', () => guard(closeDetail));
    $('close-day').addEventListener('click', () => { state.slot = null; setDepth(1); });
    $('close-detail').addEventListener('click', () => guard(closeDetail));

    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(applyLayout);
    });

    // Escape cierra la última columna abierta (solo con esta pantalla visible)
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || root.hidden) return;
      if (deleteArmed) resetDelete();
      else if (!$('detail-unsaved').hidden) hideUnsaved();
      else if (state.depth === 3) guard(closeDetail);
      else if (state.depth === 2) setDepth(1);
    });

    // ---------- Carga de actividades ----------
    // Al abrir la pantalla, al volver a ella y al volver a la pestaña del navegador,
    // para ver lo que haya añadido o cambiado la otra persona.
    let loading = null;
    async function reload() {
      if (loading) return loading;
      loading = (async () => {
        try {
          events = await FP.storage.list();
        } catch (err) {
          FP.toast(err.message);
          return;
        } finally {
          loading = null;
        }
        // Si la actividad abierta ya no existe (la eliminó quien la creó), se cierra el detalle
        if (state.draft?.id && !events.some((e) => e.id === state.draft.id)) closeDetail();
        renderCalendar();
        if (state.date) renderDay(false);
      })();
      return loading;
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !root.hidden) reload();
    });

    // ---------- Inicio ----------
    applyLayoutRef = applyLayout;
    reloadRef = reload;
    renderCalendar();
    applyLayout();
    const cur = $('months').querySelector('.month.is-current');
    if (cur) cur.scrollIntoView({ block: 'start' });
  }

  return {
    mount,
    show() {
      if (applyLayoutRef) applyLayoutRef();
      if (reloadRef) reloadRef();
    },
    hide() {}
  };
})();
