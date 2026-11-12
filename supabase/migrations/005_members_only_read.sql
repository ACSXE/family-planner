-- ============================================================
-- Family Planner · migración 005: solo los usuarios de la aplicación pueden leer
-- ------------------------------------------------------------
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → Run,
-- después de 004_user_formats.sql. No cambia ningún dato.
--
-- Hasta ahora, para leer miembros y actividades bastaba con tener sesión
-- (cualquier cuenta de Supabase Auth). Desde aquí hace falta, además, estar dado
-- de alta en la tabla users: una cuenta de Auth sin fila en users no ve nada.
-- Para Alberto y Laura no cambia nada.
-- ============================================================

begin;

drop policy "Miembros visibles con sesión" on public.family_members;
create policy "Miembros visibles para los usuarios" on public.family_members
  for select to authenticated using ((select public.current_member_id()) is not null);

drop policy "Todos ven todas las actividades" on public.activities;
create policy "Los usuarios ven todas las actividades" on public.activities
  for select to authenticated using ((select public.current_member_id()) is not null);

drop policy "Asistentes visibles con sesión" on public.activity_attendees;
create policy "Asistentes visibles para los usuarios" on public.activity_attendees
  for select to authenticated using ((select public.current_member_id()) is not null);

drop policy "Acompañantes visibles con sesión" on public.activity_companions;
create policy "Acompañantes visibles para los usuarios" on public.activity_companions
  for select to authenticated using ((select public.current_member_id()) is not null);

commit;
