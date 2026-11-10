-- ============================================================
-- Family Planner · cron del aviso semanal
-- ------------------------------------------------------------
-- Ejecutar en Supabase → SQL Editor DESPUÉS de:
--   1. supabase/migrations/003_weekly_digest.sql
--   2. desplegar la edge function weekly-digest (con "Verify JWT" desactivado)
--   3. crear sus secretos RESEND_API_KEY y CRON_SECRET
--
-- Llama a la función cada hora, a y 5, los sábados y domingos (hora UTC). Así cubre
-- el domingo a las 9:00 de cualquier zona horaria; la función solo envía los avisos que
-- tocan y no repite ninguno, así que el resto de llamadas terminan sin hacer nada.
-- ============================================================

-- Extensiones necesarias (también se pueden activar en Database → Extensions)
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- La contraseña del cron se guarda en el Vault de Supabase, no en este fichero.
-- Ejecuta UNA vez esta línea cambiando el texto por el mismo valor que pusiste
-- en el secreto CRON_SECRET de la edge function:
--   select vault.create_secret('PEGA_AQUI_EL_MISMO_VALOR_QUE_CRON_SECRET', 'weekly_digest_cron_secret');

-- Programación (si ya existía, se sustituye)
select cron.schedule(
  'weekly-digest',
  '5 * * * 6,0',
  $$
  select net.http_post(
    url     := 'https://hdzeibaonokdcicqmuzw.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'weekly_digest_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Para comprobar: select * from cron.job;            (la tarea programada)
--                 select * from cron.job_run_details order by start_time desc limit 10;
--                 select * from public.digest_log order by updated_at desc;   (los avisos enviados)
-- Para pararlo:   select cron.unschedule('weekly-digest');
