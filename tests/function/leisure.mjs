// Ejecuta la edge function "leisure-events" en Node: Deno.env/Deno.serve simulados, la agenda de Madrid servida
// desde fixtures/agenda-madrid.json (una muestra real de la agenda) y la API REST de Supabase contra el
// PostgreSQL local (rol service_role), como harness.mjs. La usan leisure-events.test.mjs y la prueba de la aplicación.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const fnPath = new URL('../../supabase/functions/leisure-events/index.ts', import.meta.url).href;
const AGENDA = 'https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json';
const ENV = { SUPABASE_URL: 'https://local.supabase', SUPABASE_SERVICE_ROLE_KEY: 'service-key', CRON_SECRET: 'secreto-cron' };
export const fixture = fs.readFileSync(new URL('./fixtures/agenda-madrid.json', import.meta.url), 'utf8');
let handler;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
export const sql = (stmt) => {
  const out = execFileSync('psql', ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', 'set role service_role', '-c', stmt], { encoding: 'utf8' }).trim();
  return out ? JSON.parse(out) : null;
};
export const stats = { agenda: 0, saves: 0 };
let agendaFail = 0, saveFail = false;   // descargas que fallarán (Infinity = todas) / guardar falla
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === AGENDA) {
    stats.agenda++;
    if (agendaFail > 0) { agendaFail--; return new Response('caído', { status: 503 }); }
    return new Response(fixture, { headers: { 'Content-Type': 'application/json' } });
  }
  if (url === ENV.SUPABASE_URL + '/rest/v1/rpc/replace_leisure_days') {
    if (init.headers.Authorization !== 'Bearer service-key') return new Response('sin clave', { status: 401 });
    stats.saves++;
    if (saveFail) return Response.json({ message: 'Fallo simulado' }, { status: 500 });
    const days = JSON.stringify(JSON.parse(init.body).p_days).replace(/'/g, "''");
    return Response.json(sql(`select to_json(public.replace_leisure_days('${days}'::jsonb))`));
  }
  return new Response('sin red en las pruebas', { status: 599 });
};
export const mod = await import(fnPath);
export const setAgendaFail = (v) => { agendaFail = v === true ? Infinity : v || 0; };
export const setSaveFail = (v) => { saveFail = v; };
export async function call(body = {}, { secret = 'secreto-cron', method = 'POST' } = {}) {
  const headers = secret ? { 'x-cron-secret': secret } : {};
  const res = await handler(new Request('http://fn', { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined }));
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Uso desde la línea de órdenes (prueba de la aplicación): node leisure.mjs refresh 2026-11-01
// → la función guarda en la base de datos la agenda de muestra desde ese día
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()) && process.argv[2] === 'refresh') {
  console.log = () => {};
  const r = await call({ from: process.argv[3] });
  process.stdout.write(JSON.stringify(r.body));
}
