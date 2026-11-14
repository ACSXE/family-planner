/*
 * Family Planner · edge function "leisure-events": guarda la agenda de ocio en la base de datos.
 *
 * La llama el cron cada madrugada (supabase/cron/leisure_refresh_cron.sql), no la aplicación.
 * Descarga la agenda de eventos culturales del Ayuntamiento de Madrid (datos abiertos,
 * https://datos.madrid.es/dataset/206974-0-agenda-eventos-culturales-100), se queda con los
 * eventos de un solo día (los de varios días, como exposiciones o ciclos, se descartan: no se
 * agendan como actividad), prepara los planes de cada día desde hoy con los datos que muestra la
 * ventana "Ocio y Tiempo Libre" y los guarda en la tabla leisure_days (migración 008) de una vez.
 * Si Madrid no responde (tras los reintentos), la tabla no se toca: sigue la agenda anterior.
 * La ventana lee la tabla con leisure_day() (js/features/leisure.js).
 *
 * Solo responde con la cabecera x-cron-secret (el mismo CRON_SECRET que el aviso semanal).
 * Se despliega con "Verify JWT" desactivado (la protege x-cron-secret).
 * Secretos: CRON_SECRET (ya existe). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
 * Opcional: AGENDA_URL para usar otra dirección de la agenda (mismo formato).
 *
 * Petición:  POST {}                          descarga y guarda
 *            POST { "dry_run": true }         descarga y cuenta, sin guardar (para probar)
 *            POST { "from": "2026-11-21" }    guarda desde ese día en vez de desde hoy (pruebas)
 * Respuesta: { "days": 64, "plans": 931, "from": "2026-11-15", "until": "2027-02-17", "saved": true }
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const AGENDA_URL = Deno.env.get('AGENDA_URL') ?? 'https://datos.madrid.es/egob/catalogo/206974-0-agenda-eventos-culturales-100.json';

export type Plan = {
  id: string;
  title: string;
  kind: string;          // familia de la imagen: teatro, musica, taller, exposicion, cine, aire, letras, otros
  type: string;          // tipo legible: "Cuentacuentos, títeres y marionetas"
  audience: string;      // "Infantil · Familias" ('' si no lo indica)
  kids: boolean;         // dirigido a niños o familias (filtro "Niños"); si no, filtro "Adultos"
  description: string;
  time: string;          // hora de inicio 'HH:MM' ('' si no la indica o es 00:00: por determinar)
  end: string;           // hora de fin 'HH:MM' ('' si no la indica: la agenda casi nunca la trae)
  place: string;
  address: string;
  price: string;
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
  const url = /^https?:\/\/(www\.)?madrid\.es\//.test(e.link ?? '') ? String(e.link).replace(/^http:/, 'https:') : '';
  const start = dayOf(e.dtstart), end = dayOf(e.dtend);
  const time = /^\d{1,2}:\d{2}$/.test(clean(e.time)) ? clean(e.time).padStart(5, '0') : '';
  const endTime = String(e.dtend ?? '').slice(11, 16);   // 23:59 = sin hora de fin
  const kidsAudience = ['Niños', 'Familias'];
  return {
    id: String(e.id ?? e.uid ?? ''),
    title: clean(e.title),
    kind: KIND_OF[typeKey] ?? 'otros',
    type: TYPE_LABELS[typeKey] ?? (typeKey ? splitWords(typeKey) : 'Actividad cultural'),
    audience: audiences.map((a) => AUDIENCES[a] ?? a).join(' · '),
    kids: audiences.some((a) => kidsAudience.includes(a)),
    description: clean(e.description),
    time: time === '00:00' ? '' : time,
    end: time && time !== '00:00' && end === start && /^\d{2}:\d{2}$/.test(endTime) && endTime !== '23:59' && endTime > time ? endTime : '',
    place: clean(e['event-location'] || e.organization?.['organization-name']),
    address: [street, [area['postal-code'], city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    price: e.free === 1 || e.free === '1' ? 'Gratuito' : clean(e.price) || 'Consultar en la web',
    url
  };
}

// Eventos de un solo día (empiezan y acaban el mismo día)
// deno-lint-ignore no-explicit-any
export const oneDay = (e: any) => dayOf(e.dtstart) === (dayOf(e.dtend) || dayOf(e.dtstart));

export function plansFor(events: unknown[], date: string): Plan[] {
  return events.filter((e) => oneDay(e) && happensOn(e, date)).map(toPlan)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title, 'es'));
}

// Planes de cada día con eventos, desde "from" (incluido): { "2026-11-21": [Plan, …], … }
export function daysFrom(events: unknown[], from: string): Record<string, Plan[]> {
  const dates = [...new Set(events.filter(oneDay).map((e) => dayOf((e as { dtstart?: string }).dtstart)))]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from).sort();
  return Object.fromEntries(dates.map((d) => [d, plansFor(events, d)]).filter(([, p]) => p.length));
}

// Hoy en Madrid ('YYYY-MM-DD')
const todayInMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

// ---------- Agenda de Madrid ----------
// Madrid a veces tarda en generar la agenda (unos 2,5 MB). Nadie está esperando, así que hay margen:
// hasta 60 s por intento y un reintento, por debajo del límite de las edge functions (150 s).
// Si aun así falla, el cron vuelve a llamar un par de horas después.
const ATTEMPTS = 2;
const TIMEOUT_MS = 60000;

async function download(): Promise<unknown[]> {
  const res = await fetch(AGENDA_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Agenda ${res.status}`);
  // Algunas descripciones traen caracteres de control que JSON no admite
  const text = (await res.text()).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');
  const events = JSON.parse(text)['@graph'];
  if (!Array.isArray(events)) throw new Error('Agenda sin @graph');
  return events;
}

async function agenda(): Promise<unknown[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await download();
    } catch (err) {
      lastError = err;
      console.warn(`Agenda de Madrid: intento ${attempt} de ${ATTEMPTS} fallido:`, err);
    }
  }
  throw lastError;
}

// ---------- Base de datos (API REST de Supabase con la clave de servicio) ----------
async function replaceDays(days: Record<string, Plan[]>): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/replace_leisure_days`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_days: days })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase replace_leisure_days: ${res.status} ${text}`);
  return Number(JSON.parse(text));
}

// ---------- Petición ----------
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'No autorizado' }, 401);

  const body = await req.json().catch(() => ({}));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(body.from ?? '')) ? String(body.from) : todayInMadrid();

  let events: unknown[];
  try {
    events = await agenda();
  } catch (err) {
    console.error('Agenda de Madrid sin respuesta: la tabla sigue como estaba.', err);
    return json({ error: 'No se ha podido descargar la agenda de Madrid', saved: false }, 502);
  }

  const days = daysFrom(events, from);
  const summary = {
    days: Object.keys(days).length,
    plans: Object.values(days).reduce((n, p) => n + p.length, 0),
    from,
    until: Object.keys(days).at(-1) ?? null
  };
  if (!summary.days) {
    console.error('La agenda de Madrid no trae planes desde', from, ': la tabla sigue como estaba.');
    return json({ ...summary, error: 'La agenda de Madrid llega sin planes', saved: false }, 502);
  }
  if (body.dry_run === true) return json({ ...summary, saved: false, dry_run: true });

  try {
    await replaceDays(days);
  } catch (err) {
    console.error(err);
    return json({ ...summary, error: 'No se ha podido guardar la agenda', saved: false }, 500);
  }
  console.log(`Agenda de ocio guardada: ${summary.days} días, ${summary.plans} planes (${summary.from} a ${summary.until}).`);
  return json({ ...summary, saved: true });
});
