create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin raise notice '% %', case when ok then 'OK   ' else 'FALLO' end, msg; end $$;
create or replace function pg_temp.fails(stmt text) returns text language plpgsql as $$
begin execute stmt; return null; exception when others then return sqlerrm; end $$;
select pg_temp.check((select string_agg(date_format || ' ' || number_format || ' ' || time_format || ' ' || language || ' ' || timezone, ' | ') from public.user_settings)
  = 'DD/MM/YYYY 1.234,56 24h es Europe/Madrid | DD/MM/YYYY 1.234,56 24h es Europe/Madrid', 'Alberto y Laura: DD/MM/YYYY · 1.234,56 · 24h (y conservan es y Europe/Madrid)');
select pg_temp.check(not exists (select 1 from information_schema.columns where table_name = 'user_settings' and column_name = 'locale'), 'la columna locale ya no existe');
set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update public.user_settings set date_format = 'MM/DD/YYYY', number_format = '1,234.56', time_format = '12h';
select pg_temp.check(pg_temp.fails($q$update public.user_settings set date_format = 'DD-MM-YY'$q$) is not null, 'formato de fecha no previsto: error');
select pg_temp.check(pg_temp.fails($q$update public.user_settings set number_format = '1234.56'$q$) is not null, 'formato de número no previsto: error');
select pg_temp.check(pg_temp.fails($q$update public.user_settings set time_format = '12'$q$) is not null, 'formato de hora no previsto: error');
select pg_temp.check(pg_temp.fails($q$update public.user_settings set date_format = 'YYYY-MM-DD'$q$) is not null, 'YYYY-MM-DD ya no se admite');
select pg_temp.check(pg_temp.fails($q$update public.user_settings set number_format = '1 234,56'$q$) is not null, '1 234,56 ya no se admite');
reset role;
select pg_temp.check((select date_format || ' ' || time_format from public.user_settings where user_id = '11111111-1111-1111-1111-111111111111') = 'MM/DD/YYYY 12h', 'Alberto cambia sus formatos');
select pg_temp.check((select date_format from public.user_settings where user_id = '22222222-2222-2222-2222-222222222222') = 'DD/MM/YYYY', 'los de Laura no cambian');
select pg_temp.check((select date_format || ' ' || number_format || ' ' || time_format from public.due_weekly_digests('2026-11-15 08:05:00+00') where member_id = 1) = 'MM/DD/YYYY 1,234.56 12h', 'la función del aviso devuelve los formatos nuevos');
select pg_temp.check((select count(*) from public.due_weekly_digests('2026-11-15 08:05:00+00')) = 2, 'y sigue funcionando: el domingo 9:05 toca a los dos');
