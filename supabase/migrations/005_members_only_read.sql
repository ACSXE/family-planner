-- ============================================================
-- Family Planner · migración 005: solo los usuarios de la aplicación pueden leer
-- ------------------------------------------------------------
-- Ejecutar en Supabase → SQL Editor → New query → Run, después de
-- 004_user_formats.sql. No cambia ningún dato. Se puede volver a ejecutar.
--
-- Hasta ahora, para leer miembros y actividades bastaba con tener sesión
-- (cualquier cuenta de Supabase Auth). Desde aquí hace falta, además, estar dado
-- de alta en la tabla users: una cuenta de Auth sin fila en users no ve nada.
-- Para Alberto y Laura no cambia nada.
--
-- En el proyecto de Supabase de la familia estas reglas ya están aplicadas, con estos
-- mismos nombres: no hace falta ejecutarlo allí. Sirve para montar el proyecto desde cero.
-- ============================================================

begin;

-- Se quitan las reglas de lectura actuales de estas cuatro tablas, se llamen como se llamen
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname = 'public' and cmd = 'SELECT'
       and tablename in ('family_members', 'activities', 'activity_attendees', 'activity_companions')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Y se crean las nuevas: solo lee quien es usuario de la aplicación
create policy "Miembros ven miembros" on public.family_members
  for select to authenticated using ((select public.current_member_id()) is not null);

create policy "Miembros ven actividades" on public.activities
  for select to authenticated using ((select public.current_member_id()) is not null);

create policy "Miembros ven asistentes" on public.activity_attendees
  for select to authenticated using ((select public.current_member_id()) is not null);

create policy "Miembros ven acompañantes" on public.activity_companions
  for select to authenticated using ((select public.current_member_id()) is not null);

commit;
