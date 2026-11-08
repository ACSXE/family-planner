/*
 * Sesión del usuario con Supabase Auth.
 *   FP.pages                        → rutas de las páginas
 *   await FP.session.signIn(e, p)   → { ok: true } o { ok: false, reason: 'credentials' | 'network' }
 *   await FP.session.current()      → { id, memberId, email, name } o null  (id = usuario de Supabase)
 *   await FP.session.require()      → el usuario, o redirige al login si no hay sesión
 *   FP.session.user                 → el usuario de la sesión, una vez cargado por require()
 *   FP.session.nameOf(memberId)     → nombre completo de un miembro ("Laura Liz", de FP.family)
 *   await FP.session.end()          → cierra la sesión
 *
 * El member_id del usuario sale de la tabla "users" y su nombre completo de
 * "family_members" (supabase/migrations/002_family_members.sql).
 */
window.FP = window.FP || {};

FP.pages = {
  login: 'login.html',
  home: 'index.html'
};

FP.session = (() => {
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
      // Miembro de la familia que corresponde a este usuario (tabla users)
      const { data: appUser } = await FP.db.from('users')
        .select('member_id, family_members(full_name)').eq('user_id', u.id).maybeSingle();
      return { id: u.id, memberId: appUser?.member_id ?? null, email: u.email, name: appUser?.family_members?.full_name || u.email };
    },

    async require() {
      const user = await this.current();
      if (!user) { location.replace(FP.pages.login); return null; }
      this.user = user;
      return user;
    },

    nameOf(memberId) {
      return FP.family?.byId[memberId]?.fullName || '';
    },

    async end() {
      try { await FP.db.auth.signOut(); } catch { /* se sale igualmente */ }
      this.user = null;
    }
  };
})();
