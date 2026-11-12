-- ============================================================
-- Family Planner · migración 002: miembros de la familia con clave numérica
-- ------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → Run,
-- después de 001_initial_schema.sql. Conserva todas las actividades.
-- Todo va en una transacción: si algo falla, no se cambia nada.
--
-- Modelo resultante (member_id es la clave común):
--   family_members      member_id ─┬─ users.member_id
--                                  │      users.user_id ── user_settings.user_id
--                                  ├─ activities.created_by
--                                  ├─ activity_attendees.member_id   (asistentes)
--                                  └─ activity_companions.member_id  (acompañantes)
--   activities          activity_id ─┬─ activity_attendees.activity_id
--                                    └─ activity_companions.activity_id
--   family_members: todas las personas de la familia.
--   users: los miembros que son usuarios de la aplicación (Sergio y Pablo no lo son).
--     users.user_id → auth.users.id es el único enlace con las cuentas de Supabase.
--   user_settings: parámetros de cada usuario de la aplicación (clave user_id).
--     Sustituye a la tabla profiles.
--
-- Reglas de acceso:
--   · Con sesión se ven los miembros y todas las actividades.
--   · Las actividades se crean y modifican solo con save_activity(), que valida
--     todas las reglas y solo deja modificar a quien la creó.
--   · Solo quien creó una actividad puede eliminarla.
--   · Cada usuario ve únicamente su fila de users, y ve y modifica
--     únicamente sus propios ajustes (user_settings).
-- ============================================================

begin;

-- ---------- 1. Copia de los datos actuales ----------
create temp table tmp_member_codes (code text primary key, member_id smallint not null) on commit drop;
insert into tmp_member_codes values ('alberto', 1), ('laura', 2), ('sergio', 3), ('pablo', 4);

-- Antes de ejecutarlo, sustituye CORREO_DE_ALBERTO y CORREO_DE_LAURA por el correo
-- de cada cuenta (no se guardan en el repositorio, que es público).
create temp table tmp_profiles on commit drop as
select p.id as user_id,
       p.full_name,
       case u.email
         when 'CORREO_DE_ALBERTO' then 1
         when 'CORREO_DE_LAURA'   then 2
       end::smallint as member_id
from public.profiles p
join auth.users u on u.id = p.id;

create temp table tmp_activities on commit drop as
select * from public.activities;

-- Comprobaciones antes de borrar nada
do $$
begin
  if exists (select 1 from tmp_profiles where member_id is null) then
    raise exception 'Hay perfiles cuyo correo no corresponde a ningún miembro de la familia';
  end if;
  if exists (select 1 from tmp_activities a where not exists (select 1 from tmp_profiles p where p.user_id = a.created_by)) then
    raise exception 'Hay actividades creadas por un usuario sin perfil';
  end if;
  if exists (select 1 from tmp_activities a, unnest(a.attendees) x(code)
             where not exists (select 1 from tmp_member_codes c where c.code = x.code)) then
    raise exception 'Hay actividades con un asistente desconocido';
  end if;
  if exists (select 1 from tmp_activities a, unnest(string_to_array(nullif(a.companion, ''), ',')) x(code)
             where not exists (select 1 from tmp_member_codes c where c.code = x.code)) then
    raise exception 'Hay actividades con un acompañante desconocido';
  end if;
end $$;

-- ---------- 2. Se quitan las tablas antiguas ----------
drop table public.activities;
drop table public.profiles;   -- pasa a users (cuenta) y family_members (nombre completo)
drop function if exists public.activities_touch_updated_at();


-- ---------- 3. Miembros de la familia ----------
create table public.family_members (
  member_id       smallint primary key check (member_id > 0),
  name            text not null unique check (char_length(name) between 1 and 40),   -- nombre corto ("Laura")
  full_name       text not null check (char_length(full_name) between 1 and 80),     -- nombre completo ("Laura Liz")
  color           text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- puede aparecer como acompañante
  can_accompany   boolean not null default false,
  -- si asiste, la actividad necesita al menos un acompañante
  needs_companion boolean not null default false,
  constraint family_members_one_role check (not (can_accompany and needs_companion))
);

insert into public.family_members (member_id, name, full_name, color, can_accompany, needs_companion) values
  (1, 'Alberto', 'Alberto Carrasco',     '#4fb3e8', true,  false),   -- azul cielo
  (2, 'Laura',   'Laura Liz',            '#86d19a', true,  false),   -- verde clarito
  (3, 'Sergio',  'Sergio Carrasco Liz',  '#dc2626', false, true),    -- rojo
  (4, 'Pablo',   'Pablo Carrasco',       '#eab308', false, true);    -- amarillo


-- ---------- 4. Usuarios de la aplicación ----------
-- Los miembros que pueden entrar en la aplicación. Si se borra la cuenta en Supabase,
-- se borran su fila de users y sus ajustes; el miembro y sus actividades se conservan.
create table public.users (
  member_id smallint primary key references public.family_members (member_id),
  user_id   uuid not null unique references auth.users (id) on delete cascade
);

insert into public.users (member_id, user_id)
select member_id, user_id from tmp_profiles;

-- member_id del usuario con sesión (null si no es usuario de la aplicación)
create function public.current_member_id()
returns smallint
language sql stable security definer set search_path = ''
as $$
  select member_id from public.users where user_id = auth.uid()
$$;


-- ---------- 5. Ajustes de cada usuario ----------
create table public.user_settings (
  user_id       uuid primary key references public.users (user_id) on delete cascade,
  weekly_digest boolean not null default true,              -- aviso semanal por correo
  language      text not null default 'es' check (language ~ '^[a-z]{2}$'),            -- idioma (ISO 639-1)
  locale        text not null default 'es-ES' check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),  -- formato de fechas y números
  timezone      text not null default 'Europe/Madrid',      -- zona horaria (IANA)
  updated_at    timestamptz not null default now()
);

-- Valida la zona horaria y actualiza updated_at
create function public.user_settings_before_write()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Zona horaria no válida: %', new.timezone;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_settings_before_write
  before insert or update on public.user_settings
  for each row execute function public.user_settings_before_write();

-- Cada usuario nuevo recibe sus ajustes por defecto
create function public.users_create_settings()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.user_id) on conflict do nothing;
  return new;
end;
$$;

create trigger users_create_settings
  after insert on public.users
  for each row execute function public.users_create_settings();

insert into public.user_settings (user_id)
select user_id from public.users on conflict do nothing;


-- ---------- 6. Actividades ----------
create table public.activities (
  activity_id uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  date        date not null,
  start_time  time not null,
  end_time    time not null,
  created_by  smallint not null default public.current_member_id()
              references public.family_members (member_id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint activities_end_after_start check (end_time > start_time)
);

create index activities_date_idx on public.activities (date);

create function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger activities_touch_updated_at
  before update on public.activities
  for each row execute function public.touch_updated_at();

-- Asistentes y acompañantes: una fila por persona
create table public.activity_attendees (
  activity_id uuid     not null references public.activities (activity_id) on delete cascade,
  member_id   smallint not null references public.family_members (member_id),
  primary key (activity_id, member_id)
);
create index activity_attendees_member_idx on public.activity_attendees (member_id);

create table public.activity_companions (
  activity_id uuid     not null references public.activities (activity_id) on delete cascade,
  member_id   smallint not null references public.family_members (member_id),
  primary key (activity_id, member_id)
);
create index activity_companions_member_idx on public.activity_companions (member_id);

-- Datos: se conserva el identificador de cada actividad y sus fechas de creación y modificación
insert into public.activities (activity_id, name, description, date, start_time, end_time, created_by, created_at, updated_at)
select a.id, a.name, a.description, a.date, a.start_time, a.end_time, p.member_id, a.created_at, a.updated_at
from tmp_activities a
join tmp_profiles p on p.user_id = a.created_by;

insert into public.activity_attendees (activity_id, member_id)
select distinct a.id, c.member_id
from tmp_activities a, unnest(a.attendees) x(code)
join tmp_member_codes c on c.code = x.code;

insert into public.activity_companions (activity_id, member_id)
select distinct a.id, c.member_id
from tmp_activities a, unnest(string_to_array(nullif(a.companion, ''), ',')) x(code)
join tmp_member_codes c on c.code = x.code;

-- Comprobación final: no se ha perdido ninguna actividad
do $$
begin
  if (select count(*) from public.activities) <> (select count(*) from tmp_activities) then
    raise exception 'El número de actividades no coincide tras la migración';
  end if;
end $$;


-- ---------- 7. Guardar una actividad (crear o modificar) ----------
-- Único camino para crear y modificar actividades: valida todas las reglas y
-- guarda la actividad, sus asistentes y sus acompañantes de una vez.
-- p_activity_id null = crear. Devuelve el activity_id.
create function public.save_activity(
  p_activity_id uuid,
  p_name        text,
  p_description text,
  p_date        date,
  p_start_time  time,
  p_end_time    time,
  p_attendees   smallint[],
  p_companions  smallint[]
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
    insert into public.activities (name, description, date, start_time, end_time, created_by)
    values (p_name, coalesce(p_description, ''), p_date, p_start_time, p_end_time, v_member)
    returning activity_id into v_id;
  else
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


-- ---------- 8. Reglas de acceso (Row Level Security) y permisos ----------
alter table public.family_members      enable row level security;
alter table public.users               enable row level security;
alter table public.user_settings       enable row level security;
alter table public.activities          enable row level security;
alter table public.activity_attendees  enable row level security;
alter table public.activity_companions enable row level security;

create policy "Miembros visibles con sesión" on public.family_members
  for select to authenticated using (true);

create policy "Cada uno ve su usuario" on public.users
  for select to authenticated using (user_id = auth.uid());

create policy "Cada uno ve sus ajustes" on public.user_settings
  for select to authenticated using (user_id = auth.uid());
create policy "Cada uno modifica sus ajustes" on public.user_settings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Todos ven todas las actividades" on public.activities
  for select to authenticated using (true);
create policy "Solo quien la creó la elimina" on public.activities
  for delete to authenticated using (created_by = public.current_member_id());

create policy "Asistentes visibles con sesión" on public.activity_attendees
  for select to authenticated using (true);
create policy "Acompañantes visibles con sesión" on public.activity_companions
  for select to authenticated using (true);

-- Sin sesión, nada. Con sesión: leer, eliminar sus actividades, cambiar sus ajustes
-- y crear/modificar actividades solo a través de save_activity().
revoke all on public.family_members, public.users, public.user_settings,
              public.activities, public.activity_attendees, public.activity_companions
  from anon, authenticated;
grant select on public.family_members, public.users, public.activities,
                public.activity_attendees, public.activity_companions
  to authenticated;
grant delete on public.activities to authenticated;
grant select on public.user_settings to authenticated;
grant update (weekly_digest, language, locale, timezone) on public.user_settings to authenticated;

revoke all on function public.current_member_id() from public, anon;
grant execute on function public.current_member_id() to authenticated;
revoke all on function public.save_activity(uuid, text, text, date, time, time, smallint[], smallint[]) from public, anon;
grant execute on function public.save_activity(uuid, text, text, date, time, time, smallint[], smallint[]) to authenticated;
revoke all on function public.users_create_settings() from public, anon, authenticated;
revoke all on function public.user_settings_before_write() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

commit;
