(() => {
  'use strict';

  // Si ya hay sesión abierta, ir directamente al planner
  let hasSession = false;
  try { hasSession = !!sessionStorage.getItem('fp.session'); } catch { /* almacenamiento no disponible */ }
  if (hasSession) {
    location.replace('planner.html');
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
    const username = userInput.value.trim();
    const password = passInput.value;

    const user = FP_CONFIG.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );

    if (user) {
      // Login OK → página principal
      try {
        sessionStorage.setItem('fp.session', JSON.stringify({ username: user.username, name: user.name }));
      } catch {
        errorBox.textContent = 'Este navegador no permite guardar la sesión. Desactiva el modo privado o permite los datos del sitio.';
        errorBox.hidden = false;
        return;
      }
      location.href = 'planner.html';
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
