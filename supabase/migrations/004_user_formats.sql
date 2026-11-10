-- ============================================================
-- Family Planner · migración 004: formatos de fecha, números y hora por usuario
-- ------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → Run,
-- después de 003_weekly_digest.sql. Conserva los ajustes existentes.
--
-- En user_settings, locale (que decidía a la vez fechas y números) se sustituye por:
--   date_format    DD/MM/YYYY · MM/DD/YYYY    (por defecto DD/MM/YYYY)
--   number_format  1.234,56 · 1,234.56        (por defecto 1.234,56)
--   time_format    24h · 12h                  (por defecto 24h)
-- Cada valor es tal cual se mostrará. language sigue siendo el idioma de los textos.
-- Cada usuario puede cambiar los suyos (como el resto de sus ajustes).
-- ============================================================

begin;

alter table public.user_settings
  add column date_format   text not null default 'DD/MM/YYYY'
    check (date_format in ('DD/MM/YYYY', 'MM/DD/YYYY')),
  add column number_format text not null default '1.234,56'
    check (number_format in ('1.234,56', '1,234.56')),
  add column time_format   text not null default '24h'
    check (time_format in ('24h', '12h'));

-- La función del aviso semanal devolvía locale: se rehace con las columnas nuevas
drop function public.due_weekly_digests(timestamptz, smallint);

alter table public.user_settings drop column locale;

grant update (date_format, number_format, time_format) on public.user_settings to authenticated;


create function public.due_weekly_digests(p_now timestamptz default now(), p_member smallint default null)
returns table (
  user_id      uuid,
  member_id    smallint,
  email        text,
  name         text,
  full_name    text,
  language     text,
  date_format   text,
  number_format text,
  time_format   text,
  timezone     text,
  week_start   date,
  week_end     date,
  attending    jsonb,
  accompanying jsonb
)
language sql stable security definer set search_path = ''
as $$
  with people as (
    select u.user_id, u.member_id, a.email::text as email, m.name, m.full_name,
           s.language, s.date_format, s.number_format, s.time_format, s.timezone, s.weekly_digest,
           (p_now at time zone s.timezone) as local_now
      from public.users u
      join public.family_members m on m.member_id = u.member_id
      join public.user_settings s on s.user_id = u.user_id
      join auth.users a on a.id = u.user_id
  ),
  weeks as (
    select p.*,
           case when p_member is null
                then p.local_now::date + 1                                               -- el domingo: la semana que empieza mañana
                else p.local_now::date - (extract(isodow from p.local_now)::int - 1)     -- prueba: la semana de esa fecha
           end as week_start
      from people p
     where (p_member is not null and p.member_id = p_member)
        or (p_member is null and p.weekly_digest
            and extract(isodow from p.local_now) = 7          -- domingo
            and extract(hour from p.local_now) >= 9)           -- desde las 9:00
  ),
  acts as (
    -- Cada actividad con sus asistentes y acompañantes (nombre y color), en el orden de la familia
    select a.activity_id, a.date, a.start_time, a.end_time, a.name, a.description,
           coalesce((select jsonb_agg(jsonb_build_object('member_id', m.member_id, 'name', m.name, 'color', m.color) order by m.member_id)
                       from public.activity_attendees x join public.family_members m on m.member_id = x.member_id
                      where x.activity_id = a.activity_id), '[]') as attendees,
           coalesce((select jsonb_agg(jsonb_build_object('member_id', m.member_id, 'name', m.name, 'color', m.color) order by m.member_id)
                       from public.activity_companions x join public.family_members m on m.member_id = x.member_id
                      where x.activity_id = a.activity_id), '[]') as companions
      from public.activities a
  )
  select w.user_id, w.member_id, w.email, w.name, w.full_name, w.language, w.date_format, w.number_format, w.time_format, w.timezone,
         w.week_start, w.week_start + 6,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'date', t.date, 'start', to_char(t.start_time, 'HH24:MI'), 'end', to_char(t.end_time, 'HH24:MI'),
                     'name', t.name, 'description', t.description, 'attendees', t.attendees, 'companions', t.companions)
                     order by t.date, t.start_time)
                     from acts t
                    where t.date between w.week_start and w.week_start + 6
                      and t.attendees @> jsonb_build_array(jsonb_build_object('member_id', w.member_id))), '[]'),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'date', t.date, 'start', to_char(t.start_time, 'HH24:MI'), 'end', to_char(t.end_time, 'HH24:MI'),
                     'name', t.name, 'description', t.description, 'attendees', t.attendees, 'companions', t.companions)
                     order by t.date, t.start_time)
                     from acts t
                    where t.date between w.week_start and w.week_start + 6
                      and t.companions @> jsonb_build_array(jsonb_build_object('member_id', w.member_id))), '[]')
    from weeks w
   where p_member is not null
      or not exists (select 1 from public.digest_log l
                      where l.user_id = w.user_id and l.week_start = w.week_start
                        and l.status in ('sent', 'skipped'))
   order by w.member_id;
$$;

revoke all on function public.due_weekly_digests(timestamptz, smallint) from public, anon, authenticated;
grant execute on function public.due_weekly_digests(timestamptz, smallint) to service_role;

commit;
