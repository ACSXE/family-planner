-- Migración 007: actividades creadas desde "Ocio y Tiempo Libre" (from_plan) y descripción de hasta 5000 caracteres.
create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin raise notice '% %', case when ok then 'OK   ' else 'FALLO' end, msg; end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- Con la llamada de antes (8 parámetros, versión anterior de la aplicación) sigue funcionando
select set_config('fp.a', public.save_activity(null, 'Sin plan', '', '2026-12-05', '10:00', '11:00', array[1]::smallint[], '{}')::text, false);
select pg_temp.check((select not from_plan from public.activities where activity_id = current_setting('fp.a')::uuid), 'llamada sin p_from_plan: from_plan = false');

-- Creada con "Usar este plan", con una descripción larga de la agenda
select set_config('fp.b', public.save_activity(null, 'Taller Pinta-Rocas', repeat('x', 4500), '2026-12-05', '16:30', '17:30', array[1]::smallint[], '{}', true)::text, false);
select pg_temp.check((select from_plan and char_length(description) = 4500 from public.activities where activity_id = current_setting('fp.b')::uuid), 'con p_from_plan: from_plan = true y descripción de 4500 caracteres');

-- Al modificarla no cambia, aunque se mande false
select public.save_activity(current_setting('fp.b')::uuid, 'Taller Pinta-Rocas (editado)', '', '2026-12-05', '16:30', '17:30', array[1]::smallint[], '{}', false);
select pg_temp.check((select from_plan from public.activities where activity_id = current_setting('fp.b')::uuid), 'al modificar, from_plan se mantiene');

-- Y no se puede marcar una existente que no lo era
select public.save_activity(current_setting('fp.a')::uuid, 'Sin plan', '', '2026-12-05', '10:00', '11:00', array[1]::smallint[], '{}', true);
select pg_temp.check((select not from_plan from public.activities where activity_id = current_setting('fp.a')::uuid), 'al modificar con p_from_plan = true no se marca');

-- Límite de 5000 caracteres
do $$ begin
  perform public.save_activity(null, 'Demasiado larga', repeat('x', 5001), '2026-12-05', '12:00', '13:00', array[1]::smallint[], '{}', true);
  raise notice 'FALLO descripción de 5001 caracteres aceptada';
exception when check_violation then raise notice 'OK    descripción de más de 5000 caracteres: rechazada';
end $$;

-- Laura la ve marcada; nadie puede cambiar from_plan directamente
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.check((select from_plan from public.activities where activity_id = current_setting('fp.b')::uuid), 'Laura ve la marca de la actividad de Alberto');
do $$ begin
  update public.activities set from_plan = false where activity_id = current_setting('fp.b')::uuid;
  raise notice 'FALLO se ha podido cambiar from_plan sin save_activity()';
exception when insufficient_privilege then raise notice 'OK    from_plan no se puede cambiar directamente';
end $$;
reset role;
