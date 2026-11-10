-- ============================================================
-- Family Planner · migración 003: aviso semanal por correo
-- ------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → Run,
-- después de 002_family_members.sql. No cambia ningún dato existente.
--
-- Crea:
--   · digest_log: un registro por usuario y semana (enviado, sin actividades o error),
--     para no enviar dos veces el mismo aviso.
--   · due_weekly_digests(): los avisos que tocan ahora, con sus actividades.
--     La usa la edge function weekly-digest (supabase/functions/weekly-digest).
--
-- Cuándo toca un aviso: el domingo, a partir de las 9:00 en la zona horaria del
-- usuario (user_settings.timezone), si tiene weekly_digest activado y todavía no
-- se le ha enviado el de esa semana. El aviso es de la semana siguiente (de lunes a
-- domingo), para que haya tiempo de organizarse.
-- Solo lo usa la edge function (rol service_role): los usuarios no tienen acceso.
-- ============================================================

begin;

create table public.digest_log (
  user_id    uuid not null references public.users (user_id) on delete cascade,
  week_start date not null,                                   -- lunes de la semana del aviso
  status     text not null check (status in ('sent', 'skipped', 'error')),
  resend_id  text,                                            -- identificador del correo en Resend
  error      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.digest_log enable row level security;   -- sin reglas: nadie desde la app
revoke all on public.digest_log from anon, authenticated;
grant select, insert, update on public.digest_log to service_role;


-- Avisos pendientes en este momento (p_now), o el de un miembro concreto para probar
-- (p_member: se envía aunque no sea domingo ni tenga el aviso activado; es el de la
-- semana, de lunes a domingo, que contiene la fecha p_now).
-- Devuelve, por usuario: destinatario, semana y dos listas de actividades:
--   attending:    en las que figura como asistente
--   accompanying: en las que figura como acompañante
create function public.due_weekly_digests(p_now timestamptz default now(), p_member smallint default null)
returns table (
  user_id      uuid,
  member_id    smallint,
  email        text,
  name         text,
  full_name    text,
  language     text,
  locale       text,
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
           s.language, s.locale, s.timezone, s.weekly_digest,
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
  select w.user_id, w.member_id, w.email, w.name, w.full_name, w.language, w.locale, w.timezone,
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
