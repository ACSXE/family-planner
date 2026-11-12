-- ============================================================
-- Family Planner · migración 006: avisos del Security Advisor de Supabase
-- ------------------------------------------------------------
-- En el proyecto de Supabase de la familia ya está aplicada: no hace falta
-- ejecutarla allí. Sirve para montar el proyecto desde cero. Se puede volver a ejecutar.
--
--   1. rls_auto_enable(): función de Supabase que activa la seguridad por filas en las
--      tablas nuevas (existe si esa opción está activada en el panel). Se ejecuta sola
--      por dentro; se quita el permiso para llamarla desde fuera por la API.
--   2. pg_net (la usa el cron del aviso semanal): fuera del esquema público, en
--      "extensions", como recomienda Supabase. Sus funciones siguen en net.* y el
--      cron no cambia.
--
-- Avisos que siguen apareciendo y son intencionados:
--   · current_member_id() y save_activity() ejecutables por usuarios con sesión: la
--     primera la usan las reglas de lectura; la segunda es la única forma de guardar
--     actividades y comprueba todas las reglas.
--   · Leaked Password Protection: es un ajuste de Auth (se activa en el panel si el
--     plan lo permite), no se cambia con SQL.
-- ============================================================

-- 1. Nadie puede llamar a rls_auto_enable() desde fuera
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- 2. pg_net en el esquema "extensions"
do $$
begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
              where e.extname = 'pg_net' and n.nspname = 'public') then
    drop extension pg_net;
  end if;
end $$;
create extension if not exists pg_net with schema extensions;
