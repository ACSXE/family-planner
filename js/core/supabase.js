/*
 * Conexión con Supabase (cliente único para toda la aplicación).
 *   FP.db → cliente de supabase-js (js/vendor/supabase-js-*.js)
 *
 * La sesión se guarda en sessionStorage: dura mientras la pestaña esté abierta,
 * igual que antes de usar Supabase.
 */
window.FP = window.FP || {};

FP.db = supabase.createClient(FP_CONFIG.supabase.url, FP_CONFIG.supabase.publishableKey, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true
  }
});
