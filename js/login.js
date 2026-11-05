/*
 * Pantalla de login (login.html).
 * Login correcto → index.html. Login incorrecto → mensaje de error en esta misma pantalla.
 */
(() => {
  'use strict';

  // Si ya hay sesión abierta, ir directamente a la aplicación
  if (FP.session.get()) {
    location.replace(FP.pages.home);
    return;
  }

  const form = document.getElementById('login-form');
  const userInput = document.getElementById('username');
  const passInput = document.getElementById('password');
  const errorBox = document.getElementById('login-error');

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

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = FP.session.authenticate(userInput.value.trim(), passInput.value);

    if (user) {
      // Login OK → aplicación
      try {
        FP.session.start(user);
      } catch {
        errorBox.textContent = 'Este navegador no permite guardar la sesión. Desactiva el modo privado o permite los datos del sitio.';
        errorBox.hidden = false;
        return;
      }
      location.href = FP.pages.home;
      return;
    }

    // Login not OK → mensaje de error
    errorBox.textContent = 'El usuario o la contraseña introducidos no son correctos.';
    errorBox.hidden = false;
    userInput.setAttribute('aria-invalid', 'true');
    passInput.setAttribute('aria-invalid', 'true');
    passInput.value = '';
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
