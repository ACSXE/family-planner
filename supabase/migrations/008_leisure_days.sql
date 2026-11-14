-- ============================================================
-- Family Planner · migración 008: agenda de ocio guardada en la base de datos
-- ------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → Run,
-- después de 007_activities_from_plan.sql. No cambia ningún dato existente.
--
-- Crea:
--   · leisure_days: los planes de "Ocio y Tiempo Libre", una fila por día, ya preparados
--     (solo eventos de un día y los campos que muestra la ventana).
--     La llena cada madrugada la edge function leisure-events, llamada por el cron
--     (supabase/cron/leisure_refresh_cron.sql). Si Madrid no responde, se queda como estaba.
--   · leisure_day(p_date): lo que pide la ventana: los planes de ese día, el último día con
--     planes y cuándo se actualizó. Con las reglas de acceso de quien la llama.
--   · replace_leisure_days(p_days): cambia todos los planes de una vez. Solo la usa la
--     edge function (rol service_role).
--
-- Quién puede qué: los usuarios de la aplicación leen; nadie la modifica desde la app.
-- ============================================================

begin;

create table public.leisure_days (
  date       date primary key,
  plans      jsonb not null default '[]'::jsonb check (jsonb_typeof(plans) = 'array'),
  updated_at timestamptz not null default now()
);
comment on table public.leisure_days is 'Planes de Ocio y Tiempo Libre por día (agenda de Madrid), los escribe la edge function leisure-events';

alter table public.leisure_days enable row level security;
revoke all on public.leisure_days from anon, authenticated;
grant select on public.leisure_days to authenticated;
grant select, insert, update, delete on public.leisure_days to service_role;

-- Solo los usuarios de la aplicación (filas en users), como el resto de datos (005)
create policy "Miembros ven los planes de ocio" on public.leisure_days
  for select to authenticated using ((select public.current_member_id()) is not null);


-- Lo que pide la ventana para un día. security invoker: aplica la regla de acceso de arriba
-- (sin ser usuario de la aplicación devuelve plans vacío y el resto a null).
create function public.leisure_day(p_date date)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'date',       p_date,
    'plans',      coalesce((select d.plans from public.leisure_days d where d.date = p_date), '[]'::jsonb),
    'until',      (select max(d.date) from public.leisure_days d),
    'updated_at', (select max(d.updated_at) from public.leisure_days d)
  );
$$;
revoke all on function public.leisure_day(date) from public, anon;
grant execute on function public.leisure_day(date) to authenticated;


-- Sustituye todos los planes por los de p_days ({"2026-11-21": [...], ...}) en una sola
-- transacción: o se guarda la agenda entera o no cambia nada. Devuelve los días guardados.
create function public.replace_leisure_days(p_days jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_days) <> 'object' or p_days = '{}'::jsonb then
    raise exception 'La agenda llega vacía: no se cambia nada';
  end if;
  delete from public.leisure_days where true;
  insert into public.leisure_days (date, plans, updated_at)
  select key::date, value, now() from jsonb_each(p_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.replace_leisure_days(jsonb) from public, anon, authenticated;
grant execute on function public.replace_leisure_days(jsonb) to service_role;

commit;
