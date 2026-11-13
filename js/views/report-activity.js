/*
 * Informe de actividad (views/report-activity.html) — patrón List Report.
 *
 * Filtros (se combinan con lógica AND; un filtro vacío no restringe):
 *   · Nombre actividad: el nombre contiene el texto, sin distinguir mayúsculas ni
 *     acentos ("med" encuentra "Médico").
 *   · Fecha actividad: día exacto.
 *   · Hora inicio / Hora fin: forman una franja horaria (un solo filtro). Salen las
 *     actividades que ocurren, aunque sea en parte, dentro de la franja. Solo con
 *     Hora inicio: las que siguen en marcha a esa hora o empiezan después. Solo con
 *     Hora fin: las que empiezan antes de esa hora.
 *   · Asistente (varios valores): la actividad incluye a alguna de las personas marcadas.
 *   · Acompañante (varios valores): la actividad va acompañada por alguna de las
 *     personas marcadas, sola o junto a otra ("Alberto" encuentra también las
 *     acompañadas por "Alberto y Laura").
 * Las actividades se cargan de Supabase al abrir la pantalla y al pulsar Buscar (o Enter);
 * la agenda es compartida, así que aparecen las de toda la familia.
 * La tabla muestra bloques de PAGE_SIZE filas; "Mostrar más" añade el siguiente bloque.
 */
window.FP = window.FP || {};
FP.views = FP.views || {};

FP.views['report-activity'] = (() => {
  'use strict';

  const DESC_MAX = 40;   // caracteres máximos visibles de la descripción antes de "..."
  const NAME_MAX = 20;   // caracteres máximos visibles del nombre antes de "..."
  const PAGE_SIZE = 20;  // filas por bloque de la tabla
  let refresh = null;

  // Recorta en el último espacio antes de "max" caracteres (sin partir palabras) y
  // añade "..."; si la primera palabra ya es más larga, corta justo en "max".
  // Devuelve null si el texto cabe entero.
  function truncateWords(text, max) {
    const chars = Array.from(text || '');
    if (chars.length <= max) return null;
    const head = chars.slice(0, max + 1).join('');
    const cut = head.lastIndexOf(' ');
    const kept = (cut > 0 ? head.slice(0, cut) : chars.slice(0, max).join('')).replace(/[\s,;:.]+$/, '');
    return kept + '...';
  }

  // Texto comparable: sin acentos, en minúsculas y sin espacios en los extremos
  const normalize = (s) => (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

  function mount(root) {
    const { h } = FP.dom;
    const $ = (id) => root.querySelector('#' + id);
    const { toMin, formatDate } = FP.time;
    const { members, byId: memberById, companions, companionLabel } = FP.family;

    const f = { name: $('ra-name'), date: $('ra-date'), from: $('ra-from'), to: $('ra-to') };

    // Desplegables con casillas: Asistente con la bolita de color de cada persona
    const attendeeSelect = FP.multiSelect($('ra-attendee'), {
      labelledBy: 'ra-attendee-label',
      options: members.map((m) => ({ value: m.id, label: m.name, colors: [m.color] }))
    });
    const companionSelect = FP.multiSelect($('ra-companion'), {
      labelledBy: 'ra-companion-label',
      options: companions.map((m) => ({ value: m.id, label: m.name }))
    });

    let applied = { name: '', date: '', from: '', to: '', attendees: [], companions: [] };
    let results = [];          // actividades que cumplen los filtros
    let shown = PAGE_SIZE;     // cuántas se muestran ahora


    // Franja horaria: la actividad [inicio, fin) se solapa con [desde, hasta)
    const inTimeRange = (e, from, to) =>
      (!from || toMin(e.end) > toMin(from)) && (!to || toMin(e.start) < toMin(to));

    // Celda con texto recortado por palabras; el texto completo va en el recuadro de ayuda
    function cellTruncated(text, max, cls) {
      const short = truncateWords(text, max);
      return short
        ? h('td', { class: cls, title: text }, short)
        : h('td', { class: cls }, text || '');
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
      if (applied.attendees.length) parts.push(`Asistente: ${applied.attendees.map((id) => memberById[id]?.name || id).join(', ')}`);
      if (applied.companions.length) parts.push(`Acompañante: ${applied.companions.map((id) => memberById[id]?.name || id).join(', ')}`);
      return parts.length ? 'Filtros: ' + parts.join(' · ') : 'Sin filtros';
    }

    const row = (e) => h('tr', null,
      cellPeople(e.attendees),
      h('td', { class: 'lr__nowrap' }, formatDate(e.date)),
      h('td', { class: 'lr__nowrap' }, `${e.start} - ${e.end}`),
      cellTruncated(e.name, NAME_MAX, 'lr__name'),
      cellTruncated(e.description, DESC_MAX, 'lr__desc'),
      h('td', null, companionLabel(e.companions) || '-')   // "-" cuando no hay acompañante
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

    let all = [];              // todas las actividades de la familia (última carga)
    let loaded = false;

    // Carga las actividades de Supabase y vuelve a pintar los resultados
    async function load() {
      if (!loaded) showMessage('Cargando actividades…');
      try {
        all = await FP.storage.list();
        loaded = true;
      } catch (err) {
        if (!loaded) showMessage(err.message); else FP.toast(err.message);
        return;
      }
      render();
    }

    function showMessage(text) {
      $('ra-rows').replaceChildren();
      $('ra-more').hidden = true;
      $('ra-count').textContent = 'Actividades';
      root.querySelector('.lr__scroll').hidden = true;
      $('ra-empty').textContent = text;
      $('ra-empty').hidden = false;
    }

    function render() {
      const name = normalize(applied.name);
      results = all
        .filter((e) =>
          (!name || normalize(e.name).includes(name)) &&
          (!applied.date || e.date === applied.date) &&
          inTimeRange(e, applied.from, applied.to) &&
          (!applied.attendees.length || e.attendees.some((id) => applied.attendees.includes(id))) &&
          (!applied.companions.length || applied.companions.some((id) => e.companions.includes(id))))
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
        attendees: attendeeSelect.values().map(Number), companions: companionSelect.values().map(Number)
      };
      shown = PAGE_SIZE;   // cada búsqueda empieza por el primer bloque
      if (loaded) render(); // resultado inmediato con lo ya cargado…
      load();              // …y se actualiza con lo último de la base de datos
    }

    $('ra-more').addEventListener('click', showMore);
    $('ra-filters').addEventListener('submit', (e) => { e.preventDefault(); search(); });
    $('ra-clear').addEventListener('click', () => {
      $('ra-filters').reset();
      attendeeSelect.clear();
      companionSelect.clear();
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
      if (open) { attendeeSelect.refresh(); companionSelect.refresh(); }
    });

    refresh = () => { attendeeSelect.refresh(); companionSelect.refresh(); return load(); };
  }

  return {
    mount,
    // Al volver a la pantalla se recalculan los resultados (puede haber actividades nuevas)
    show() { return refresh?.(); },
    hide() {}
  };
})();
