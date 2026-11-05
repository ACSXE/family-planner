/*
 * Armazón de la aplicación (index.html): comprueba la sesión, pinta el menú de
 * usuario y el menú lateral, ofrece FP.toast() a las pantallas y arranca el router.
 */
(() => {
  'use strict';

  const session = FP.session.require();
  if (!session) return;
  FP.storage.migrate();

  const { $, h } = FP.dom;

  // ---------- Avisos ----------
  let toastTimer = 0;
  FP.toast = (msg) => {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-visible'), 2400);
  };

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
  // Escape cierra primero el menú (antes que cualquier pantalla)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('user-menu').hidden) {
      e.stopImmediatePropagation();
      setUserMenu(false);
      $('user-button').focus();
    }
  }, true);

  $('logout').addEventListener('click', () => {
    FP.session.end();
    location.replace(FP.pages.login);
  });

  // ---------- Menú lateral (generado desde FP_CONFIG.views) ----------
  const nav = $('sidenav');
  FP_CONFIG.views.forEach((v) => {
    const item = h('a', { class: 'sidenav__item', href: '#' + v.id, 'data-view': v.id },
      h('span', { class: 'sidenav__label' }, v.label));
    item.insertAdjacentHTML('afterbegin', `<svg class="sidenav__icon" aria-hidden="true"><use href="#${v.icon}"/></svg>`);
    nav.append(item);
  });

  function markActive(id) {
    nav.querySelectorAll('.sidenav__item').forEach((a) => {
      const active = a.dataset.view === id;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // ---------- Pantallas ----------
  FP.router.start($('workspace'), FP_CONFIG.views.map((v) => v.id), markActive);
})();
