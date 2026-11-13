// Pruebas de la edge function del aviso semanal: ejecuta la función real contra el
// PostgreSQL de pruebas (ya migrado) con Resend simulado. Lo lanza tests/run.sh.
import { call, sent, sql, setResendFail } from './harness.mjs';

const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
const log = () => sql(`select coalesce(json_agg(t order by user_id), '[]') from (select user_id, week_start, status, resend_id from public.digest_log) t`);

let r = await call({}, 'mala');
ok(r.status === 401, 'sin la contraseña del cron: 401, no hace nada');
r = await call({ dry_run: true, member_id: 1, week_of: '2026-11-16' });
ok(r.body.results[0].status === 'dry_run' && sent.length === 0, 'dry_run: devuelve el correo y no envía nada');
ok(r.body.results[0].subject === 'Tu semana en Family Planner (del 16 al 22 de noviembre)', `asunto: "${r.body.results[0].subject}"`);
ok(/Hola Alberto,/.test(r.body.results[0].html) && /Tus actividades como asistente/.test(r.body.results[0].html), 'saludo y títulos del correo');
ok(!/font:/.test(r.body.results[0].html.replace(/<style>[\s\S]*?<\/style>/, '')), 'sin el atajo CSS "font:" (Outlook lo ignora)');
r = await call({ member_id: 1, week_of: '2026-11-16' });
ok(sent.length === 1 && sent[0].to[0] === 'alberto@example.com' && sent[0].from === 'Family Planner <family_planner@notifications.acsex.es>', `prueba para Alberto: 1 correo a ${sent[0]?.to} desde ${sent[0]?.from}`);
ok(log().length === 0 && !sent[0].idempotency, 'una prueba no queda registrada ni bloquea el aviso real');
r = await call({ member_id: 1, week_of: '2026-12-07' });
ok(r.body.results[0].status === 'skipped' && sent.length === 1, 'semana sin actividades: no se envía');

// Modo cron: "week_of" fija el momento de la llamada (domingo 15/11 a las 13:00 de Madrid)
setResendFail(true);
r = await call({ week_of: '2026-11-15' });
ok(r.body.results.length === 2 && log().every((x) => x.status === 'error'), 'si Resend falla: queda registrado como error');
setResendFail(false);
r = await call({ week_of: '2026-11-15' });
ok(r.body.results.length === 2 && r.body.results.every((x) => x.status === 'sent'), 'en la siguiente ejecución se reintenta y se envía a Alberto y a Laura');
ok(log().every((x) => x.status === 'sent' && x.resend_id), 'registro: los dos como "sent" con su id de Resend');
ok(sent.slice(1).every((m) => m.idempotency?.startsWith('weekly-digest-')), 'cada envío lleva clave de idempotencia (Resend no lo duplica)');
r = await call({ week_of: '2026-11-15' });
ok(r.body.results.length === 0 && sent.length === 3, 'una hora después: no se repite');
sql(`delete from public.digest_log; update public.user_settings set weekly_digest = false where user_id = '22222222-2222-2222-2222-222222222222'`);
r = await call({ week_of: '2026-11-15' });
ok(r.body.results.length === 1 && r.body.results[0].name === 'Alberto', 'Laura con el aviso desactivado: solo se envía a Alberto');

console.log(res.join('\n'));
process.exitCode = res.some((l) => l.startsWith('FALLO')) ? 1 : 0;
