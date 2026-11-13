/*
 * Ocio y Tiempo Libre: ventana con planes para un día (botón de "Nueva actividad").
 *
 *   FP.leisure.open(isoDate, { onUse(plan) })   → abre la ventana con los planes de ese día
 *   FP.leisure.close()
 *
 * Los planes salen de la agenda de eventos del Ayuntamiento de Madrid a través de la
 * función de Supabase "leisure-events" (supabase/functions/leisure-events/index.ts).
 * Cada día se pide una sola vez mientras la aplicación está abierta.
 * Filtro: "Para familias" (dirigidos a niños o familias, el de partida si hay alguno) o "Todos".
 */
window.FP = window.FP || {};

FP.leisure = (() => {
  const { $, h } = FP.dom;
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  // Iconos de las imágenes genéricas, por tipo (contenido fijo de este archivo)
  const ICONS = {
    teatro: '<path d="M4 5h16v6a8 8 0 0 1-16 0z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/><path d="M9 14.5c1.6 1.4 4.4 1.4 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    taller: '<path d="M14.5 4.5l5 5L9 20H4v-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12.5 6.5l5 5" stroke="currentColor" stroke-width="1.8"/>',
    musica: '<path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    exposicion: '<rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 16l5-5 4 4 3-3 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="15.5" cy="9" r="1.5" fill="currentColor"/>',
    cine: '<rect x="3.5" y="6" width="13" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16.5 10.5l4-2.5v8l-4-2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    letras: '<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6.5v13" stroke="currentColor" stroke-width="1.8"/>',
    otros: '<path d="M12 3.5l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L12 15.9l-5 2.8 1.2-5.6L4 9.3l5.6-.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    aire: '<path d="M12 3l6 9h-3.5l4 6H5.5l4-6H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  };

  const svg = (inner) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = inner;   // solo los iconos fijos de ICONS, nunca datos de la agenda
    return el;
  };

  const longDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${DOW[new Date(y, m - 1, d).getDay()]}, ${d} de ${MONTHS[m - 1]} de ${y}`;
  };
  const shortDate = (iso) => iso.split('-').reverse().join('/');

  const cache = new Map();   // fecha → planes
  let request = 0;           // para descartar respuestas de una fecha anterior
  let plans = [];
  let filter = 'family';
  let lastFocus = null;
  let onUse = null;

  async function load(iso) {
    if (cache.has(iso)) return cache.get(iso);
    const { data, error } = await FP.db.functions.invoke('leisure-events', { body: { date: iso } });
    if (error || !Array.isArray(data?.events)) {
      console.error(error || data);
      throw new Error('No se han podido consultar los planes. Inténtalo de nuevo más tarde.');
    }
    cache.set(iso, data.events);
    return data.events;
  }

  // Fila de datos: se omite si no hay valor
  const fact = (label, value) => value ? [h('dt', null, label), h('dd', null, value)] : [];

  function row(p, iso) {
    const when = [shortDate(iso), p.time || 'Horario en la web'].join(' · ');
    const li = h('li', { class: 'plan' },
      h('div', { class: `plan__img plan__img--${ICONS[p.kind] ? p.kind : 'otros'}` }, svg(ICONS[p.kind] || ICONS.otros)),
      h('div', { class: 'plan__main' },
        h('h3', { class: 'plan__title' }, p.title),
        h('div', { class: 'plan__chips' },
          h('span', { class: 'plan__chip' }, p.type),
          p.audience ? h('span', { class: 'plan__chip plan__chip--age' }, p.audience) : null),
        p.description ? h('p', { class: 'plan__desc' }, p.description) : null,
        p.description ? h('button', { class: 'plan__more', type: 'button', hidden: true }, 'Ver más') : null),
      h('dl', { class: 'plan__facts' },
        fact('Fecha', when),
        fact('Hasta', p.until ? shortDate(p.until) : ''),
        fact('Lugar', p.place),
        fact('Dirección', p.address),
        fact('Precio', p.price),
        fact('Accesibilidad', p.accessibility)),
      h('div', { class: 'plan__actions' },
        h('button', { class: 'btn btn--primary plan__use', type: 'button' }, 'Usar este plan'),
        p.url ? h('a', { class: 'plan__link', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, '+ información') : null));

    const more = li.querySelector('.plan__more');
    more?.addEventListener('click', () => {
      const open = li.classList.toggle('is-open');
      more.textContent = open ? 'Ver menos' : 'Ver más';
    });
    li.querySelector('.plan__use').addEventListener('click', () => {
      close();
      onUse?.({ ...p, date: iso });
    });
    return li;
  }

  function setState(state, message = '') {
    $('leisure-status').hidden = state === 'list';
    $('leisure-status').classList.toggle('is-loading', state === 'loading');
    $('leisure-status-text').textContent = message;
    $('leisure-list').hidden = state !== 'list';
    $('leisure-filter').hidden = state !== 'list' && state !== 'empty';
  }

  function render(iso) {
    const family = plans.filter((p) => p.family);
    const shown = filter === 'family' ? family : plans;
    $('leisure-count').textContent = `Eventos (${shown.length})`;
    $('leisure-filter-family').textContent = `Para familias (${family.length})`;
    $('leisure-filter-all').textContent = `Todos (${plans.length})`;
    for (const [id, value] of [['leisure-filter-family', 'family'], ['leisure-filter-all', 'all']]) {
      $(id).setAttribute('aria-pressed', String(filter === value));
    }
    const list = $('leisure-list');
    list.replaceChildren(...shown.map((p) => row(p, iso)));
    list.scrollTop = 0;
    if (!shown.length) {
      setState('empty', plans.length ? 'No hay planes para familias este día. Prueba con «Todos».' : 'No hay planes publicados para este día.');
      return;
    }
    setState('list');
    // "Ver más" solo en las descripciones que no caben en dos líneas
    list.querySelectorAll('.plan').forEach((li) => {
      const desc = li.querySelector('.plan__desc');
      if (desc && desc.scrollHeight > desc.clientHeight + 1) li.querySelector('.plan__more').hidden = false;
    });
  }

  async function open(iso, opts = {}) {
    onUse = opts.onUse || null;
    lastFocus = document.activeElement;
    const ticket = ++request;
    plans = [];
    $('leisure-date').textContent = longDate(iso);
    $('leisure-count').textContent = 'Eventos';
    $('leisure-list').replaceChildren();
    setState('loading', 'Buscando planes en la agenda de Madrid…');
    $('leisure-dialog').hidden = false;
    $('leisure-dialog').querySelector('.modal__box').focus();
    try {
      const result = await load(iso);
      if (ticket !== request || $('leisure-dialog').hidden) return;
      plans = result;
      filter = plans.some((p) => p.family) ? 'family' : 'all';
      render(iso);
    } catch (err) {
      if (ticket !== request) return;
      setState('error', err.message);
    }
    $('leisure-filter-family').onclick = () => { filter = 'family'; render(iso); };
    $('leisure-filter-all').onclick = () => { filter = 'all'; render(iso); };
  }

  function close() {
    request++;
    $('leisure-dialog').hidden = true;
    lastFocus?.focus?.({ preventScroll: true });
  }

  function mount() {
    const dlg = $('leisure-dialog');
    if (!dlg) return;
    $('leisure-close').addEventListener('click', close);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  }

  return { open, close, mount };
})();
