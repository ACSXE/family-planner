create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin raise notice '% %', case when ok then 'OK   ' else 'FALLO' end, msg; end $$;
create or replace function pg_temp.n(t timestamptz) returns int language sql as $$ select count(*)::int from public.due_weekly_digests(t) $$;
-- Domingo 15/11/2026. En noviembre Madrid es UTC+1: las 9:00 de Madrid son las 8:00 UTC
select pg_temp.check(pg_temp.n('2026-11-15 07:59:00+00') = 0, 'domingo 8:59 en Madrid: todavía no toca');
select pg_temp.check(pg_temp.n('2026-11-15 08:05:00+00') = 2, 'domingo 9:05 en Madrid: toca a Alberto y a Laura');
select pg_temp.check(pg_temp.n('2026-11-14 08:05:00+00') = 0, 'sábado: no toca');
select pg_temp.check(pg_temp.n('2026-11-16 08:05:00+00') = 0, 'lunes: no toca');
select pg_temp.check((select week_start || '…' || week_end from public.due_weekly_digests('2026-11-15 08:05:00+00') limit 1) = '2026-11-16…2026-11-22', 'el domingo 15 se avisa de la semana siguiente: lunes 16 a domingo 22');
select pg_temp.check((select email from public.due_weekly_digests('2026-11-15 08:05:00+00') where member_id = 2) = 'laura@example.com', 'destinatario: el correo de la cuenta');
select pg_temp.check((select jsonb_array_length(attending) || '/' || jsonb_array_length(accompanying) from public.due_weekly_digests('2026-11-15 08:05:00+00') where member_id = 1) = '2/2', 'Alberto: 2 como asistente y 2 como acompañante');
insert into public.digest_log (user_id, week_start, status) values ('11111111-1111-1111-1111-111111111111', '2026-11-16', 'sent');
select pg_temp.check(pg_temp.n('2026-11-15 09:05:00+00') = 1, 'ya enviado a Alberto: a las 10:05 solo queda Laura');
update public.digest_log set status = 'error';
select pg_temp.check(pg_temp.n('2026-11-15 09:05:00+00') = 2, 'si el envío falló, se reintenta en la hora siguiente');
delete from public.digest_log;
update public.user_settings set weekly_digest = false where user_id = '22222222-2222-2222-2222-222222222222';
select pg_temp.check(pg_temp.n('2026-11-15 08:05:00+00') = 1, 'Laura con el aviso desactivado: solo Alberto');
update public.user_settings set weekly_digest = true, timezone = 'Atlantic/Canary' where user_id = '22222222-2222-2222-2222-222222222222';
select pg_temp.check(pg_temp.n('2026-11-15 08:05:00+00') = 1 and pg_temp.n('2026-11-15 09:05:00+00') = 2, 'Laura en Canarias: le toca una hora más tarde');
update public.user_settings set timezone = 'Europe/Madrid';
select pg_temp.check((select week_start::text from public.due_weekly_digests('2026-11-18 15:00:00+00', 1::smallint)) = '2026-11-16', 'prueba para Alberto un miércoles: el aviso de la semana de esa fecha (16–22)');
set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.check((select count(*) from pg_proc where proname = 'due_weekly_digests' and has_function_privilege('authenticated', oid, 'execute')) = 0, 'los usuarios de la app no pueden llamar a due_weekly_digests');
select pg_temp.check(not has_table_privilege('authenticated', 'public.digest_log', 'select'), 'los usuarios de la app no ven digest_log');
reset role;
