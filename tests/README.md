# Pruebas automáticas

```bash
bash tests/run.sh
```

Crea un PostgreSQL temporal, aplica las migraciones de `supabase/migrations/`, sirve la web en local y ejecuta todas las pruebas. Al terminar borra lo temporal. Muestra cuántas comprobaciones pasan en cada bloque y sale con código 1 si alguna falla.

| Carpeta | Qué prueba |
|---|---|
| `db/` | Reglas de acceso (RLS), usuarios y ajustes, formatos, lectura solo para usuarios de la aplicación y el aviso semanal (`due_weekly_digests`) |
| `function/` | Las edge functions: `weekly-digest` con Resend simulado (correo, envío, registro, reintentos y no repetir) y `leisure-events` con una muestra real de la agenda de Madrid (acceso, eventos del día, días excluidos, enlaces, copia guardada) |
| `app/` | La aplicación en Chromium: recorrido completo, calendario, arranque y pantalla de carga, cierre por inactividad, la CSP y la ventana Ocio y Tiempo Libre |

No se conecta a Supabase ni envía correos:
- `db/supabase_stub.sql` imita lo mínimo de Supabase (roles, `auth.users`, `auth.uid()`).
- `app/fake-supabase.js` responde a las llamadas de la aplicación consultando el PostgreSQL temporal.
- `function/harness.mjs` ejecuta la edge function del aviso semanal en Node con Resend simulado.
- `function/leisure.mjs` ejecuta `leisure-events` en Node con la agenda de `function/fixtures/agenda-madrid.json` (19 eventos reales de la agenda de noviembre de 2026).

Las cuentas de prueba son `alberto@example.com` y `laura@example.com`.

## Requisitos

- PostgreSQL 15 o superior (`initdb`, `pg_ctl` y `psql`).
- Node 22 o superior.
- Python 3, para servir la web.
- Playwright con Chromium:
  ```bash
  npm install --prefix tests
  ```
  ```bash
  npx --prefix tests playwright install chromium
  ```

En Windows, ejecútalo desde WSL.
