-- ============================================================
-- Family Planner · cron de la agenda de ocio (Ocio y Tiempo Libre)
-- ------------------------------------------------------------
-- Ejecutar en Supabase → SQL Editor DESPUÉS de:
--   1. supabase/migrations/008_leisure_days.sql
--   2. desplegar la edge function leisure-events (con "Verify JWT" desactivado)
-- Usa la misma contraseña que el aviso semanal (secreto CRON_SECRET de las edge functions y
-- weekly_digest_cron_secret del Vault), que ya existen: no hay que crear nada más.
--
-- Llama a la función cada día a las 3:17 y a las 5:17 (hora UTC; 4:17 y 6:17 en Madrid en
-- invierno). La segunda llamada es el reintento por si Madrid no respondió en la primera; si
-- la primera fue bien, simplemente vuelve a guardar la misma agenda.
-- ============================================================

-- Extensiones necesarias (ya activas por el aviso semanal)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Programación (si ya existía, se sustituye)
select cron.schedule(
  'leisure-refresh',
  '17 3,5 * * *',
  $$
  select net.http_post(
    url     := 'https://hdzeibaonokdcicqmuzw.supabase.co/functions/v1/leisure-events',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'weekly_digest_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- Para comprobar: select * from cron.job;            (las tareas programadas)
--                 select * from cron.job_run_details order by start_time desc limit 10;
--                 select count(*) as dias, max(date) as hasta, max(updated_at) as actualizada from public.leisure_days;
-- Para pararlo:   select cron.unschedule('leisure-refresh');
