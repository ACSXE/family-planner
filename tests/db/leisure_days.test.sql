-- Migración 008: agenda de ocio en leisure_days. Quién lee, quién escribe, leisure_day() y replace_leisure_days().
create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin raise notice '% %', case when ok then 'OK   ' else 'FALLO' end, msg; end $$;
insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999', 'intruso@example.com');

-- Tabla vacía (aún no se ha actualizado nunca)
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.check(public.leisure_day('2026-11-21') = '{"date": "2026-11-21", "plans": [], "until": null, "updated_at": null}'::jsonb, 'tabla vacía: sin planes y until = null');
reset role;

-- La edge function (service_role) guarda la agenda de una vez
set role service_role;
select pg_temp.check(public.replace_leisure_days('{"2026-11-21": [{"title": "Taller"}, {"title": "Concierto"}], "2026-11-22": [{"title": "Cuentos"}]}') = 2, 'service_role guarda 2 días');
select public.replace_leisure_days('{"2026-11-22": [{"title": "Cuentos"}], "2026-11-23": [{"title": "Cine"}]}');
select pg_temp.check((select string_agg(date::text, ',' order by date) from public.leisure_days) = '2026-11-22,2026-11-23', 'al volver a guardar, sustituye todo (los días que ya no vienen desaparecen)');
do $$ begin
  perform public.replace_leisure_days('{}');
  raise notice 'FALLO una agenda vacía ha borrado la tabla';
exception when raise_exception then raise notice 'OK    una agenda vacía se rechaza: la tabla no se vacía';
end $$;
do $$ begin
  perform public.replace_leisure_days('{"2026-11-24": {"no": "es una lista"}}');
  raise notice 'FALLO se ha guardado un día que no es una lista de planes';
exception when check_violation then raise notice 'OK    un día que no es una lista se rechaza';
end $$;
select pg_temp.check((select count(*) from public.leisure_days) = 2, 'tras los rechazos, la tabla sigue con los 2 días');
reset role;

-- Usuario de la aplicación: lee, pero no escribe
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.check((public.leisure_day('2026-11-23')->'plans'->0->>'title') = 'Cine' and public.leisure_day('2026-11-23')->>'until' = '2026-11-23'
  and public.leisure_day('2026-11-23')->>'updated_at' is not null, 'Laura lee los planes de un día, hasta cuándo hay y cuándo se actualizó');
select pg_temp.check(jsonb_array_length(public.leisure_day('2026-12-25')->'plans') = 0, 'día sin planes: lista vacía');
do $$ begin
  insert into public.leisure_days (date, plans) values ('2026-12-01', '[]');
  raise notice 'FALLO un usuario ha podido añadir planes';
exception when insufficient_privilege then raise notice 'OK    un usuario no puede añadir planes';
end $$;
do $$ begin
  update public.leisure_days set plans = '[]';
  raise notice 'FALLO un usuario ha podido cambiar planes';
exception when insufficient_privilege then raise notice 'OK    un usuario no puede cambiar planes';
end $$;
do $$ begin
  delete from public.leisure_days;
  raise notice 'FALLO un usuario ha podido borrar planes';
exception when insufficient_privilege then raise notice 'OK    un usuario no puede borrar planes';
end $$;
do $$ begin
  perform public.replace_leisure_days('{"2026-12-01": []}');
  raise notice 'FALLO un usuario ha podido sustituir la agenda';
exception when insufficient_privilege then raise notice 'OK    un usuario no puede sustituir la agenda';
end $$;

-- Cuenta de Auth sin alta en users: no ve nada
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
select pg_temp.check((select count(*) from public.leisure_days) = 0 and public.leisure_day('2026-11-23')->'until' = 'null'::jsonb, 'cuenta sin alta en la aplicación: no ve planes');
reset role;

-- Sin sesión (anon): ni la tabla ni la función
set role anon;
do $$ begin
  perform public.leisure_day('2026-11-23');
  raise notice 'FALLO anon ha podido leer la agenda';
exception when insufficient_privilege then raise notice 'OK    sin sesión no se puede leer la agenda';
end $$;
reset role;
