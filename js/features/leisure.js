/*
 * Ocio y Tiempo Libre: ventana con planes para un día (botón con IA de "Nueva actividad").
 *
 *   FP.leisure.open(isoDate, { onUse(plan) })   → abre la ventana con los planes de ese día
 *   FP.leisure.close()
 *
 * PREVIEW: los planes son de ejemplo (SAMPLE). En la versión real vendrían de una
 * función de Supabase que consulta una agenda pública de eventos para ese día.
 */
window.FP = window.FP || {};

FP.leisure = (() => {
  const { $, h } = FP.dom;
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  // Iconos blancos de las imágenes genéricas, por tipo
  const ICONS = {
    teatro: '<path d="M4 5h16v6a8 8 0 0 1-16 0z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/><path d="M9 14.5c1.6 1.4 4.4 1.4 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    taller: '<path d="M14.5 4.5l5 5L9 20H4v-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12.5 6.5l5 5" stroke="currentColor" stroke-width="1.8"/>',
    musica: '<path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    exposicion: '<rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 16l5-5 4 4 3-3 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="15.5" cy="9" r="1.5" fill="currentColor"/>',
    cine: '<rect x="3.5" y="6" width="13" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16.5 10.5l4-2.5v8l-4-2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    aire: '<path d="M12 3l6 9h-3.5l4 6H5.5l4-6H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
  };

  // ---------- Datos de ejemplo (sólo para la preview) ----------
  const SAMPLE = [
    { kind: 'teatro', type: 'Cuentacuentos · Títeres', title: 'Crea tus propios libros',
      description: 'Taller de encuadernación. ¿Y si Caperucita se encontrara con un unicornio y un dragón? En este taller se crearán personajes de cuento mediante siluetas y se animarán con la técnica del stop motion para inventar una historia única.',
      start: '11:00', end: '12:30', place: 'Imprenta Municipal · Artes del Libro', address: 'Calle Concepción Jerónima, 15 · 28012 Madrid',
      price: 'Gratuito', age: 'De 6 a 12 años', url: '#' },
    { kind: 'musica', type: 'Concierto familiar', title: 'Pequeños grandes músicos',
      description: 'Concierto didáctico en el que los niños descubren los instrumentos de la orquesta de cámara a través de un cuento musical. Al final pueden subir al escenario a probar los instrumentos.',
      start: '12:00', end: '13:00', place: 'Centro Cultural Conde Duque · Auditorio', address: 'Calle del Conde Duque, 9 · 28015 Madrid',
      price: '6 €', age: 'Todos los públicos', url: '#' },
    { kind: 'taller', type: 'Taller', title: 'Robótica con piezas recicladas',
      description: 'Construimos un pequeño robot con materiales reciclados y lo programamos con bloques. Las familias trabajan en equipo; se facilita todo el material.',
      start: '17:00', end: '18:30', place: 'Biblioteca Pública Eugenio Trías', address: 'Paseo Fernán Núñez, 24 (Parque del Retiro) · 28009 Madrid',
      price: 'Gratuito', age: 'De 8 a 14 años', url: '#' },
    { kind: 'exposicion', type: 'Exposición · Visita guiada', title: 'Dinosaurios: gigantes del pasado',
      description: 'Visita guiada adaptada a familias por la exposición temporal, con réplicas a tamaño real y una zona de excavación para los más pequeños.',
      start: '10:30', end: '11:30', place: 'Museo Nacional de Ciencias Naturales', address: 'Calle de José Gutiérrez Abascal, 2 · 28006 Madrid',
      price: '7 € · niños 3,50 €', age: 'Todos los públicos', url: '#' },
    { kind: 'aire', type: 'Actividad al aire libre', title: 'Ruta de otoño por la Casa de Campo',
      description: 'Paseo guiado de 4 km para reconocer árboles, hojas y huellas de animales. Recomendable calzado cómodo y agua.',
      start: '10:00', end: '12:00', place: 'Casa de Campo · Centro de Información', address: 'Paseo de la Puerta del Ángel, 1 · 28011 Madrid',
      price: 'Gratuito', age: 'Todos los públicos', url: '#' },
    { kind: 'cine', type: 'Cine', title: 'Matinal de cine de animación',
      description: 'Proyección de cortometrajes de animación europeos en versión original subtitulada, con un coloquio breve al final.',
      start: '12:00', end: '13:30', place: 'Cineteca Madrid · Sala Azcona', address: 'Plaza de Legazpi, 8 · 28045 Madrid',
      price: '3 €', age: 'A partir de 5 años', url: '#' }
  ];

  const svg = (inner, cls) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('aria-hidden', 'true');
    if (cls) el.setAttribute('class', cls);
    el.innerHTML = inner;   // contenido fijo de este archivo, nunca datos externos
    return el;
  };

  const longDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return `${DOW[date.getDay()]}, ${d} de ${MONTHS[m - 1]} de ${y}`;
  };

  let lastFocus = null;
  let onUse = null;

  function row(p, iso) {
    const [y, m, d] = iso.split('-');
    const li = h('li', { class: 'plan' },
      h('div', { class: `plan__img plan__img--${p.kind}` }, svg(ICONS[p.kind])),
      h('div', { class: 'plan__main' },
        h('h3', { class: 'plan__title' }, p.title),
        h('div', { class: 'plan__chips' },
          h('span', { class: 'plan__chip' }, p.type),
          h('span', { class: 'plan__chip plan__chip--age' }, p.age)),
        h('p', { class: 'plan__desc' }, p.description),
        h('button', { class: 'plan__more', type: 'button' }, 'Ver más')),
      h('dl', { class: 'plan__facts' },
        h('dt', null, 'Fecha'), h('dd', null, `${d}/${m}/${y} · ${p.start} – ${p.end}`),
        h('dt', null, 'Lugar'), h('dd', null, p.place),
        h('dt', null, 'Dirección'), h('dd', null, p.address),
        h('dt', null, 'Precio'), h('dd', null, p.price)),
      h('div', { class: 'plan__actions' },
        h('button', { class: 'btn btn--primary plan__use', type: 'button' }, 'Usar este plan'),
        h('a', { class: 'plan__link', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, '+ información')));

    const more = li.querySelector('.plan__more');
    more.addEventListener('click', () => {
      const open = li.classList.toggle('is-open');
      more.textContent = open ? 'Ver menos' : 'Ver más';
    });
    li.querySelector('.plan__use').addEventListener('click', () => {
      close();
      onUse?.({ ...p, date: iso });
    });
    return li;
  }

  function open(iso, opts = {}) {
    onUse = opts.onUse || null;
    lastFocus = document.activeElement;
    const plans = SAMPLE.slice().sort((a, b) => a.start.localeCompare(b.start));
    $('leisure-date').textContent = longDate(iso);
    $('leisure-count').textContent = `Eventos (${plans.length})`;
    const list = $('leisure-list');
    list.replaceChildren(...plans.map((p) => row(p, iso)));
    list.scrollTop = 0;
    $('leisure-empty').hidden = plans.length > 0;
    $('leisure-dialog').hidden = false;
    $('leisure-dialog').querySelector('.modal__box').focus();
  }

  function close() {
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
