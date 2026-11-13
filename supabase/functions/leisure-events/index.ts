/*
 * Family Planner · edge function "leisure-events": planes de ocio para un día.
 *
 * La llama la ventana "Ocio y Tiempo Libre" de la pantalla Calendario (js/features/leisure.js).
 * Descarga la agenda de eventos culturales del Ayuntamiento de Madrid (datos abiertos,
 * https://datos.madrid.es/dataset/206974-0-agenda-eventos-culturales-100), se queda con los
 * eventos que se celebran ese día y devuelve solo los datos que muestra la ventana.
 * La agenda se guarda en memoria unas horas para no descargarla en cada petición.
 *
 * Solo responde a usuarios con sesión iniciada (comprueba el token con Supabase Auth).
 * No necesita secretos: SUPABASE_URL y SUPABASE_ANON_KEY los pone Supabase automáticamente.
 * Opcional: AGENDA_URL para usar otra dirección de la agenda (mismo formato).
 *
 * Petición:  POST { "date": "2026-11-21" }
 * Respuesta: { "date": "2026-11-21", "events": [Plan, …] }   ordenados por hora (los de "todo el día" al final)
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const AGENDA_URL = Deno.env.get('AGENDA_URL') ?? 'https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json';
const CACHE_MS = 3 * 60 * 60 * 1000;   // 3 horas

export type Plan = {
  id: string;
  title: string;
  kind: string;          // familia de la imagen: teatro, musica, taller, exposicion, cine, aire, letras, otros
  type: string;          // tipo legible: "Cuentacuentos, títeres y marionetas"
  audience: string;      // "Infantil · Familias" ('' si no lo indica)
  family: boolean;       // dirigido a niños o familias
  description: string;
  time: string;          // 'HH:MM' ('' si no tiene hora: horario en la web)
  until: string;         // 'YYYY-MM-DD' si dura varios días ('' si es de un día)
  place: string;
  address: string;
  price: string;
  accessibility: string; // "Accesible · Bucle magnético" ('' si no hay datos)
  url: string;
};

// ---------- Tipos de evento ----------
const KINDS: Record<string, string[]> = {
  teatro: ['TeatroPerformance', 'CuentacuentosTiteresMarionetas', 'CircoMagia', 'ComediaMonologo', 'DanzaBaile', 'Flamenco', 'Zarzuela', 'Opera'],
  musica: ['Musica', 'JazzSoulFunkySwingReagge', 'ClasicaEspanola', 'LatinaEspanola', 'CoroGospel', 'FolcloreEtnica', 'Conciertos'],
  taller: ['CursosTalleres', 'ActividadesEscolares', 'CapacitacionDigital', 'Idiomas', 'Campamentos', 'ConcursosCertamenes'],
  exposicion: ['Exposiciones', 'Arte', 'Historia'],
  cine: ['CineActividadesAudiovisuales', 'CineFiccion', 'Peliculas'],
  aire: ['ExcursionesItinerariosVisitas', 'ItinerariosOtrasActividadesAmbientales', 'ActividadesDeportivas', 'ActividadesCalleArteUrbano'],
  letras: ['ConferenciasColoquios', 'RecitalesPresentacionesActosLiterarios', 'ClubesLectura', 'Literatura']
};
const KIND_OF = Object.fromEntries(Object.entries(KINDS).flatMap(([k, list]) => list.map((t) => [t, k])));

const TYPE_LABELS: Record<string, string> = {
  ActividadesCalleArteUrbano: 'Actividades en la calle y arte urbano',
  ActividadesDeportivas: 'Actividades deportivas',
  ActividadesEscolares: 'Actividades escolares',
  CapacitacionDigital: 'Capacitación digital',
  CineActividadesAudiovisuales: 'Cine y audiovisuales',
  CineFiccion: 'Cine',
  CircoMagia: 'Circo y magia',
  ClasicaEspanola: 'Música clásica',
  ClubesLectura: 'Club de lectura',
  ComediaMonologo: 'Comedia y monólogos',
  ComemoracionesHomenajes: 'Conmemoraciones y homenajes',
  ConcursosCertamenes: 'Concursos y certámenes',
  ConferenciasColoquios: 'Conferencias y coloquios',
  CoroGospel: 'Coro y gospel',
  CuentacuentosTiteresMarionetas: 'Cuentacuentos, títeres y marionetas',
  CursosTalleres: 'Cursos y talleres',
  DanzaBaile: 'Danza y baile',
  EnLinea: 'En línea',
  ExcursionesItinerariosVisitas: 'Excursiones, itinerarios y visitas',
  FiestasNavidadesReyes: 'Navidad y Reyes',
  FolcloreEtnica: 'Folclore y música étnica',
  ItinerariosOtrasActividadesAmbientales: 'Itinerarios y actividades ambientales',
  JazzSoulFunkySwingReagge: 'Jazz, soul, funky, swing y reggae',
  LatinaEspanola: 'Música latina y española',
  Musica: 'Música',
  ProgramacionDestacadaAgendaCultura: 'Programación destacada',
  RecitalesPresentacionesActosLiterarios: 'Recitales y actos literarios',
  TeatroPerformance: 'Teatro y performance',
  '1ciudad21distritos': '21 Distritos'
};
// "ExposicionesTemporales" → "Exposiciones temporales"
const splitWords = (t: string) => t.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2').toLowerCase().replace(/^./, (c) => c.toUpperCase());

const AUDIENCES: Record<string, string> = {
  'Niños': 'Infantil', Familias: 'Familias', Jovenes: 'Jóvenes', Mayores: 'Mayores', 'PoblaciónGeneral': 'Todos los públicos',
  Mujeres: 'Mujeres', Discapacitados: 'Personas con discapacidad', EstudianteseInvestigadores: 'Estudiantes e investigadores'
};

const ACCESSIBILITY: Record<string, string> = {
  '0': 'No accesible', '1': 'Accesible', '2': 'Parcialmente accesible',
  '4': 'Lengua de signos', '5': 'Señalización podotáctil', '6': 'Bucle magnético'
};

// ---------- Utilidades ----------
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const dayOf = (s: unknown) => String(s ?? '').slice(0, 10);   // '2026-11-21 18:00:00.0' → '2026-11-21'

// "CALLE PRINCIPE 25" → "Calle Principe 25"
const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'a']);
const titleCase = (s: string) => clean(s).toLowerCase()
  .replace(/\p{L}+/gu, (w, i) => (i > 0 && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)));

// Días excluidos ("24/12/2026;25/12/2026;…"; ignora los trozos mal escritos)
const excludedDays = (s: unknown) => new Set([...String(s ?? '').matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)]
  .map(([, d, m, y]) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`));

// ¿Se celebra el evento ese día?
// deno-lint-ignore no-explicit-any
export function happensOn(e: any, date: string) {
  const from = dayOf(e.dtstart), to = dayOf(e.dtend) || from;
  if (!from || date < from || date > to) return false;
  if (excludedDays(e['excluded-days']).has(date)) return false;
  const days = e.recurrence?.days;
  if (days) {
    const [y, m, d] = date.split('-').map(Number);
    return String(days).split(',').map((x) => x.trim()).includes(WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]);
  }
  return true;
}

// deno-lint-ignore no-explicit-any
export function toPlan(e: any): Plan {
  const typeKey = String(e['@type'] ?? '').split('/').pop() || '';
  const audiences = String(e.audience ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  const area = e.address?.area ?? {};
  const street = area['street-address'] ? titleCase(area['street-address']) : '';
  const city = area.locality ? titleCase(area.locality) : '';
  const access = String(e.organization?.accesibility ?? '').split(',').map((a) => ACCESSIBILITY[a.trim()]).filter(Boolean);
  const url = /^https?:\/\/(www\.)?madrid\.es\//.test(e.link ?? '') ? String(e.link).replace(/^http:/, 'https:') : '';
  const start = dayOf(e.dtstart), end = dayOf(e.dtend);
  return {
    id: String(e.id ?? e.uid ?? ''),
    title: clean(e.title),
    kind: KIND_OF[typeKey] ?? 'otros',
    type: TYPE_LABELS[typeKey] ?? (typeKey ? splitWords(typeKey) : 'Actividad cultural'),
    audience: audiences.map((a) => AUDIENCES[a] ?? a).join(' · '),
    family: audiences.some((a) => a === 'Niños' || a === 'Familias'),
    description: clean(e.description),
    time: /^\d{1,2}:\d{2}$/.test(clean(e.time)) ? clean(e.time).padStart(5, '0') : '',
    until: end && end !== start ? end : '',
    place: clean(e['event-location'] || e.organization?.['organization-name']),
    address: [street, [area['postal-code'], city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    price: e.free === 1 || e.free === '1' ? 'Gratuito' : clean(e.price) || 'Consultar en la web',
    accessibility: access.join(' · '),
    url
  };
}

export function plansFor(events: unknown[], date: string): Plan[] {
  return events.filter((e) => happensOn(e, date)).map(toPlan)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title, 'es'));
}

// ---------- Agenda de Madrid (en memoria unas horas) ----------
let cache: { at: number; events: unknown[] } | null = null;

async function agenda(): Promise<unknown[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.events;
  try {
    const res = await fetch(AGENDA_URL, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Agenda ${res.status}`);
    // Algunas descripciones traen caracteres de control que JSON no admite
    const text = (await res.text()).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');
    const events = JSON.parse(text)['@graph'];
    if (!Array.isArray(events)) throw new Error('Agenda sin @graph');
    cache = { at: Date.now(), events };
    return events;
  } catch (err) {
    if (cache) return cache.events;   // mejor la copia anterior que nada
    throw err;
  }
}

// ---------- Petición ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// El token tiene que ser de un usuario con sesión (la clave pública "anon" no vale)
async function signedIn(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } });
  if (!res.ok) return false;
  const user = await res.json().catch(() => null);
  return Boolean(user?.id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);
  if (!(await signedIn(req))) return json({ error: 'No autorizado' }, 401);

  const body = await req.json().catch(() => ({}));
  const date = String(body.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return json({ error: 'Fecha no válida' }, 400);

  try {
    return json({ date, events: plansFor(await agenda(), date) });
  } catch (err) {
    console.error(err);
    return json({ error: 'No se ha podido consultar la agenda de Madrid' }, 502);
  }
});
