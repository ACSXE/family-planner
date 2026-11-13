// Ejecuta la edge function (supabase/functions/weekly-digest/index.ts) en Node: Deno.env/Deno.serve simulados, la API REST de Supabase
// contra el PostgreSQL local (rol service_role) y Resend simulado (guarda los correos).
import { execFileSync } from 'node:child_process';
const fnPath = new URL('../../supabase/functions/weekly-digest/index.ts', import.meta.url).href;
const ENV = { SUPABASE_URL: 'https://local.supabase', SUPABASE_SERVICE_ROLE_KEY: 'service-key', RESEND_API_KEY: 're_test', CRON_SECRET: 'secreto-cron' };
let handler;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
const q = (v) => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const sql = (stmt) => {
  const out = execFileSync('psql', ['-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1',
    '-c', 'set role service_role', '-c', stmt], { encoding: 'utf8' }).trim();
  return out ? JSON.parse(out) : null;
};
const sent = []; let resendFail = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith(ENV.SUPABASE_URL)) {
    if (init.headers.Authorization !== 'Bearer service-key') return new Response('sin clave', { status: 401 });
    const path = url.replace(ENV.SUPABASE_URL + '/rest/v1/', '');
    const b = JSON.parse(init.body || '{}');
    if (path === 'rpc/due_weekly_digests') {
      const args = [b.p_now ? `p_now => ${q(b.p_now)}::timestamptz` : null, `p_member => ${b.p_member ?? 'null'}::smallint`].filter(Boolean).join(', ');
      return Response.json(sql(`select coalesce(json_agg(t), '[]') from public.due_weekly_digests(${args}) t`));
    }
    if (path.startsWith('digest_log')) {
      sql(`insert into public.digest_log (user_id, week_start, status, resend_id, error) values (${q(b.user_id)}, ${q(b.week_start)}, ${q(b.status)}, ${q(b.resend_id)}, ${q(b.error)})
           on conflict (user_id, week_start) do update set status = excluded.status, resend_id = excluded.resend_id, error = excluded.error, updated_at = now()`);
      return new Response(null, { status: 201 });
    }
    return new Response('no simulado', { status: 404 });
  }
  if (url === 'https://api.resend.com/emails') {
    if (resendFail) return Response.json({ message: 'Fallo simulado' }, { status: 500 });
    const mail = JSON.parse(init.body); const id = 'email_' + (sent.length + 1);
    sent.push({ ...mail, idempotency: init.headers['Idempotency-Key'] || null, id });
    return Response.json({ id });
  }
  return realFetch(url, init);
};
await import(fnPath);
const call = async (body, secret = ENV.CRON_SECRET) => {
  const res = await handler(new Request('http://fn', { method: 'POST', headers: { 'x-cron-secret': secret }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
export { call, sent, sql };
export const setResendFail = (v) => { resendFail = v; };
