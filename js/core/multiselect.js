/*
 * Desplegable de selección múltiple con casillas (estilo MultiComboBox de Fiori).
 *
 *   const ms = FP.multiSelect(el, {
 *     labelledBy: 'id-de-la-etiqueta',
 *     placeholder: 'Todos',                      // texto cuando no hay nada marcado
 *     options: [{ value, label, colors: ['#hex', …] }]   // colors: bolitas delante del texto
 *   });
 *   ms.values()        → valores marcados, en el orden de las opciones
 *   ms.setValues([…])  → marca esos valores
 *   ms.clear()         → desmarca todo
 *
 * El campo muestra cada valor marcado como una ficha (bolita + texto). Si no caben,
 * muestra las que quepan y "+N"; el recuadro de ayuda del campo lista todos.
 */
window.FP = window.FP || {};

FP.multiSelect = (el, { labelledBy, placeholder = '', options }) => {
  const { h } = FP.dom;
  const dots = (colors = []) => colors.map((c) => h('i', { class: 'dot', style: `--c:${c}`, 'aria-hidden': 'true' }));

  el.classList.add('ms');
  const panelId = el.id + '-panel';
  const tokens = h('span', { class: 'ms__tokens' });
  const empty = h('span', { class: 'ms__placeholder' }, placeholder);
  const more = h('span', { class: 'ms__more', hidden: true });
  const control = h('button', {
    type: 'button', class: 'ms__control', 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
    'aria-controls': panelId, 'aria-labelledby': labelledBy ? `${labelledBy} ${el.id}-value` : null
  }, h('span', { class: 'ms__value', id: `${el.id}-value` }, tokens, empty, more));
  control.insertAdjacentHTML('beforeend',
    '<svg class="ms__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');

  const panel = h('div', { class: 'ms__panel', id: panelId, role: 'group', 'aria-labelledby': labelledBy || null, hidden: true },
    options.map((o) => h('label', { class: 'ms__option' },
      h('input', { type: 'checkbox', value: o.value }), dots(o.colors), h('span', null, o.label))));
  el.replaceChildren(control, panel);

  const boxes = [...panel.querySelectorAll('input')];
  const byValue = Object.fromEntries(options.map((o) => [o.value, o]));
  const values = () => boxes.filter((b) => b.checked).map((b) => b.value);

  // Fichas de los valores marcados; las que no caben se resumen en "+N"
  function paint() {
    const selected = values();
    tokens.replaceChildren(...selected.map((v) =>
      h('span', { class: 'ms__token' }, dots(byValue[v].colors), byValue[v].label)));
    empty.hidden = selected.length > 0;
    more.hidden = true;
    control.title = selected.map((v) => byValue[v].label).join(', ');
    const items = [...tokens.children];
    let visible = items.length;
    while (visible > 1 && tokens.scrollWidth > tokens.clientWidth) {
      items[--visible].hidden = true;
      more.textContent = `+${items.length - visible}`;
      more.hidden = false;
    }
  }

  function open(state) {
    panel.hidden = !state;
    control.setAttribute('aria-expanded', String(state));
    el.classList.toggle('is-open', state);
    if (state) (panel.querySelector('input:checked') || boxes[0])?.focus();
  }

  control.addEventListener('click', () => open(panel.hidden));
  panel.addEventListener('change', paint);
  document.addEventListener('click', (e) => { if (!panel.hidden && !el.contains(e.target)) open(false); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); open(false); control.focus(); }
  });
  window.addEventListener('resize', () => { if (el.offsetParent) paint(); });

  paint();
  return {
    values,
    setValues(list) { boxes.forEach((b) => { b.checked = list.includes(b.value); }); paint(); },
    clear() { boxes.forEach((b) => { b.checked = false; }); paint(); },
    refresh: paint
  };
};
