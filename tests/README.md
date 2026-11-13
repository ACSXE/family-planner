# Pruebas automáticas

```bash
bash tests/run.sh
```

Crea un PostgreSQL temporal, aplica las migraciones de `supabase/migrations/`, sirve la web en local y ejecuta todas las pruebas. Al terminar borra lo temporal. Muestra cuántas comprobaciones pasan en cada bloque y sale con código 1 si alguna falla.

| Carpeta | Qué prueba |
|---|---|
| `db/` | Reglas de acceso (RLS), usuarios y ajustes, formatos, lectura solo para usuarios de la aplicación y el aviso semanal (`due_weekly_digests`) |
| `function/` | La edge function `weekly-digest` con Resend simulado: correo, envío, registro, reintentos y no repetir |
| `app/` | La aplicación en Chromium: recorrido completo, calendario, arranque y pantalla de carga, cierre por inactividad y la CSP |

No se conecta a Supabase ni envía correos:
- `db/supabase_stub.sql` imita lo mínimo de Supabase (roles, `auth.users`, `auth.uid()`).
- `app/fake-supabase.js` responde a las llamadas de la aplicación consultando el PostgreSQL temporal.
- `function/harness.mjs` ejecuta la edge function en Node con Resend simulado.

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
