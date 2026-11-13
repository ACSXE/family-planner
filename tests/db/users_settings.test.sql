create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin raise notice '% %', case when ok then 'OK   ' else 'FALLO' end, msg; end $$;
create or replace function pg_temp.fails(stmt text) returns text language plpgsql as $$
begin execute stmt; return null; exception when others then return sqlerrm; end $$;
select pg_temp.check((select string_agg(full_name, ', ' order by member_id) from public.family_members) = 'Alberto Carrasco, Laura Liz, Sergio Carrasco Liz, Pablo Carrasco', 'nombres completos de los cuatro miembros');
select pg_temp.check((select string_agg(language || '/' || date_format || '/' || number_format || '/' || time_format || '/' || timezone, ' ') from public.user_settings) = 'es/DD/MM/YYYY/1.234,56/24h/Europe/Madrid es/DD/MM/YYYY/1.234,56/24h/Europe/Madrid', 'ajustes por defecto: es · DD/MM/YYYY · 1.234,56 · 24h · Europe/Madrid');
set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.check((select count(*) from public.users) = 1, 'cada usuario solo ve su fila de users');
select pg_temp.check(pg_temp.fails($q$update public.family_members set color = '#000000' where member_id = 2$q$) is not null, 'desde la app no se pueden modificar los miembros');
select pg_temp.check(pg_temp.fails($q$insert into public.users values (3, '11111111-1111-1111-1111-111111111111')$q$) is not null, 'desde la app no se pueden crear usuarios');
select pg_temp.check(pg_temp.fails($q$update public.user_settings set language = 'español'$q$) is not null, 'idioma que no es de dos letras: error');
update public.user_settings set language = 'en';
reset role;
select pg_temp.check((select language from public.user_settings where user_id = '11111111-1111-1111-1111-111111111111') = 'en', 'Alberto cambia su idioma');
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'sergio@example.com');
insert into public.users values (3, '33333333-3333-3333-3333-333333333333');
select pg_temp.check(exists (select 1 from public.user_settings where user_id = '33333333-3333-3333-3333-333333333333'), 'al hacer usuario a un miembro se crean sus ajustes');
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.check(not exists (select 1 from public.users where member_id = 1) and not exists (select 1 from public.user_settings where user_id = '11111111-1111-1111-1111-111111111111')
  and exists (select 1 from public.family_members where member_id = 1) and (select count(*) from public.activities where created_by = 1) > 0,
  'si se borra la cuenta de Alberto: se van su usuario y sus ajustes; el miembro y sus actividades se conservan');
