// Imitación mínima de la API de Supabase (PostgREST) sobre el PostgreSQL local ya migrado.
// Ejecuta las consultas con el rol "authenticated" y el usuario de la sesión, así se aplican
// de verdad las reglas de acceso (RLS) y la función save_activity().
const { execFileSync } = require('child_process');
// Conexión: variables PGHOST, PGPORT, PGUSER y PGDATABASE (las fija tests/run.sh)
const DB = ['-X', '-q', '-tA', '-v', 'VERBOSITY=verbose'];
const q = (v) => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const arr = (a) => `array[${(a || []).map(Number).join(',')}]::smallint[]`;

function sql(stmt, sub) {
  const args = sub ? ['-c', 'set role authenticated', '-c', `select set_config('request.jwt.claim.sub', ${q(sub)}, false)`] : [];
  try {
    const out = execFileSync('psql', [...DB, ...args, '-c', stmt], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').slice(sub ? 1 : 0).join('\n');   // la 1.ª línea es la de set_config
    return { data: JSON.parse(out || 'null') };
  } catch (e) {
    const m = /ERROR:\s+(\w{5}):\s+(.*)/.exec(e.stderr || '') || [];
    return { error: { code: m[1] || 'XX000', message: m[2] || String(e.stderr) } };
  }
}

const ACT = `select a.activity_id, a.name, a.description, a.date, a.start_time, a.end_time, a.created_by, a.created_at,
  coalesce((select json_agg(json_build_object('member_id', x.member_id)) from public.activity_attendees x where x.activity_id = a.activity_id), '[]') as activity_attendees,
  coalesce((select json_agg(json_build_object('member_id', x.member_id)) from public.activity_companions x where x.activity_id = a.activity_id), '[]') as activity_companions
  from public.activities a`;

async function install(ctx, userId, log = []) {
  await ctx.addInitScript(([uid]) => {
    // Solo la primera vez: si la app cierra la sesión, no se vuelve a abrir sola al recargar
    if (sessionStorage.getItem('fake-session-done')) return;
    sessionStorage.setItem('fake-session-done', '1');
    sessionStorage.setItem('sb-hdzeibaonokdcicqmuzw-auth-token', JSON.stringify({
      access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: uid, email: uid.startsWith('1') ? 'alberto@example.com' : 'laura@example.com', aud: 'authenticated', role: 'authenticated' }
    }));
  }, [userId]);
  await ctx.route('**/auth/v1/**', (r) => r.fulfill({ json: {} }));
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname.replace('/rest/v1/', '');
    const p = url.searchParams; const method = req.method();
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    let r;
    if (method === 'GET' && path === 'family_members') {
      const cols = p.get('select').split(',').map((c) => c.trim()).filter((c) => /^[a-z_]+$/.test(c)).join(', ');
      r = sql(`select json_agg(t order by member_id) from (select ${cols} from public.family_members) t`, userId);
    }
    else if (method === 'GET' && path === 'users') {
      const uid = (p.get('user_id') || '').replace(/^eq\./, '');
      r = sql(`select coalesce(json_agg(t), '[]') from (select u.member_id, json_build_object('full_name', m.full_name) as family_members from public.users u join public.family_members m using (member_id)${uid ? ` where u.user_id = ${q(uid)}` : ''}) t`, userId);
      if (single && r.data) r.data = r.data[0] || null;
    }
    else if (method === 'GET' && path === 'activities') {
      const id = (p.get('activity_id') || '').replace(/^eq\./, '');
      r = sql(`select coalesce(json_agg(t order by t.date, t.start_time), '[]') from (${ACT}${id ? ` where a.activity_id = ${q(id)}` : ''}) t`, userId);
      if (single && r.data) r.data = r.data[0];
    } else if (method === 'POST' && path === 'rpc/save_activity') {
      const b = req.postDataJSON();
      r = sql(`select to_json(public.save_activity(${q(b.p_activity_id)}::uuid, ${q(b.p_name)}, ${q(b.p_description)}, ${q(b.p_date)}::date, ${q(b.p_start_time)}::time, ${q(b.p_end_time)}::time, ${arr(b.p_attendees)}, ${arr(b.p_companions)}))`, userId);
      log.push({ rpc: b, result: r });
    } else if (method === 'DELETE' && path === 'activities') {
      const id = (p.get('activity_id') || '').replace(/^eq\./, '');
      r = sql(`with d as (delete from public.activities where activity_id = ${q(id)} returning activity_id) select coalesce(json_agg(d), '[]') from d`, userId);
    } else r = { error: { code: 'PGRST', message: 'no simulado: ' + method + ' ' + path } };
    if (r.error) return route.fulfill({ status: 400, json: { ...r.error, details: null, hint: null } });
    return route.fulfill({ json: r.data });
  });
}
module.exports = { install, sql };
