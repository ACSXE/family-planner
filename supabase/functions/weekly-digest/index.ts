/*
 * Family Planner · edge function "weekly-digest": aviso semanal por correo (Resend).
 *
 * La llama cada hora el cron de Supabase (supabase/cron/weekly_digest_cron.sql).
 * En cada llamada pide a la base de datos los avisos que tocan (due_weekly_digests:
 * el domingo desde las 9:00 de cada usuario) y envía a cada uno un correo con las
 * actividades de la semana siguiente (lunes a domingo) en las que es asistente y en las que es
 * acompañante. Si no tiene ninguna, no se envía. Cada envío queda en digest_log.
 *
 * Secretos (Supabase → Edge Functions → Secrets):
 *   RESEND_API_KEY   clave de Resend (Sending access, dominio notifications.acsex.es)
 *   CRON_SECRET      contraseña que el cron envía en la cabecera x-cron-secret
 *   DIGEST_FROM      (opcional) remitente; por defecto "Family Planner <family_planner@notifications.acsex.es>"
 *   APP_URL          (opcional) enlace a la aplicación; por defecto la de GitHub Pages
 * SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.
 *
 * Cuerpo de la petición (JSON, todo opcional), para pruebas:
 *   { "member_id": 1 }                       envía ya el aviso de esa persona (semana actual)
 *   { "member_id": 1, "week_of": "2026-11-16" }  …de la semana de esa fecha
 *   { "dry_run": true }                      no envía: devuelve el HTML de cada correo
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const FROM = Deno.env.get('DIGEST_FROM') ?? 'Family Planner <family_planner@notifications.acsex.es>';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://acsxe.github.io/family-planner/';

type Person = { member_id: number; name: string; color: string };
type Activity = {
  date: string; start: string; end: string; name: string; description: string;
  attendees: Person[]; companions: Person[];
};
type Digest = {
  user_id: string; member_id: number; email: string; name: string; full_name: string;
  language: string; date_format: string; number_format: string; time_format: string; timezone: string;
  week_start: string; week_end: string; attending: Activity[]; accompanying: Activity[];
};

// ---------- Base de datos (API REST de Supabase con la clave de servicio) ----------
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;   // al registrar un envío Supabase responde sin contenido
}

const dueDigests = (memberId: number | null, now: string | null): Promise<Digest[]> =>
  db('rpc/due_weekly_digests', {
    method: 'POST',
    body: JSON.stringify({ p_member: memberId, ...(now ? { p_now: now } : {}) })
  });

const logDigest = (d: Digest, status: 'sent' | 'skipped' | 'error', extra: { resend_id?: string; error?: string } = {}) =>
  db('digest_log?on_conflict=user_id,week_start', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: d.user_id, week_start: d.week_start, status, updated_at: new Date().toISOString(), ...extra })
  });

// ---------- Correo ----------
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const dayLabel = (iso: string) => { const d = parse(iso); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`; };
const weekLabel = (from: string, to: string) => {
  const a = parse(from), b = parse(to);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `del ${a.getUTCDate()} al ${b.getUTCDate()} de ${MONTHS[b.getUTCMonth()]}`
    : `del ${a.getUTCDate()} de ${MONTHS[a.getUTCMonth()]} al ${b.getUTCDate()} de ${MONTHS[b.getUTCMonth()]}`;
};
const names = (people: Person[]) => {
  const n = people.map((p) => p.name);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}` : n[0] ?? '';
};
const others = (people: Person[], me: number) => people.filter((p) => p.member_id !== me);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// Colores y tipografía de la aplicación (css/base.css)
const C = { shell: '#2c4562', text: '#1d2a3a', muted: '#5b6b80', border: '#dfe4ec', bg: '#f3f5f8', primary: '#0a6ed1' };
// Con comillas simples: va dentro de atributos style="…" del HTML
const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
// Tipografía con propiedades sueltas: Outlook ignora el atajo "font:"
const font = (size: number, weight = 400, lineHeight = 1.4) =>
  `font-family:${FONT};font-size:${size}px;font-weight:${weight};line-height:${lineHeight}`;
// Saltos de línea de la descripción como <br>: Outlook ignora "white-space"
const lines = (s: string) => esc(s).replace(/\r?\n/g, '<br>');

// Puntos de color de los asistentes: el carácter ● coloreado se ve en todos los programas de correo
const dots = (people: Person[]) =>
  `<span style="font-size:12px;letter-spacing:1px;color:${C.muted}">${people.map((p) => `<span style="color:${p.color}">&#9679;</span>`).join('')}</span>`;

// Personas con su punto de color: "● Sergio y ● Pablo"
const peopleHtml = (people: Person[]) => {
  const p = people.map((x) => `<span style="color:${x.color}">&#9679;</span>&nbsp;${esc(x.name)}`);
  return p.length > 1 ? `${p.slice(0, -1).join(', ')} y ${p[p.length - 1]}` : p[0] ?? '';
};

// Una sección ("Asistes" / "Acompañas") con sus actividades agrupadas por día
function sectionHtml(title: string, items: Activity[], role: 'attending' | 'accompanying', me: number) {
  if (!items.length) return '';
  let html = `<tr><td style="padding:20px 24px 4px;${font(16, 700, 1.3)};color:${C.text}">${title}</td></tr>`;
  let day = '';
  for (const a of items) {
    if (a.date !== day) {
      day = a.date;
      html += `<tr><td style="padding:12px 24px 4px;${font(13, 700, 1.3)};color:${C.muted};text-transform:uppercase;letter-spacing:.03em">${dayLabel(a.date)}</td></tr>`;
    }
    // Como asistente: la actividad y, debajo en gris, con quién vas ("Con Laura · Acompaña Alberto").
    // Como acompañante: "● Sergio - título de la actividad", con las personas a las que acompañas.
    // Nunca se nombra a quien recibe el correo.
    const accompanied = others(a.attendees, me);
    const goingWith = role === 'attending'
      ? [others(a.attendees, me).length ? `Con ${esc(names(others(a.attendees, me)))}` : '',
         others(a.companions, me).length ? `Acompaña ${esc(names(others(a.companions, me)))}` : ''].filter(Boolean).join(' · ')
      : '';
    const heading = role === 'accompanying' && accompanied.length
      ? `${peopleHtml(accompanied)} - ${esc(a.name)}`
      : `${dots(a.attendees)} ${esc(a.name)}`;
    html += `<tr><td style="padding:4px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:8px">
        <tr>
          <td width="96" valign="top" style="padding:10px 0 10px 12px;${font(13, 600)};color:${C.text};white-space:nowrap">${a.start}&nbsp;–&nbsp;${a.end}</td>
          <td valign="top" style="padding:10px 12px;${font(13)};color:${C.text}">
            <div style="${font(13, 700)}">${heading}</div>
            ${goingWith ? `<div style="${font(13)};color:${C.muted};margin-top:2px">${goingWith}</div>` : ''}
            ${a.description ? `<div style="${font(13)};color:${C.muted};margin-top:4px">${lines(a.description)}</div>` : ''}
          </td>
        </tr>
      </table></td></tr>`;
  }
  return html;
}

function textSection(title: string, items: Activity[], role: 'attending' | 'accompanying', me: number) {
  if (!items.length) return '';
  return `\n${title.toUpperCase()}\n` + items.map((a) => {
    const accompanied = others(a.attendees, me);
    const heading = role === 'accompanying' && accompanied.length ? `${names(accompanied)} - ${a.name}` : a.name;
    const goingWith = role === 'attending'
      ? [others(a.attendees, me).length ? `con ${names(others(a.attendees, me))}` : '',
         others(a.companions, me).length ? `acompaña ${names(others(a.companions, me))}` : ''].filter(Boolean).join(', ')
      : '';
    return `- ${dayLabel(a.date)}, ${a.start}–${a.end}: ${heading}${goingWith ? ` (${goingWith})` : ''}`;
  }).join('\n') + '\n';
}

export function renderDigest(d: Digest, appUrl = APP_URL) {
  const week = weekLabel(d.week_start, d.week_end);
  const subject = `Tu semana en Family Planner (${week})`;
  const total = d.attending.length + d.accompanying.length;
  const summary = [
    d.attending.length ? `${d.attending.length} ${d.attending.length === 1 ? 'actividad' : 'actividades'} como asistente` : '',
    d.accompanying.length ? `${d.accompanying.length} como acompañante` : ''
  ].filter(Boolean).join(' y ');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Apple Mail: no convertir fechas, horas ni direcciones en enlaces -->
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<style>a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font:inherit!important}</style>
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid ${C.border};border-radius:12px;overflow:hidden">
    <tr><td bgcolor="${C.shell}" style="background:${C.shell};padding:14px 24px;${font(17, 700, 1.3)};color:#ffffff">Family Planner</td></tr>
    <tr><td style="padding:24px 24px 0;${font(20, 700, 1.3)};color:${C.text}">Hola ${esc(d.name)},</td></tr>
    <tr><td style="padding:6px 24px 0;${font(14, 400, 1.5)};color:${C.muted}">La semana que viene, ${esc(week)}, tienes ${summary}.</td></tr>
    ${sectionHtml('Actividades como asistente', d.attending, 'attending', d.member_id)}
    ${sectionHtml('Actividades como acompañante', d.accompanying, 'accompanying', d.member_id)}
    <tr><td style="padding:24px 24px 8px">
      <!-- Botón hecho con una tabla: así Outlook respeta su tamaño y su color -->
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td bgcolor="${C.primary}" style="background:${C.primary};border-radius:6px;padding:11px 18px">
          <a href="${appUrl}" style="${font(14, 600, 1.3)};color:#ffffff;text-decoration:none">Abrir Family Planner</a>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:16px 24px 20px;border-top:1px solid ${C.border};${font(12, 400, 1.5)};color:${C.muted}">
      Recibes este correo cada domingo a las 9:00 horas porque tienes activado el aviso semanal de Family Planner.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
  const text = `Hola ${d.name},\n\nLa semana que viene, ${week}, tienes ${summary}.\n` +
    textSection('Actividades como asistente', d.attending, 'attending', d.member_id) +
    textSection('Actividades como acompañante', d.accompanying, 'accompanying', d.member_id) +
    `\nAbrir Family Planner: ${appUrl}\n`;
  return { subject, html, text, total };
}

async function sendEmail(d: Digest, mail: { subject: string; html: string; text: string }, test: boolean) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      // El mismo aviso no se envía dos veces aunque la función se ejecute de nuevo
      ...(test ? {} : { 'Idempotency-Key': `weekly-digest-${d.user_id}-${d.week_start}` })
    },
    body: JSON.stringify({ from: FROM, to: [d.email], subject: mail.subject, html: mail.html, text: mail.text })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(body)}`);
  return body.id as string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'No autorizado' }, 401);

  const body = await req.json().catch(() => ({}));
  const memberId: number | null = body.member_id ?? null;     // prueba: solo esta persona, cualquier día
  const dryRun = body.dry_run === true;
  const now = body.week_of ? `${body.week_of}T12:00:00Z` : null;
  const test = memberId !== null;

  const results = [];
  for (const d of await dueDigests(memberId, now)) {
    const mail = renderDigest(d);
    const who = { member_id: d.member_id, name: d.name, week_start: d.week_start };
    if (!mail.total) {
      if (!test && !dryRun) await logDigest(d, 'skipped');
      results.push({ ...who, status: 'skipped', reason: 'sin actividades esa semana' });
      continue;
    }
    if (dryRun) {
      results.push({ ...who, status: 'dry_run', to: d.email, subject: mail.subject, html: mail.html, text: mail.text });
      continue;
    }
    try {
      const id = await sendEmail(d, mail, test);
      if (!test) await logDigest(d, 'sent', { resend_id: id });
      results.push({ ...who, status: 'sent', resend_id: id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!test) await logDigest(d, 'error', { error: message.slice(0, 500) });
      results.push({ ...who, status: 'error', error: message });
    }
  }
  return json({ results });
});
