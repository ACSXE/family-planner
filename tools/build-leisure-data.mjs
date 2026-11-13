// Genera data/leisure-events.json (planes de ocio por día) a partir de una descarga de la agenda de Madrid,
// con la misma lógica que la edge function leisure-events. Lo usa la ventana "Ocio y Tiempo Libre" cuando
// FP_CONFIG.leisure.source es 'local' (sin Supabase).
//
//   1. Descarga https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json
//   2. node --experimental-strip-types tools/build-leisure-data.mjs <agenda.json> [salida] [fecha de la descarga AAAA-MM-DD]
import fs from 'node:fs';
const [input, output = new URL('../data/leisure-events.json', import.meta.url).pathname, downloaded = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!input) { console.error('Uso: node --experimental-strip-types tools/build-leisure-data.mjs <agenda.json> [salida] [AAAA-MM-DD]'); process.exit(2); }
globalThis.Deno = { env: { get: () => undefined }, serve: () => {} };
const { plansFor, oneDay } = await import(new URL('../supabase/functions/leisure-events/index.ts', import.meta.url).href);
const events = JSON.parse(fs.readFileSync(input, 'utf8').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' '))['@graph'];
const days = [...new Set(events.filter(oneDay).map((e) => String(e.dtstart).slice(0, 10)))].filter((d) => d >= downloaded).sort();
const dates = Object.fromEntries(days.map((d) => [d, plansFor(events, d)]).filter(([, p]) => p.length));
fs.writeFileSync(output, JSON.stringify({ downloaded, dates }));
const total = Object.values(dates).reduce((n, p) => n + p.length, 0);
console.log(`${output}: ${total} planes en ${Object.keys(dates).length} días (${days[0]} a ${days.at(-1)}), ${(fs.statSync(output).size / 1024).toFixed(0)} KB`);
