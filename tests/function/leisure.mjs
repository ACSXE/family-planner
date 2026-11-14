// Ejecuta la edge function "leisure-events" en Node: Deno.env/Deno.serve simulados, Supabase Auth simulado
// (token "token-ok" = usuario con sesión) y la agenda de Madrid servida desde fixtures/agenda-madrid.json
// (una muestra real de la agenda). La usan leisure-events.test.mjs y la prueba de la aplicación.
import fs from 'node:fs';
const fnPath = new URL('../../supabase/functions/leisure-events/index.ts', import.meta.url).href;
const AGENDA = 'https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json';
// globalThis.LEISURE_NO_ANON = true antes de importar: Supabase sin SUPABASE_ANON_KEY (proyectos con claves nuevas)
const ENV = { SUPABASE_URL: 'https://local.supabase', ...(globalThis.LEISURE_NO_ANON ? {} : { SUPABASE_ANON_KEY: 'anon-key' }) };
const fixture = fs.readFileSync(new URL('./fixtures/agenda-madrid.json', import.meta.url), 'utf8');
let handler;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
export const stats = { agenda: 0 }; let agendaFail = 0;   // descargas que fallarán (Infinity = todas)
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === ENV.SUPABASE_URL + '/auth/v1/user') {
    return init.headers.Authorization === 'Bearer token-ok' && ['anon-key', 'sb_publishable_test'].includes(init.headers.apikey)
      ? Response.json({ id: '11111111-1111-1111-1111-111111111111' }) : Response.json({ msg: 'invalid JWT' }, { status: 401 });
  }
  if (url === AGENDA) {
    stats.agenda++;
    if (agendaFail > 0) { agendaFail--; return new Response('caído', { status: 503 }); }
    return new Response(fixture, { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('sin red en las pruebas', { status: 599 });
};
export const mod = await import(fnPath);
export const setAgendaFail = (v) => { agendaFail = v === true ? Infinity : v || 0; };
export async function call(body, { token = 'token-ok', method = 'POST', apikey = 'sb_publishable_test' } = {}) {
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(apikey ? { apikey } : {}) };
  const res = await handler(new Request('http://fn', { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined }));
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}

// Uso desde la línea de órdenes (prueba de la aplicación): node leisure.mjs 2026-11-21 → respuesta JSON
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()) && process.argv[2]) {
  const r = await call({ date: process.argv[2] });
  process.stdout.write(JSON.stringify(r.body));
}
