// Calendario: al abrir un día la vista horaria muestra la primera actividad, y el aviso
// "Creada por / Creada el" de las actividades de otra persona. Lo lanza tests/run.sh.
const { chromium } = require('playwright'); const { install, sql } = require('./fake-supabase.js');
const base = process.env.BASE_URL;
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
(async () => {
  const b = await chromium.launch(); const errs = [];
  sql(`update public.activities set created_at = '2026-11-09 18:30:00+00' where name = 'Dentista'`, null);
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); await install(ctx, '11111111-1111-1111-1111-111111111111');
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + 'index.html#planner'); await p.waitForSelector('#col1 .month'); await p.waitForTimeout(900);
  // La primera actividad del día queda a la vista
  for (const [d, name] of [['2026-11-16', 'Médico'], ['2026-11-17', 'Dentista'], ['2026-11-18', 'Piano']]) {
    await p.click(`button.day[data-date="${d}"]`); await p.waitForTimeout(300);
    const v = await p.evaluate((n) => { const body = document.getElementById('day-body').getBoundingClientRect(); const e = [...document.querySelectorAll('.event')].find((x) => x.textContent.includes(n)).getBoundingClientRect(); return e.top >= body.top && e.bottom <= body.bottom; }, name);
    ok(v, `${d}: la primera actividad (${name}) queda a la vista al abrir el día`);
  }
  await p.click('button.day[data-date="2026-11-19"]'); await p.waitForTimeout(300);
  ok(Math.abs(await p.evaluate(() => document.getElementById('day-body').scrollTop) - (8 * 60 - 12)) <= 1, 'día sin actividades: la vista empieza a las 8:00');
  // Columna 1: el mes que se está mirando no se pierde al cambiar los anchos de las columnas
  const monthVisible = (name) => p.evaluate((name) => {
    const v = document.querySelector('#col1 .col__body').getBoundingClientRect();
    const m = [...document.querySelectorAll('#months .month')].find((x) => x.textContent.startsWith(name)).getBoundingClientRect();
    return m.top >= v.top - 1 && m.bottom <= v.bottom + 1;
  }, name);
  await p.click('button.day[data-date="2026-11-16"]'); await p.click('.event:has-text("Médico")'); await p.waitForTimeout(300);
  ok(await monthVisible('Noviembre'), 'con las 3 columnas abiertas, noviembre (día elegido) sigue entero a la vista');
  for (const sep of ['#sep-a', '#sep-b']) { const btn = p.locator(`${sep} .sep__btn:visible`); if (await btn.count()) { await btn.click(); await p.waitForTimeout(250); } }
  ok(await monthVisible('Noviembre'), 'y también tras cambiar los anchos con las flechas');
  await p.click('#close-detail'); await p.click('#close-day'); await p.waitForTimeout(250);
  await p.evaluate(() => [...document.querySelectorAll('#months .month')].find((x) => x.textContent.startsWith('Abril')).scrollIntoView({ block: 'start' })); await p.waitForTimeout(250);
  await p.click('button.day[data-date="2026-04-14"]'); await p.waitForTimeout(300);
  ok(await monthVisible('Abril'), 'si se baja a abril y se abre un día de abril, abril sigue a la vista');
  await p.click('#close-day'); await p.waitForTimeout(250);

  // Aviso de una actividad de otra persona
  await p.click('button.day[data-date="2026-11-17"]'); await p.waitForTimeout(300); await p.click('.event:has-text("Dentista")'); await p.waitForTimeout(300);
  const owner = await p.$eval('#detail-owner', (e) => [...e.children].map((c) => c.textContent));
  ok(owner[0] === 'Creada por: Laura Liz' && owner[1] === 'Creada el: 09/11/2026', `aviso de solo lectura: "${owner.join('" / "')}"`);
  await p.click('#close-detail'); await p.click('button.day[data-date="2026-11-16"]'); await p.click('.event:has-text("Médico")'); await p.waitForTimeout(300);
  ok(await p.isHidden('#detail-owner'), 'una actividad propia no muestra el aviso');
  ok(errs.length === 0, `errores JS: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
  console.log(res.join('\n')); await b.close();
  process.exitCode = res.some((l) => l.startsWith('FALLO')) ? 1 : 0;
})().catch((e) => { console.log(res.join('\n')); console.log('PARADA:', e.message.split('\n')[0]); process.exit(1); });
