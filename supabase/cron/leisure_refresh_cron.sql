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
-- Cuándo: a las 3:15 y a las 5:15, hora de Madrid, todo el año.
--   · pg_cron va en hora UTC y España cambia de hora, así que la tarea se despierta cada hora a
--     y 15 entre la 1:15 y las 4:15 UTC y solo actúa cuando en Madrid son las 3:15 o las 5:15
--     (invierno: 2:15 y 4:15 UTC; verano: 1:15 y 3:15 UTC). Las demás veces no hace nada.
--   · La de las 5:15 es el reintento: solo llama a la función si la agenda no se ha actualizado
--     ya ese día (si la de las 3:15 fue bien, no vuelve a descargar nada de Madrid).
-- ============================================================

-- Extensiones necesarias (ya activas por el aviso semanal)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Programación (si ya existía, se sustituye)
select cron.schedule(
  'leisure-refresh',
  '15 1-4 * * *',
  $$
  select net.http_post(
    url     := 'https://hdzeibaonokdcicqmuzw.supabase.co/functions/v1/leisure-events',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'weekly_digest_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  -- Solo a las 3 y a las 5 en Madrid…
  where extract(hour from now() at time zone 'Europe/Madrid') in (3, 5)
    -- …y si la agenda no se ha actualizado ya hoy (fecha de Madrid)
    and not exists (
      select 1 from public.leisure_days
      where (updated_at at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date
    );
  $$
);

-- Para comprobar: select jobname, schedule from cron.job;                   (las tareas programadas)
--                 select * from cron.job_run_details order by start_time desc limit 10;
--                 select count(*) as dias, max(date) as hasta, max(updated_at) as actualizada from public.leisure_days;
-- Actualizar a mano (sin esperar al cron): panel Test de la función, cabecera x-cron-secret, body {}.
-- Para pararlo:   select cron.unschedule('leisure-refresh');
