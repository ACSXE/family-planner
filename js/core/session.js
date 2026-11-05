/*
 * Sesión del usuario (se guarda en sessionStorage: dura mientras la pestaña esté abierta).
 *   FP.pages                         → rutas de las páginas
 *   FP.session.authenticate(u, p)    → usuario de FP_CONFIG.users o null
 *   FP.session.start(user)           → abre la sesión (lanza un error si el navegador no deja guardarla)
 *   FP.session.get()                 → { username, name } o null
 *   FP.session.require()             → la sesión, o redirige al login si no hay
 *   FP.session.end()                 → cierra la sesión
 */
window.FP = window.FP || {};

FP.pages = {
  login: 'login.html',
  home: 'index.html'
};

FP.session = (() => {
  const KEY = 'fp.session';

  return {
    authenticate(username, password) {
      return FP_CONFIG.users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
      ) || null;
    },

    start(user) {
      sessionStorage.setItem(KEY, JSON.stringify({ username: user.username, name: user.name }));
    },

    get() {
      try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
    },

    require() {
      const session = this.get();
      if (!session) location.replace(FP.pages.login);
      return session;
    },

    end() {
      try { sessionStorage.removeItem(KEY); } catch { /* nada que borrar */ }
    }
  };
})();
