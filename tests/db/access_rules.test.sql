\set QUIET on
create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin raise notice '% %', case when ok then 'OK   ' else 'FALLO' end, msg; end $$;
create or replace function pg_temp.fails(stmt text) returns text language plpgsql as $$
begin execute stmt; return null; exception when others then return sqlerrm; end $$;
-- Sin sesión
set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.check(pg_temp.fails('select * from public.activities') is not null, 'sin sesión no se pueden leer actividades');
select pg_temp.check(pg_temp.fails($q$select public.save_activity(null,'x','',current_date,'10:00','11:00','{1}','{}')$q$) is not null, 'sin sesión no se puede guardar');
reset role;
-- Alberto
set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.check(public.current_member_id() = 1, 'Alberto es el miembro 1');
select pg_temp.check((select count(*) from public.activities) = 3, 'Alberto ve todas las actividades');
select pg_temp.check((select count(*) from public.user_settings) = 1, 'Alberto solo ve sus ajustes');
select pg_temp.check(pg_temp.fails($q$insert into public.activities (name, date, start_time, end_time) values ('x', current_date, '10:00', '11:00')$q$) is not null, 'no se puede insertar directamente en activities (solo con save_activity)');
select pg_temp.check(pg_temp.fails($q$insert into public.activity_attendees values ('aaaaaaaa-0000-0000-0000-000000000001', 3)$q$) is not null, 'no se pueden tocar los asistentes directamente');
select pg_temp.check(pg_temp.fails($q$select public.save_activity(null,'x','',current_date,'10:00','11:00','{}','{}')$q$) = 'Es obligatorio seleccionar un asistente', 'sin asistentes: error');
select pg_temp.check(pg_temp.fails($q$select public.save_activity(null,'x','',current_date,'10:00','11:00','{3}','{}')$q$) = 'Es obligatorio seleccionar un acompañante', 'Sergio sin acompañante: error');
select pg_temp.check(pg_temp.fails($q$select public.save_activity(null,'x','',current_date,'10:00','11:00','{3}','{4}')$q$) = 'Acompañante no válido', 'Pablo no puede acompañar');
select pg_temp.check(pg_temp.fails($q$select public.save_activity(null,'x','',current_date,'10:00','11:00','{9}','{}')$q$) = 'Asistente desconocido', 'miembro inexistente: error');
select pg_temp.check(pg_temp.fails($q$select public.save_activity(null,'x','',current_date,'11:00','10:00','{1}','{}')$q$) is not null, 'hora fin anterior: error');
select pg_temp.check(pg_temp.fails($q$select public.save_activity('aaaaaaaa-0000-0000-0000-000000000002','hack','',current_date,'10:00','11:00','{1}','{}')$q$) = 'Solo quien la creó puede modificarla', 'Alberto no puede modificar la de Laura');
create temp table t_new as select public.save_activity(null,'Natación','',date '2026-11-19','17:00','18:00','{3,4}','{1,2}') as id;
select pg_temp.check((select created_by from public.activities where activity_id = (select id from t_new)) = 1, 'Alberto crea una: queda a su nombre (miembro 1)');
select pg_temp.check((select array_agg(member_id order by member_id) from public.activity_companions where activity_id = (select id from t_new)) = '{1,2}', 'con acompañantes Alberto y Laura');
select public.save_activity((select id from t_new),'Natación (editada)','',date '2026-11-19','17:00','18:00','{3}','{2}');
select pg_temp.check((select array_agg(member_id) from public.activity_attendees where activity_id = (select id from t_new)) = '{3}'
  and (select array_agg(member_id) from public.activity_companions where activity_id = (select id from t_new)) = '{2}', 'al modificarla se sustituyen asistentes y acompañantes');
with d as (delete from public.activities where activity_id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1) select pg_temp.check((select count(*) from d) = 0, 'Alberto no puede eliminar la de Laura');
select pg_temp.check(pg_temp.fails($q$update public.user_settings set timezone = 'Marte/Base'$q$) is not null, 'zona horaria no válida: error');
update public.user_settings set weekly_digest = false where user_id = '22222222-2222-2222-2222-222222222222';
update public.user_settings set timezone = 'Atlantic/Canary';
select pg_temp.check(pg_temp.fails($q$update public.user_settings set user_id = '22222222-2222-2222-2222-222222222222'$q$) is not null, 'no se puede cambiar el user_id de los ajustes');
reset role;
select pg_temp.check((select weekly_digest from public.user_settings where user_id = '22222222-2222-2222-2222-222222222222'), 'Alberto no puede cambiar los ajustes de Laura');
select pg_temp.check((select timezone from public.user_settings where user_id = '11111111-1111-1111-1111-111111111111') = 'Atlantic/Canary', 'Alberto sí cambia los suyos');
-- Laura
set role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
with d as (delete from public.activities where activity_id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1) select pg_temp.check((select count(*) from d) = 1, 'Laura elimina la suya');
reset role;
select pg_temp.check((select count(*) from public.activity_attendees where activity_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 0, 'al eliminarla se borran sus asistentes y acompañantes');
