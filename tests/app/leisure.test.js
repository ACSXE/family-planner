// Ocio y Tiempo Libre: botón solo al crear, ventana con los planes de la agenda (muestra real), filtro Niños/Adultos,
// "Usar este plan" y aviso si la agenda no responde. Con los dos orígenes de FP_CONFIG.leisure.source:
//   'supabase' → la edge function se ejecuta de verdad (tests/function/leisure.mjs)
//   'local'    → data/leisure-events.json, generado con tools/build-leisure-data.mjs desde la misma muestra
// Lo lanza tests/run.sh.
const { chromium } = require('playwright'); const { install } = require('./fake-supabase.js');
const { execFileSync } = require('child_process'); const path = require('path'); const fs = require('fs'); const os = require('os');
const ROOT = path.join(__dirname, '../..');
const base = process.env.BASE_URL;
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
const runFn = (date) => execFileSync('node', ['--experimental-strip-types', '--no-warnings', path.join(__dirname, '../function/leisure.mjs'), date], { encoding: 'utf8' });
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await install(ctx, '11111111-1111-1111-1111-111111111111');
  // Origen 'supabase'
  const config = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  ok(/leisure: \{ source: 'supabase' \}/.test(config), "configuración publicada: planes de la edge function (source: 'supabase')");
  let fail = false, delay = 0; const asked = [];
  await ctx.route('**/functions/v1/leisure-events', async (route) => {
    const { date } = route.request().postDataJSON(); asked.push(date);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (fail) return route.fulfill({ status: 502, json: { error: 'No se ha podido consultar la agenda de Madrid' } });
    route.fulfill({ status: 200, contentType: 'application/json', body: runFn(date) });
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
  ok((await p.textContent('#leisure-foot')).endsWith('(actualizada hasta el 22/11/2026)'), 'supabase: el pie indica hasta cuándo hay planes');
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

  // Si la agenda no responde
  // Si tarda, se avisa sin dejar de buscar
  const status = () => p.textContent('#leisure-status-text');
  delay = 14500; await p.fill('#f-date', '2026-11-22'); await p.click('#btn-leisure'); await p.waitForTimeout(500);
  ok((await status()) === 'Buscando planes…', 'al abrir: "Buscando planes…"');
  await p.waitForTimeout(8100);
  ok((await status()) === 'La agenda está tardando en cargar un poco mas de lo normal…' && await p.isVisible('#leisure-status .leisure__loader'), 'a los 8 s: "La agenda está tardando en cargar un poco mas de lo normal…"');
  await p.waitForTimeout(5000);
  ok((await status()) === 'Buscando planes…', 'a los 13 s, otra vez "Buscando planes…" (va alternando)');
  await p.waitForSelector('#leisure-list .plan'); delay = 0;
  ok((await p.locator('#leisure-list .plan').count()) > 0, 'y al llegar, los planes');
  await p.keyboard.press('Escape');

  // Si la función falla, se usa la copia local de respaldo (data/leisure-events.json, la publicada)
  fail = true; await p.fill('#f-date', '2026-11-28'); await p.click('#btn-leisure'); await p.waitForSelector('#leisure-list .plan');
  const copy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/leisure-events.json'), 'utf8'));
  const copyUntil = Object.keys(copy.dates).sort().at(-1).split('-').reverse().join('/');
  ok((await p.locator('#leisure-list .plan').count()) === (copy.dates['2026-11-28'] || []).filter((e) => e.kids).length && (await p.textContent('#leisure-foot')).endsWith(`(actualizada hasta el ${copyUntil})`), `la función falla: planes de la copia local y su fecha en el pie (${copyUntil})`);
  await p.keyboard.press('Escape');
  // Si fallan la función y la copia: aviso
  await ctx.route('**/data/leisure-events.json', (r) => r.fulfill({ status: 404, body: '' }));
  await p.evaluate(() => location.reload()); await p.waitForSelector('#col1 .month'); await p.waitForTimeout(800);
  await p.click('button.day[data-date="2026-11-21"]'); await p.waitForTimeout(300); await p.click('.slot[data-min="600"]'); await p.waitForTimeout(300);
  await p.click('#btn-leisure'); await p.waitForSelector('#leisure-status:not([hidden]):not(.is-loading)');
  ok((await p.textContent('#leisure-status-text')).startsWith('No se han podido consultar'), 'sin función ni copia: aviso en la ventana');
  await p.click('#leisure-close'); await ctx.close();

  // Origen 'local': el fichero generado desde la misma muestra (descargada el 01/11/2026)
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fp-leisure-')), 'leisure-events.json');
  execFileSync('node', ['--experimental-strip-types', '--no-warnings', path.join(ROOT, 'tools/build-leisure-data.mjs'), path.join(ROOT, 'tests/function/fixtures/agenda-madrid.json'), tmp, '2026-11-01']);
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } }); await install(ctx2, '11111111-1111-1111-1111-111111111111');
  await ctx2.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: config.replace("source: 'supabase'", "source: 'local'") }));
  let files = 0, missing = false;
  await ctx2.route('**/data/leisure-events.json', (r) => { files++; return missing ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ path: tmp }); });
  let calls = 0; await ctx2.route('**/functions/v1/**', (r) => { calls++; r.abort(); });
  const p2 = await ctx2.newPage(); p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(base + 'index.html#planner'); await p2.waitForSelector('#col1 .month'); await p2.waitForTimeout(800);
  await p2.click('button.day[data-date="2026-11-21"]'); await p2.waitForTimeout(300); await p2.click('.slot[data-min="600"]'); await p2.waitForTimeout(300);
  await p2.click('#btn-leisure'); await p2.waitForSelector('#leisure-list .plan');
  ok((await p2.textContent('#leisure-filter-kids')) === 'Niños (5)' && (await p2.textContent('#leisure-filter-adults')) === 'Adultos (4)' && calls === 0, 'local: mismos planes que la función (Niños 5, Adultos 4) y sin llamar a Supabase');
  ok((await p2.textContent('#leisure-foot')) === 'Fuente: Agenda de eventos culturales del Ayuntamiento de Madrid (actualizada hasta el 22/11/2026)', `local: el pie indica hasta cuándo hay planes ("${await p2.textContent('#leisure-foot')}")`);
  await p2.keyboard.press('Escape'); await p2.fill('#f-date', '2027-06-05'); await p2.click('#btn-leisure'); await p2.waitForSelector('#leisure-status:not([hidden]):not(.is-loading)');
  ok((await p2.textContent('#leisure-status-text')) === 'No hay planes publicados para este día.' && files === 1, 'local: fecha sin planes avisa, y el fichero se descarga una sola vez');
  await ctx2.close();
  const ctx3 = await b.newContext(); await install(ctx3, '11111111-1111-1111-1111-111111111111'); missing = true;
  await ctx3.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: config.replace("source: 'supabase'", "source: 'local'") }));
  await ctx3.route('**/data/leisure-events.json', (r) => r.fulfill({ status: 404, body: '' }));
  const p3 = await ctx3.newPage(); p3.on('pageerror', (e) => errs.push(e.message));
  await p3.goto(base + 'index.html#planner'); await p3.waitForSelector('#col1 .month'); await p3.waitForTimeout(800);
  await p3.click('button.day[data-date="2026-11-21"]'); await p3.waitForTimeout(300); await p3.click('.slot[data-min="600"]'); await p3.waitForTimeout(300);
  await p3.click('#btn-leisure'); await p3.waitForSelector('#leisure-status:not([hidden]):not(.is-loading)');
  ok((await p3.textContent('#leisure-status-text')).startsWith('No se han podido consultar'), 'local: sin fichero, aviso en la ventana');
  // El fichero publicado está bien formado
  const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/leisure-events.json'), 'utf8'));
  ok(/^\d{4}-\d{2}-\d{2}$/.test(real.downloaded) && Object.values(real.dates).every((d) => d.every((e) => e.title && 'kids' in e && !('until' in e))), `data/leisure-events.json: copia del ${real.downloaded}, ${Object.keys(real.dates).length} días`);
  ok(errs.length === 0, `errores JS: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
  console.log(res.join('\n')); await b.close();
  process.exitCode = res.some((l) => l.startsWith('FALLO')) ? 1 : 0;
})().catch((e) => { console.log(res.join('\n')); console.log('PARADA:', e.message.split('\n')[0]); process.exit(1); });
