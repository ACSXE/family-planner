/*
 * Pantalla Informes (views/reports.html): una tarjeta por cada informe de FP_CONFIG.reports.
 * Al pulsar una tarjeta se abre la pantalla del informe (#<view>).
 */
window.FP = window.FP || {};
FP.views = FP.views || {};

FP.views.reports = {
  mount(root) {
    const { h } = FP.dom;
    const list = root.querySelector('#report-cards');
    FP_CONFIG.reports.forEach((r) => {
      const card = h('a', { class: 'report-card', href: '#' + r.view },
        h('h2', { class: 'report-card__title' }, r.title),
        h('p', { class: 'report-card__desc' }, r.description),
        h('span', { class: 'report-card__open' }, 'Ver informe'));
      card.insertAdjacentHTML('afterbegin', `<span class="report-card__icon" aria-hidden="true"><svg><use href="#${r.icon}"/></svg></span>`);
      card.querySelector('.report-card__open').insertAdjacentHTML('beforeend', '<svg aria-hidden="true"><use href="#i-right"/></svg>');
      list.append(h('li', null, card));
    });
  },
  show() {},
  hide() {}
};
