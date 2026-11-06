# Librerías de terceros

| Fichero | Librería | Versión | Licencia | Origen |
|---|---|---|---|---|
| `supabase-js-2.118.0.js` | `@supabase/supabase-js` | 2.118.0 | MIT (`LICENSE-supabase-js`) | `dist/umd/supabase.js` del paquete de npm |

Se incluye en el repositorio para que la aplicación no dependa de un servidor externo
para cargarla y para fijar la versión. Para actualizarla, descargar la nueva versión
(`npm pack @supabase/supabase-js@<versión>`), copiar su `dist/umd/supabase.js` aquí
con el nuevo nombre y cambiar la ruta en `login.html` e `index.html`.
