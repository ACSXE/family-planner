/*
 * Sesión del usuario con Supabase Auth.
 *   FP.pages                        → rutas de las páginas
 *   await FP.session.signIn(e, p)   → { ok: true } o { ok: false, reason: 'credentials' | 'network' }
 *   await FP.session.current()      → { id, email, name } o null
 *   await FP.session.require()      → el usuario, o redirige al login si no hay sesión
 *   FP.session.user                 → el usuario de la sesión, una vez cargado por require()
 *   FP.session.nameOf(id)           → nombre visible de cualquier usuario ("Laura Liz")
 *   await FP.session.end()          → cierra la sesión
 *
 * Los nombres visibles salen de la tabla "profiles" (supabase/schema.sql).
 */
window.FP = window.FP || {};

FP.pages = {
  login: 'login.html',
  home: 'index.html'
};

FP.session = (() => {
  let names = {};   // id de usuario → nombre visible

  async function loadNames() {
    const { data, error } = await FP.db.from('profiles').select('id, full_name');
    if (!error) names = Object.fromEntries(data.map((p) => [p.id, p.full_name]));
  }

  return {
    user: null,

    async signIn(email, password) {
      try {
        const { error } = await FP.db.auth.signInWithPassword({ email, password });
        if (!error) return { ok: true };
        return { ok: false, reason: error.status === 400 ? 'credentials' : 'network' };
      } catch {
        return { ok: false, reason: 'network' };
      }
    },

    async current() {
      const { data } = await FP.db.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      await loadNames();
      return { id: u.id, email: u.email, name: names[u.id] || u.email };
    },

    async require() {
      const user = await this.current();
      if (!user) { location.replace(FP.pages.login); return null; }
      this.user = user;
      return user;
    },

    nameOf(id) {
      return names[id] || '';
    },

    async end() {
      try { await FP.db.auth.signOut(); } catch { /* se sale igualmente */ }
      this.user = null;
    }
  };
})();
