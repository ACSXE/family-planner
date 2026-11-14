// Edge function "leisure-events" en un proyecto sin SUPABASE_ANON_KEY (claves nuevas sb_publishable_…):
// comprueba la sesión con la clave pública que envía la aplicación. Lo lanza tests/run.sh.
globalThis.LEISURE_NO_ANON = true;
const { call } = await import('./leisure.mjs');
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
try {
  ok((await call({ date: '2026-11-21' })).status === 200, 'sin SUPABASE_ANON_KEY: con sesión y la clave pública de la app, responde');
  ok((await call({ date: '2026-11-21' }, { apikey: null })).status === 401, 'sin SUPABASE_ANON_KEY ni clave pública: 401');
  ok((await call({ date: '2026-11-21' }, { token: null })).status === 401, 'sin sesión: 401');
} catch (e) { res.push('PARADA: ' + e.message); }
console.log(res.join('\n'));
process.exitCode = res.some((l) => /^(FALLO|PARADA)/.test(l)) ? 1 : 0;
