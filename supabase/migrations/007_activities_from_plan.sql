-- ============================================================
-- Family Planner · 007 · Actividades creadas desde "Ocio y Tiempo Libre"
-- ------------------------------------------------------------
-- 1. activities.from_plan: true si la actividad se creó con "Usar este plan".
--    La pantalla Calendario lo indica con el icono de destellos en el aviso
--    "Creada por / Creada el" de las actividades de otra persona.
-- 2. Descripción de hasta 5000 caracteres (antes 2000): las descripciones de la
--    agenda de Madrid llegan a superar los 4000.
-- 3. save_activity() con el parámetro p_from_plan (por defecto false). Solo cuenta
--    al crear: al modificar una actividad se mantiene lo que tenía.
--
-- Se ejecuta una vez en el SQL Editor de Supabase, ANTES de publicar la versión de la
-- aplicación que la usa. La versión anterior de la aplicación sigue funcionando con ella.
-- ============================================================

-- ---------- 1. Columna from_plan ----------
alter table public.activities
  add column if not exists from_plan boolean not null default false;
comment on column public.activities.from_plan is 'Creada con "Usar este plan" (Ocio y Tiempo Libre)';

-- ---------- 2. Descripción hasta 5000 caracteres ----------
-- Quita la regla de longitud anterior sea cual sea su nombre y pone la nueva
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.activities'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%char_length(description)%'
  loop
    execute format('alter table public.activities drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.activities
  add constraint activities_description_check check (char_length(description) <= 5000);

-- ---------- 3. save_activity() con p_from_plan ----------
drop function if exists public.save_activity(uuid, text, text, date, time, time, smallint[], smallint[]);

create function public.save_activity(
  p_activity_id uuid,
  p_name        text,
  p_description text,
  p_date        date,
  p_start_time  time,
  p_end_time    time,
  p_attendees   smallint[],
  p_companions  smallint[],
  p_from_plan   boolean default false
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_member smallint := public.current_member_id();
  v_id     uuid;
begin
  if v_member is null then
    raise exception 'No eres usuario de la aplicación' using errcode = '42501';
  end if;

  p_attendees  := array(select distinct x from unnest(coalesce(p_attendees,  '{}')) x where x is not null);
  p_companions := array(select distinct x from unnest(coalesce(p_companions, '{}')) x where x is not null);

  if cardinality(p_attendees) = 0 then
    raise exception 'Es obligatorio seleccionar un asistente';
  end if;
  if exists (select 1 from unnest(p_attendees) x
             where not exists (select 1 from public.family_members m where m.member_id = x)) then
    raise exception 'Asistente desconocido';
  end if;
  if exists (select 1 from unnest(p_companions) x
             where not exists (select 1 from public.family_members m where m.member_id = x and m.can_accompany)) then
    raise exception 'Acompañante no válido';
  end if;
  if cardinality(p_companions) = 0
     and exists (select 1 from public.family_members m where m.member_id = any (p_attendees) and m.needs_companion) then
    raise exception 'Es obligatorio seleccionar un acompañante';
  end if;

  if p_activity_id is null then
    insert into public.activities (name, description, date, start_time, end_time, created_by, from_plan)
    values (p_name, coalesce(p_description, ''), p_date, p_start_time, p_end_time, v_member, coalesce(p_from_plan, false))
    returning activity_id into v_id;
  else
    -- Al modificar, from_plan no cambia
    update public.activities
       set name = p_name, description = coalesce(p_description, ''), date = p_date,
           start_time = p_start_time, end_time = p_end_time
     where activity_id = p_activity_id and created_by = v_member
    returning activity_id into v_id;
    if v_id is null then
      raise exception 'Solo quien la creó puede modificarla' using errcode = '42501';
    end if;
    delete from public.activity_attendees  where activity_id = v_id;
    delete from public.activity_companions where activity_id = v_id;
  end if;

  insert into public.activity_attendees  (activity_id, member_id) select v_id, x from unnest(p_attendees)  x;
  insert into public.activity_companions (activity_id, member_id) select v_id, x from unnest(p_companions) x;
  return v_id;
end;
$$;

revoke all on function public.save_activity(uuid, text, text, date, time, time, smallint[], smallint[], boolean) from public, anon;
grant execute on function public.save_activity(uuid, text, text, date, time, time, smallint[], smallint[], boolean) to authenticated;
