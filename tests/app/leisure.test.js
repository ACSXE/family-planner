// Ocio y Tiempo Libre: botón solo al crear, ventana con los planes de la agenda (muestra real), filtros,
// "Usar este plan" y aviso si la agenda no responde. La función se ejecuta de verdad (tests/function/leisure.mjs).
// Lo lanza tests/run.sh.
const { chromium } = require('playwright'); const { install } = require('./fake-supabase.js');
const { execFileSync } = require('child_process'); const path = require('path');
const base = process.env.BASE_URL;
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
const runFn = (date) => execFileSync('node', ['--experimental-strip-types', '--no-warnings', path.join(__dirname, '../function/leisure.mjs'), date], { encoding: 'utf8' });
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await install(ctx, '11111111-1111-1111-1111-111111111111');
  let fail = false; const asked = [];
  await ctx.route('**/functions/v1/leisure-events', async (route) => {
    const { date } = route.request().postDataJSON(); asked.push(date);
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
  const count = async () => p.locator('#leisure-list .plan').count();
  ok((await count()) === 8 && (await p.textContent('#leisure-count')) === 'Eventos (8)', 'de partida, "Todos" sin los de varios días: 8 planes');
  await p.click('#leisure-filter-kids');
  ok((await count()) === 5 && (await p.getAttribute('#leisure-filter-kids', 'aria-pressed')) === 'true', '"Niños": 5 planes');
  await p.click('#leisure-filter-adults');
  ok((await count()) === 4, '"Adultos": 4 planes');
  await p.click('#leisure-filter-all'); await p.check('#leisure-long');
  ok((await count()) === 14 && (await p.textContent('#leisure-filter-all')) === 'Todos (14)', 'incluyendo los de varios días: 14');
  const libros = p.locator('.plan:has-text("CREA TUS PROPIOS LIBROS")');
  const link = libros.locator('.plan__link');
  ok((await link.getAttribute('href')).startsWith('https://www.madrid.es/') && (await link.getAttribute('rel')).includes('noopener'), '"+ información" abre madrid.es en otra pestaña');
  const facts = await libros.locator('.plan__facts dt').allTextContents();
  ok(facts.join() === 'Hora,Lugar,Dirección,Precio' && (await libros.locator('dd').first().textContent()) === '12:00', `datos de la fila: ${facts.join(', ')} (sin fecha ni accesibilidad)`);
  ok(await p.locator('.plan:has-text("19ª edición") dd:has-text("Por determinar")').count() === 1, 'evento sin hora: "Por determinar"');
  const [l, u] = await Promise.all([link.boundingBox(), libros.locator('.plan__use').boundingBox()]);
  ok(l.y < u.y, '"+ información" encima de "Usar este plan"');

  // Usar este plan
  await p.click('.plan:has-text("CREA TUS PROPIOS LIBROS") .plan__use'); await p.waitForTimeout(300);
  ok(await p.isHidden('#leisure-dialog'), 'Usar este plan cierra la ventana');
  const form = await p.evaluate(() => ['f-name', 'f-desc', 'f-start', 'f-end'].map((id) => document.getElementById(id).value));
  ok(form[0] === 'CREA TUS PROPIOS LIBROS' && form[2] === '12:00' && form[3] === '13:00' && form[1].includes('Precio: Gratuito'), `rellena la actividad: ${form[0]} ${form[2]}–${form[3]}`);

  // Misma fecha: no se vuelve a pedir; Escape cierra
  const n = asked.length; await p.click('#btn-leisure'); await p.waitForSelector('#leisure-list .plan');
  ok(asked.length === n, 'la misma fecha no se vuelve a pedir');
  await p.keyboard.press('Escape'); ok(await p.isHidden('#leisure-dialog'), 'Escape cierra la ventana');

  // Si la agenda no responde
  fail = true; await p.fill('#f-date', '2026-11-28'); await p.click('#btn-leisure'); await p.waitForSelector('#leisure-status:not([hidden]):not(.is-loading)');
  ok((await p.textContent('#leisure-status-text')).startsWith('No se han podido consultar'), 'sin respuesta: aviso en la ventana');
  await p.click('#leisure-close');
  ok(errs.length === 0, `errores JS: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
  console.log(res.join('\n')); await b.close();
  process.exitCode = res.some((l) => l.startsWith('FALLO')) ? 1 : 0;
})().catch((e) => { console.log(res.join('\n')); console.log('PARADA:', e.message.split('\n')[0]); process.exit(1); });
