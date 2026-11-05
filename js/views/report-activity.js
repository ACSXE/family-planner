/*
 * Informe de actividad (views/report-activity.html) — patrón List Report.
 *
 * Filtros (se combinan con lógica AND; un filtro vacío no restringe):
 *   · Nombre actividad: sin distinguir mayúsculas ni acentos. Con "*" como comodín
 *     el patrón debe cubrir el nombre entero ("Med*" → "Médico"); sin "*" basta con
 *     que el nombre contenga el texto.
 *   · Fecha actividad: día exacto.
 *   · Hora inicio / Hora fin: forman una franja horaria (un solo filtro). Salen las
 *     actividades que ocurren, aunque sea en parte, dentro de la franja. Solo con
 *     Hora inicio: las que siguen en marcha a esa hora o empiezan después. Solo con
 *     Hora fin: las que empiezan antes de esa hora.
 *   · Asistente: la actividad incluye a esa persona.
 *   · Acompañante: una persona encuentra también las actividades acompañadas por
 *     "Alberto y Laura"; la opción combinada solo encuentra esa combinación.
 * Los resultados se calculan al abrir la pantalla y al pulsar Buscar (o Enter).
 * La tabla muestra bloques de PAGE_SIZE filas; "Mostrar más" añade el siguiente bloque.
 */
window.FP = window.FP || {};
FP.views = FP.views || {};

FP.views['report-activity'] = (() => {
  'use strict';

  const DESC_MAX = 25;   // caracteres visibles de la descripción antes de "..."
  const PAGE_SIZE = 20;  // filas por bloque de la tabla
  let refresh = null;

  // Texto comparable: sin acentos, en minúsculas y sin espacios en los extremos
  const normalize = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const escapeRegExp = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  function nameMatcher(query) {
    const q = normalize(query);
    if (!q) return () => true;
    if (q.includes('*')) {
      const re = new RegExp('^' + q.split('*').map(escapeRegExp).join('.*') + '$');
      return (name) => re.test(normalize(name));
    }
    return (name) => normalize(name).includes(q);
  }

  function mount(root) {
    const { h } = FP.dom;
    const $ = (id) => root.querySelector('#' + id);
    const session = FP.session.get();
    const { toMin, formatDate } = FP.time;
    const { members, byId: memberById, companionOptions, companionLabel } = FP.family;

    const f = { name: $('ra-name'), date: $('ra-date'), from: $('ra-from'), to: $('ra-to'), attendee: $('ra-attendee'), companion: $('ra-companion') };
    members.forEach((m) => f.attendee.append(h('option', { value: m.id }, m.name)));
    companionOptions.forEach((o) => f.companion.append(h('option', { value: o.value }, o.label)));

    let applied = { name: '', date: '', from: '', to: '', attendee: '', companion: '' };
    let results = [];          // actividades que cumplen los filtros
    let shown = PAGE_SIZE;     // cuántas se muestran ahora

    const companionMatches = (value, wanted) =>
      !wanted || (wanted.includes(',') ? value === wanted : (value || '').split(',').includes(wanted));

    // Franja horaria: la actividad [inicio, fin) se solapa con [desde, hasta)
    const inTimeRange = (e, from, to) =>
      (!from || toMin(e.end) > toMin(from)) && (!to || toMin(e.start) < toMin(to));


    function cellDescription(text) {
      const chars = Array.from(text || '');
      if (chars.length <= DESC_MAX) return h('td', { class: 'lr__desc' }, text || '');
      return h('td', { class: 'lr__desc', title: text }, chars.slice(0, DESC_MAX).join('') + '...');
    }

    function cellPeople(ids) {
      // Sin comas: cada asistente con su bolita, separados por un espacio
      const people = [];
      ids.forEach((id, i) => {
        const m = memberById[id];
        if (i) people.push(' ');
        people.push(h('span', { class: 'lr__person' },
          h('i', { class: 'dot', style: `--c:${m?.color || '#64748b'}`, 'aria-hidden': 'true' }), m?.name || id));
      });
      return h('td', { class: 'lr__people' }, people);
    }

    function summary() {
      const parts = [];
      if (applied.name) parts.push(`Nombre actividad: ${applied.name}`);
      if (applied.date) parts.push(`Fecha actividad: ${formatDate(applied.date)}`);
      if (applied.from && applied.to) parts.push(`Hora: de ${applied.from} a ${applied.to}`);
      else if (applied.from) parts.push(`Hora: desde las ${applied.from}`);
      else if (applied.to) parts.push(`Hora: hasta las ${applied.to}`);
      if (applied.attendee) parts.push(`Asistente: ${memberById[applied.attendee]?.name || applied.attendee}`);
      if (applied.companion) parts.push(`Acompañante: ${companionLabel(applied.companion) || applied.companion}`);
      return parts.length ? 'Filtros: ' + parts.join(' · ') : 'Sin filtros';
    }

    const row = (e) => h('tr', null,
      cellPeople(e.attendees),
      h('td', { class: 'lr__nowrap' }, formatDate(e.date)),
      h('td', { class: 'lr__nowrap' }, `${e.start} - ${e.end}`),
      h('td', { class: 'lr__name' }, e.name),
      cellDescription(e.description),
      h('td', null, companionLabel(e.companion))
    );

    function updateMore() {
      const visible = Math.min(shown, results.length);
      $('ra-more').hidden = visible >= results.length;
      $('ra-more-count').textContent = `${visible} de ${results.length}`;
    }

    // Añade el siguiente bloque de filas sin volver a dibujar las que ya están
    function showMore() {
      const from = Math.min(shown, results.length);
      shown += PAGE_SIZE;
      $('ra-rows').append(...results.slice(from, shown).map(row));
      updateMore();
    }

    function render() {
      const all = FP.storage.loadEvents(session.username);
      const matchName = nameMatcher(applied.name);
      results = all
        .filter((e) =>
          matchName(e.name) &&
          (!applied.date || e.date === applied.date) &&
          inTimeRange(e, applied.from, applied.to) &&
          (!applied.attendee || e.attendees.includes(applied.attendee)) &&
          companionMatches(e.companion, applied.companion))
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

      $('ra-rows').replaceChildren(...results.slice(0, shown).map(row));
      updateMore();

      $('ra-count').textContent = `Actividades (${results.length})`;
      const empty = $('ra-empty');
      empty.hidden = results.length > 0;
      empty.textContent = all.length
        ? 'No hay actividades que cumplan los filtros.'
        : 'Todavía no hay actividades. Créalas desde el Calendario.';
      root.querySelector('.lr__scroll').hidden = results.length === 0;
      $('ra-summary').textContent = summary();
    }

    function setError(msg, field) {
      $('ra-error').textContent = msg;
      $('ra-error').hidden = !msg;
      [f.from, f.to].forEach((el) => el.removeAttribute('aria-invalid'));
      if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    }

    function search() {
      if (f.from.value && f.to.value && toMin(f.to.value) <= toMin(f.from.value)) {
        setError('La hora fin debe ser posterior a la hora inicio.', f.to);
        return;
      }
      setError('');
      applied = {
        name: f.name.value.trim(), date: f.date.value, from: f.from.value, to: f.to.value,
        attendee: f.attendee.value, companion: f.companion.value
      };
      shown = PAGE_SIZE;   // cada búsqueda empieza por el primer bloque
      render();
    }

    $('ra-more').addEventListener('click', showMore);
    $('ra-filters').addEventListener('submit', (e) => { e.preventDefault(); search(); });
    $('ra-clear').addEventListener('click', () => {
      $('ra-filters').reset();
      search();
      f.name.focus();
    });

    // Plegar / desplegar la barra de filtros; plegada, el resumen de filtros va bajo el título
    $('ra-toggle').addEventListener('click', () => {
      const open = $('ra-header').hidden;
      $('ra-header').hidden = !open;
      $('ra-summary').hidden = open;
      const label = open ? 'Ocultar filtros' : 'Mostrar filtros';
      $('ra-toggle').setAttribute('aria-expanded', String(open));
      $('ra-toggle').setAttribute('aria-label', label);
      $('ra-toggle').title = label;
    });

    refresh = render;
    render();
  }

  return {
    mount,
    // Al volver a la pantalla se recalculan los resultados (puede haber actividades nuevas)
    show() { if (refresh) refresh(); },
    hide() {}
  };
})();
