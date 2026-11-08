-- ============================================================
-- Family Planner · esquema de base de datos en Supabase
-- ------------------------------------------------------------
-- Migración 001 (primera versión). Ejecutar en Supabase → SQL Editor → New query → Run.
-- Una vez aplicada 002_family_members.sql, NO volver a ejecutar este fichero.
--
-- Reglas de acceso (Row Level Security):
--   · Cualquier usuario con sesión VE todas las actividades (agenda compartida).
--   · Solo quien creó una actividad puede MODIFICARLA o ELIMINARLA.
--   · Sin sesión no se puede leer ni escribir nada.
-- ============================================================


-- ---------- Perfiles: nombre visible de cada usuario ----------
create table if not exists public.profiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  full_name text not null
);

alter table public.profiles enable row level security;

drop policy if exists "Perfiles visibles con sesión" on public.profiles;
create policy "Perfiles visibles con sesión"
  on public.profiles for select to authenticated
  using (true);

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;


-- ---------- Actividades ----------
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  -- ids de FP_CONFIG.members: 'alberto', 'laura', 'sergio', 'pablo'
  attendees   text[] not null check (cardinality(attendees) > 0),
  -- '' (sin acompañante), 'alberto', 'laura' o 'alberto,laura'
  companion   text not null default '',
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint activities_end_after_start check (end_time > start_time)
);

create index if not exists activities_date_idx on public.activities (date);

alter table public.activities enable row level security;

drop policy if exists "Todos ven todas las actividades" on public.activities;
create policy "Todos ven todas las actividades"
  on public.activities for select to authenticated
  using (true);

drop policy if exists "Cada uno crea actividades a su nombre" on public.activities;
create policy "Cada uno crea actividades a su nombre"
  on public.activities for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Solo quien la creó la modifica" on public.activities;
create policy "Solo quien la creó la modifica"
  on public.activities for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "Solo quien la creó la elimina" on public.activities;
create policy "Solo quien la creó la elimina"
  on public.activities for delete to authenticated
  using (created_by = auth.uid());

revoke all on public.activities from anon;
grant select, insert, update, delete on public.activities to authenticated;

-- updated_at se actualiza solo al modificar una actividad
create or replace function public.activities_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists activities_touch_updated_at on public.activities;
create trigger activities_touch_updated_at
  before update on public.activities
  for each row execute function public.activities_touch_updated_at();


-- ---------- Nombres de los usuarios ----------
-- Ejecutar DESPUÉS de crear los dos usuarios en Authentication → Users.
insert into public.profiles (id, full_name)
select id,
       case email
         when 'alberto_carrasco_sanchez@hotmail.com' then 'Alberto Carrasco'
         when 'laura_clc@hotmail.com'                then 'Laura Liz'
       end
from auth.users
where email in ('alberto_carrasco_sanchez@hotmail.com', 'laura_clc@hotmail.com')
on conflict (id) do update set full_name = excluded.full_name;
