/*
 * Pantalla de login (login.html).
 * Login correcto → index.html. Login incorrecto → mensaje de error en esta misma pantalla.
 */
(async () => {
  'use strict';

  // Si ya hay sesión abierta, ir directamente a la aplicación
  if (await FP.session.current()) {
    location.replace(FP.pages.home);
    return;
  }
  document.documentElement.classList.remove('is-loading');   // ver js/core/guard.js

  const form = document.getElementById('login-form');
  const userInput = document.getElementById('username');
  const passInput = document.getElementById('password');
  const errorBox = document.getElementById('login-error');

  // Llegada tras un cierre por inactividad (js/core/idle.js): se explica y se limpia la dirección
  if (new URLSearchParams(location.search).has('inactividad')) {
    document.getElementById('login-notice').hidden = false;
    history.replaceState(null, '', location.pathname);
  }

  userInput.focus();

  // Mostrar / ocultar contraseña
  const toggle = document.getElementById('toggle-password');
  toggle.addEventListener('click', () => {
    const show = passInput.type === 'password';
    passInput.type = show ? 'text' : 'password';
    const label = show ? 'Ocultar contraseña' : 'Mostrar contraseña';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.setAttribute('aria-pressed', String(show));
    toggle.querySelector('.eye-open').toggleAttribute('hidden', show);
    toggle.querySelector('.eye-closed').toggleAttribute('hidden', !show);
    passInput.focus();
  });

  const submit = form.querySelector('button[type=submit]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    document.getElementById('login-notice').hidden = true;
    submit.disabled = true;
    const result = await FP.session.signIn(userInput.value.trim(), passInput.value);
    submit.disabled = false;

    if (result.ok) {
      // Login OK → aplicación
      location.href = FP.pages.home;
      return;
    }

    // Login not OK → mensaje de error
    document.getElementById('login-error-text').textContent = result.reason === 'credentials'
      ? 'El usuario o la contraseña introducidos no son correctos.'
      : 'No se ha podido conectar. Comprueba la conexión e inténtalo de nuevo.';
    errorBox.hidden = false;
    if (result.reason === 'credentials') {
      userInput.setAttribute('aria-invalid', 'true');
      passInput.setAttribute('aria-invalid', 'true');
      passInput.value = '';
    }
    passInput.focus();
  });

  // Al volver a escribir se limpia el estado de error
  [userInput, passInput].forEach((el) =>
    el.addEventListener('input', () => {
      errorBox.hidden = true;
      userInput.removeAttribute('aria-invalid');
      passInput.removeAttribute('aria-invalid');
    })
  );
})();
