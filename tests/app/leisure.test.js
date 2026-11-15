// Ocio y Tiempo Libre: botón solo al crear, ventana con los planes de la agenda (muestra real), filtro Niños/Adultos,
// "Usar este plan" y aviso si la agenda no responde. Los planes salen de la tabla leisure_days, llenada antes
// por la edge function de verdad (tests/function/leisure.mjs) con la misma muestra.
// Lo lanza tests/run.sh.
const { chromium } = require('playwright'); const { install } = require('./fake-supabase.js');
const { execFileSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '../..');
const base = process.env.BASE_URL;
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
// La edge function guarda la agenda de muestra en la base de datos temporal, como haría el cron
const refresh = (from) => JSON.parse(execFileSync('node', ['--experimental-strip-types', '--no-warnings', path.join(__dirname, '../function/leisure.mjs'), 'refresh', from], { encoding: 'utf8' }));
// "actualizada el": la fecha de hoy en la zona horaria del navegador (Madrid en la prueba), no la de UTC
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()).split('-').reverse().join('/');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Madrid' }); await install(ctx, '11111111-1111-1111-1111-111111111111');
  // Origen 'supabase'
  const stored = refresh('2026-11-01');
  ok(stored.saved === true && stored.days === 2, `la edge function guarda la agenda de muestra (${stored.days} días, ${stored.plans} planes)`);
  // Peticiones a leisure_day(): se cuentan y se pueden retrasar o hacer fallar; si no, las atiende fake-supabase.js
  let fail = false, delay = 0; const asked = [];
  await ctx.route('**/rest/v1/rpc/leisure_day', async (route) => {
    asked.push(route.request().postDataJSON().p_date);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (fail) return route.fulfill({ status: 500, json: { code: 'XX000', message: 'Fallo simulado', details: null, hint: null } });
    return route.fallback();
  });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + 'index.html#planner'); await p.waitForSelector('#col1 .month'); await p.waitForTimeout(800);

  // El botón solo aparece al crear una actividad
  await p.click('button.day[data-date="2026-11-16"]'); await p.waitForTimeout(300); await p.click('.event:has-text("Médico")'); await p.waitForTimeout(300);
  ok(await p.isHidden('#btn-leisure'), 'viendo una actividad: sin botón de ocio');
  await p.click('#close-detail'); await p.click('button.day[data-date="2026-11-21"]'); await p.waitForTimeout(300);
  await p.click('.slot[data-min="600"]'); await p.waitForTimeout(300);
  ok(await p.isVisible('#btn-leisure'), 'nueva actividad: botón de ocio junto a Cerrar');

  // Ventana con los planes de ese día
  await p.click('#btn-leisure'); await p.waitForSelector('#leisure-list .plan');
  ok(asked.at(-1) === '2026-11-21', `pide los planes de la fecha del formulario (${asked.at(-1)})`);
  ok((await p.textContent('#leisure-date')) === 'sábado, 21 de noviembre de 2026', 'cabecera con la fecha larga');
  ok((await p.textContent('#leisure-foot')) === `Fuente: Agenda de eventos culturales del Ayuntamiento de Madrid (actualizada el ${today}, con planes hasta el 22/11/2026)`, `pie: cuándo se actualizó y hasta cuándo hay planes ("${await p.textContent('#leisure-foot')}")`);
  const count = async () => p.locator('#leisure-list .plan').count();
  ok((await count()) === 5 && (await p.getAttribute('#leisure-filter-kids', 'aria-pressed')) === 'true', 'de partida, "Niños": 5 planes (sin los de varios días)');
  ok((await p.textContent('#leisure-filter-kids')) === 'Niños (5)' && (await p.textContent('#leisure-filter-adults')) === 'Adultos (4)' && await p.locator('#leisure-filter-all, #leisure-long').count() === 0, 'solo dos filtros: Niños (5) y Adultos (4)');
  await p.click('#leisure-filter-adults');
  ok((await count()) === 4 && (await p.textContent('#leisure-count')) === 'Eventos (4)', '"Adultos": 4 planes');
  ok(await p.locator('.plan:has-text("Entrega de premios") dd:has-text("Por determinar")').count() === 1, 'evento sin hora: "Por determinar"');
  await p.click('#leisure-filter-kids');
  const libros = p.locator('.plan:has-text("CREA TUS PROPIOS LIBROS")');
  const link = libros.locator('.plan__link');
  ok((await link.getAttribute('href')).startsWith('https://www.madrid.es/') && (await link.getAttribute('rel')).includes('noopener'), '"+ información" abre madrid.es en otra pestaña');
  const facts = await libros.locator('.plan__facts dt').allTextContents();
  ok(facts.join() === 'Hora,Lugar,Dirección,Precio' && (await libros.locator('dd').first().textContent()) === '12:00', `datos de la fila: ${facts.join(', ')} (sin fecha ni accesibilidad)`);
  const [l, u] = await Promise.all([link.boundingBox(), libros.locator('.plan__use').boundingBox()]);
  const row = await libros.boundingBox();
  ok(u.y < l.y && u.y - row.y < 30, '"Usar este plan" arriba a la derecha y "+ información" debajo');
  const cut = await p.locator('.plan__facts dd[title]').count();
  ok(await p.locator('.plan__facts dd').evaluateAll((els) => els.every((e) => e.getClientRects().length === 1 && e.offsetHeight < 22)), 'título y datos en una sola línea');
  ok(await p.locator('.plan__facts dd, .plan__title').evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1 ? !e.title : e.title === e.textContent)), `textos recortados con el texto completo al pasar el ratón (${cut} datos recortados)`);

  // Usar este plan
  await p.click('.plan:has-text("CREA TUS PROPIOS LIBROS") .plan__use'); await p.waitForTimeout(300);
  ok(await p.isHidden('#leisure-dialog'), 'Usar este plan cierra la ventana');
  const form = await p.evaluate(() => ['f-name', 'f-desc', 'f-start', 'f-end'].map((id) => document.getElementById(id).value));
  ok(form[0] === 'CREA TUS PROPIOS LIBROS' && form[2] === '12:00' && form[3] === '13:00', `rellena la actividad: ${form[0]} ${form[2]}–${form[3]}`);
  const lines = form[1].split('\n');
  ok(lines[0].startsWith('TALLER DE ENCUADERNACIÓN') && lines.slice(-4).join('|') === 'Lugar:|Imprenta Municipal. Artes del libro|Dirección:|Calle Concepcion Jeronima 15, 28012 Madrid', `descripción: texto del evento, "Lugar:" y "Dirección:" debajo (${JSON.stringify(lines.slice(-4))})`);

  // Se guarda marcada como creada con un plan; Laura la ve con los destellos en "Creada por / Creada el"
  await p.click('#f-attendees .chip:has-text("Alberto")'); await p.click('#btn-save'); await p.waitForTimeout(600);
  const saved = JSON.parse(execFileSync('psql', ['-X', '-tA', '-c', "select json_agg(json_build_object('plan', from_plan, 'len', char_length(description))) from public.activities where name = 'CREA TUS PROPIOS LIBROS'"], { encoding: 'utf8' }));
  ok(saved?.length === 1 && saved[0].plan === true, `guardada con from_plan = true (${JSON.stringify(saved)})`);
  const ctxL = await b.newContext({ viewport: { width: 1440, height: 900 } }); await install(ctxL, '22222222-2222-2222-2222-222222222222');
  const pl = await ctxL.newPage(); pl.on('pageerror', (e) => errs.push(e.message));
  await pl.goto(base + 'index.html#planner'); await pl.waitForSelector('#col1 .month'); await pl.waitForTimeout(800);
  await pl.click('button.day[data-date="2026-11-21"]'); await pl.waitForTimeout(300); await pl.click('.event:has-text("CREA TUS PROPIOS LIBROS")'); await pl.waitForTimeout(300);
  ok(await pl.isVisible('#detail-owner .detail__plan') && (await pl.getAttribute('#detail-owner .detail__plan', 'title')) === 'Creada con Ocio y Tiempo Libre', 'Laura: destellos en "Creada por / Creada el"');
  await pl.click('#close-detail'); await pl.click('button.day[data-date="2026-11-16"]'); await pl.waitForTimeout(300); await pl.click('.event:has-text("Médico")'); await pl.waitForTimeout(300);
  ok(await pl.locator('#detail-owner .detail__plan').count() === 0, 'una actividad sin plan no lleva destellos');
  await ctxL.close();
  await p.click('#close-detail').catch(() => {}); await p.click('button.day[data-date="2026-11-21"]'); await p.waitForTimeout(300); await p.click('.slot[data-min="600"]'); await p.waitForTimeout(300);

  // Misma fecha: no se vuelve a pedir y la lista vuelve a empezar arriba; Escape cierra
  const n = asked.length; await p.click('#btn-leisure'); await p.waitForSelector('#leisure-list .plan');
  ok(asked.length === n, 'la misma fecha no se vuelve a pedir');
  await p.locator('#leisure-list').evaluate((l) => { l.scrollTop = l.scrollHeight; });
  await p.keyboard.press('Escape'); await p.click('#btn-leisure'); await p.waitForSelector('#leisure-list .plan');
  ok(await p.locator('#leisure-list').evaluate((l) => l.scrollTop) === 0, 'al volver a abrir la ventana, la lista empieza arriba del todo');
  await p.keyboard.press('Escape'); ok(await p.isHidden('#leisure-dialog'), 'Escape cierra la ventana');

  // Mientras llegan los planes: indicador y "Buscando planes…"
  delay = 1500; await p.fill('#f-date', '2026-11-22'); await p.click('#btn-leisure'); await p.waitForTimeout(500);
  ok((await p.textContent('#leisure-status-text')) === 'Buscando planes…' && await p.isVisible('#leisure-status .leisure__loader'), 'mientras busca: indicador y "Buscando planes…"');
  await p.waitForSelector('#leisure-list .plan'); delay = 0;
  ok((await p.locator('#leisure-list .plan').count()) > 0, 'y al llegar, los planes');
  await p.keyboard.press('Escape');

  // Si la base de datos no responde: aviso en la ventana
  fail = true; await p.fill('#f-date', '2026-11-28'); await p.click('#btn-leisure'); await p.waitForSelector('#leisure-status:not([hidden]):not(.is-loading)');
  ok((await p.textContent('#leisure-status-text')).startsWith('No se han podido consultar'), 'la base de datos no responde: aviso en la ventana');
  await p.keyboard.press('Escape');
  // Tabla vacía (aún no se ha actualizado nunca): sin planes y sin fechas en el pie
  fail = false; execFileSync('psql', ['-X', '-q', '-c', 'delete from public.leisure_days']);
  await p.fill('#f-date', '2026-11-29'); await p.click('#btn-leisure'); await p.waitForSelector('#leisure-status:not([hidden]):not(.is-loading)');
  ok((await p.textContent('#leisure-status-text')) === 'No hay planes publicados para este día.' && (await p.textContent('#leisure-foot')) === 'Fuente: Agenda de eventos culturales del Ayuntamiento de Madrid', 'tabla vacía: "No hay planes publicados" y el pie sin fechas');
  await p.click('#leisure-close'); await ctx.close();
  ok(errs.length === 0, `errores JS: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
  console.log(res.join('\n')); await b.close();
  process.exitCode = res.some((l) => l.startsWith('FALLO')) ? 1 : 0;
})().catch((e) => { console.log(res.join('\n')); console.log('PARADA:', e.message.split('\n')[0]); process.exit(1); });
