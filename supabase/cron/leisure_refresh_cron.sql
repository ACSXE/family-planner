-- ============================================================
-- Family Planner · cron de la agenda de ocio (Ocio y Tiempo Libre)
-- ------------------------------------------------------------
-- Ejecutar en Supabase → SQL Editor DESPUÉS de:
--   1. supabase/migrations/008_leisure_days.sql
--   2. desplegar la edge function leisure-events (con "Verify JWT" desactivado)
-- Usa la misma contraseña que el aviso semanal (secreto CRON_SECRET de las edge functions y
-- weekly_digest_cron_secret del Vault), que ya existen: no hay que crear nada más.
-- Si ya estaba programado, al ejecutarlo de nuevo se sustituye la programación anterior.
--
-- Cuándo: cada día a las 3:00 y a las 5:00 UTC (4:00 y 6:00 en Madrid en invierno, 5:00 y 7:00 en verano).
-- La de las 5:00 es el reintento: solo llama a la función si la agenda no se ha actualizado ya
-- ese día (si la de las 3:00 fue bien, no vuelve a descargar nada de Madrid).
-- ============================================================

-- Extensiones necesarias (ya activas por el aviso semanal)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Programación (si ya existía, se sustituye)
select cron.schedule(
  'leisure-refresh',
  '0 3,5 * * *',
  $$
  select net.http_post(
    url     := 'https://hdzeibaonokdcicqmuzw.supabase.co/functions/v1/leisure-events',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'weekly_digest_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  -- Solo si la agenda no se ha actualizado ya hoy
  where not exists (
    select 1 from public.leisure_days
    where (updated_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date
  );
  $$
);

-- Para comprobar: select jobname, schedule from cron.job;                   (las tareas programadas)
--                 select * from cron.job_run_details order by start_time desc limit 10;
--                 select count(*) as dias, max(date) as hasta, max(updated_at) as actualizada from public.leisure_days;
-- Actualizar a mano (sin esperar al cron): panel Test de la función, cabecera x-cron-secret, body {}.
-- Para pararlo:   select cron.unschedule('leisure-refresh');
