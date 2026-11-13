create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin raise notice '% %', case when ok then 'OK   ' else 'FALLO' end, msg; end $$;
insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999', 'intruso@example.com');
set role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
select pg_temp.check((select count(*) from public.activities) = 0, 'cuenta de Auth sin alta en users: no ve actividades');
select pg_temp.check((select count(*) from public.family_members) = 0, 'ni miembros de la familia');
select pg_temp.check((select count(*) from public.activity_attendees) + (select count(*) from public.activity_companions) = 0, 'ni asistentes ni acompañantes');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.check((select count(*) from public.activities) > 0 and (select count(*) from public.family_members) = 4, 'Alberto sigue viendo todas las actividades y los 4 miembros');
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.check((select count(*) from public.activities) > 0, 'Laura también');
reset role;
