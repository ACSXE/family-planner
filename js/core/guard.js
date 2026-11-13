/*
 * Comprobación rápida de sesión, ANTES de pintar la página.
 * Se carga en la cabecera de index.html y login.html (después de js/config.js).
 *
 * Supabase guarda la sesión en sessionStorage. Mirarla es inmediato y no espera a la
 * red, así que se decide qué hacer antes de que el navegador dibuje nada:
 *   · index.html sin sesión guardada → login.html al momento (no se ve la aplicación)
 *   · login.html con sesión guardada → se muestra la pantalla de carga en vez del
 *     formulario, mientras js/login.js confirma la sesión y pasa a la aplicación
 * La comprobación completa (que la sesión siga siendo válida) la hacen después
 * js/shell.js y js/login.js con Supabase, como siempre.
 *
 *   FP.pages              → rutas de las páginas
 *   FP.hasStoredSession() → true si hay una sesión guardada en esta pestaña
 */
window.FP = window.FP || {};

FP.pages = {
  login: 'login.html',
  home: 'index.html'
};

FP.hasStoredSession = () => {
  const project = new URL(FP_CONFIG.supabase.url).hostname.split('.')[0];
  try {
    return !!sessionStorage.getItem(`sb-${project}-auth-token`);
  } catch {
    return false;   // almacenamiento no disponible: lo decidirá la comprobación completa
  }
};

(() => {
  const page = document.documentElement.dataset.page;   // <html data-page="app" | "login">
  if (page === 'app' && !FP.hasStoredSession()) {
    document.documentElement.style.display = 'none';   // no se pinta nada mientras se va al login
    location.replace(FP.pages.login);
  } else if (page === 'login' && FP.hasStoredSession()) {
    document.documentElement.classList.add('is-loading');
  }
})();
