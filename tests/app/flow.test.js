// Recorrido completo de la aplicación contra la base de datos de pruebas: calendario, crear,
// editar, solo lectura para otra persona, informe con filtros y eliminar. Lo lanza tests/run.sh.
const { chromium } = require('playwright');
const { install, sql } = require('./fake-supabase.js');
const base = process.env.BASE_URL;
const A = '11111111-1111-1111-1111-111111111111', L = '22222222-2222-2222-2222-222222222222';
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
const db = (s) => sql(`select coalesce(json_agg(t), '[]') from (${s}) t`, null);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (uid, w = 1440) => { const ctx = await b.newContext({ viewport: { width: w, height: 860 } }); await install(ctx, uid); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === "error" && !/Failed to load resource|Solo quien la creó/.test(m.text())) errs.push(m.text()); }); await p.goto(base + 'index.html#planner'); await p.waitForSelector('#col1 .month'); await p.waitForTimeout(900); return p; };
  const names = (p) => p.$$eval('.event .event__name', (t) => t.map((x) => x.textContent));

  const a = await open(A);
  ok((await a.textContent('#user-fullname')) === 'Alberto Carrasco', 'Alberto entra; nombre completo del menú de usuario');
  const legend = await a.$$eval('#legend li', (l) => l.map((x) => x.textContent + ' ' + x.getAttribute('style')));
  ok(legend.length === 4 && legend[0].includes('Alberto') && legend[0].includes('#4fb3e8') && legend[3].includes('Pablo'), `leyenda desde family_members: ${legend.map((x) => x.split(' ')[0]).join(', ')}`);
  const dotColor = await a.evaluate(() => document.querySelector('button.day[data-date="2026-11-17"] .day__dots i')?.getAttribute('style'));
  ok(/#dc2626|rgb\(220, 38, 38\)/i.test(dotColor || ''), `punto del 17/11 con el color de Sergio (primer asistente): ${dotColor}`);

  // Ver la del 17 (de Laura): solo lectura, con "Alberto y Laura"
  await a.click('button.day[data-date="2026-11-17"]'); await a.click('.event:has-text("Dentista")'); await a.waitForTimeout(200);
  const ro = await a.evaluate(() => ({ owner: document.getElementById('detail-owner').textContent, att: [...document.querySelectorAll('#f-attendees input:checked')].map((x) => x.parentElement.textContent), comp: document.getElementById('f-companion').selectedOptions[0].textContent, save: !document.getElementById('btn-save').closest('[hidden]') && !document.getElementById('btn-save').hidden }));
  ok(ro.owner.includes('Laura Liz') && ro.att.join() === 'Sergio,Pablo' && ro.comp === 'Alberto y Laura', `actividad de Laura en solo lectura: "${ro.owner.slice(0, 22)}…", asistentes ${ro.att.join(' y ')}, acompañante "${ro.comp}"`);
  await a.click('#close-detail');

  // Crear: Sergio sin acompañante → error del formulario; con Laura → guarda
  await a.click('button.day[data-date="2026-11-20"]'); await a.click('.slot[data-min="1020"]');
  await a.fill('#f-name', 'Natación'); await a.click('.chip:has(input[value="3"])'); await a.click('#btn-save'); await a.waitForTimeout(200);
  ok((await a.textContent('#form-error-text')) === 'Es obligatorio seleccionar un acompañante', 'Sergio sin acompañante: aviso en la pantalla');
  await a.selectOption('#f-companion', { label: 'Laura' }); await a.click('#btn-save'); await a.waitForTimeout(1200);
  let rows = await db(`select a.name, a.created_by, array(select member_id from activity_attendees x where x.activity_id=a.activity_id) att, array(select member_id from activity_companions x where x.activity_id=a.activity_id) comp from activities a where name='Natación'`);
  ok(rows.data.length === 1 && rows.data[0].created_by === 1 && rows.data[0].att.join() === '3' && rows.data[0].comp.join() === '2', `guardada en la base de datos: creada por ${rows.data[0]?.created_by}, asistentes {${rows.data[0]?.att}}, acompañantes {${rows.data[0]?.comp}}`);
  ok((await a.textContent('#detail-title')) === 'Detalle actividad' && (await names(a)).includes('Natación'), 'tras guardar: modo ver y aparece en el día');

  // Editar: añadir Pablo y acompañante "Alberto y Laura"
  await a.click('#btn-edit'); await a.click('.chip:has(input[value="4"])'); await a.selectOption('#f-companion', { label: 'Alberto y Laura' }); await a.click('#btn-save'); await a.waitForTimeout(1200);
  rows = await db(`select array(select member_id from activity_attendees x where x.activity_id=a.activity_id order by 1) att, array(select member_id from activity_companions x where x.activity_id=a.activity_id order by 1) comp from activities a where name='Natación'`);
  ok(rows.data[0].att.join() === '3,4' && rows.data[0].comp.join() === '1,2', `editada: asistentes {${rows.data[0].att}}, acompañantes {${rows.data[0].comp}}`);
  ok((await a.$eval('#f-companion', (s) => s.selectedOptions[0].textContent)) === 'Alberto y Laura', 'el formulario muestra "Alberto y Laura"');

  // Laura no puede modificarla ni eliminarla (aunque lo intente desde la consola, la base de datos lo impide)
  const l = await open(L);
  await l.click('button.day[data-date="2026-11-20"]'); await l.click('.event:has-text("Natación")'); await l.waitForTimeout(200);
  ok(!(await l.isHidden('#detail-owner')) && (await l.isHidden('#btn-edit')) && (await l.isHidden('#btn-delete')), 'Laura la ve en solo lectura, sin Editar ni papelera');
  const hack = await l.evaluate(async () => { try { await FP.storage.update({ ...FP.storage._last, id: document.querySelector('.event.is-selected')?.dataset.id || '', name: 'hack', description: '', date: '2026-11-20', start: '17:00', end: '17:30', attendees: [1], companions: [] }); return 'guardó'; } catch (e) { return e.message; } });
  ok(hack === 'Solo quien la creó puede modificarla', `Laura forzando la modificación desde la consola: "${hack}"`);

  // Informe: filtros por asistente y acompañante, columna Acompañante
  await a.goto(base + 'index.html#report-activity'); await a.waitForSelector('#ra-rows tr'); await a.waitForTimeout(500);
  const table = await a.$$eval('#ra-rows tr', (r) => r.map((x) => [...x.cells].map((c) => c.title || c.textContent.trim())));
  ok(table.length === 4 && table.some((r) => r[3] === 'Natación' && r[5] === 'Alberto y Laura' && r[0] === 'Sergio Pablo') && table.some((r) => r[3] === 'Médico oftalmólogo' && r[5] === '-'), `informe: ${table.map((r) => `${r[3]} (${r[0]} / ${r[5]})`).join(' · ')}`);
  await a.click('#ra-companion .ms__control'); await a.click('#ra-companion .ms__option:has-text("Alberto")'); await a.keyboard.press('Escape'); await a.click('#ra-search'); await a.waitForTimeout(600);
  let got = await a.$$eval('#ra-rows tr td:nth-child(4)', (t) => t.map((x) => x.title || x.textContent));
  ok(got.sort().join() === 'Dentista,Natación', `filtro Acompañante = Alberto: ${got.join(', ')}`);
  await a.click('#ra-clear'); await a.click('#ra-attendee .ms__control'); await a.click('#ra-attendee .ms__option:has-text("Laura")'); await a.keyboard.press('Escape'); await a.click('#ra-search'); await a.waitForTimeout(600);
  got = await a.$$eval('#ra-rows tr td:nth-child(4)', (t) => t.map((x) => x.title || x.textContent));
  ok(got.join() === 'Piano', `filtro Asistente = Laura: ${got.join(', ')}`);

  // Eliminar con la papelera
  await a.goto(base + 'index.html#planner'); await a.waitForSelector('#col1 .month'); await a.waitForTimeout(800);
  await a.click('button.day[data-date="2026-11-20"]'); await a.click('.event:has-text("Natación")'); await a.click('#btn-delete'); await a.click('#btn-delete'); await a.waitForTimeout(1200);
  rows = await db(`select count(*) n, (select count(*) from activity_attendees) att from activities where name='Natación'`);
  ok(rows.data[0].n === 0 && !(await names(a)).includes('Natación'), 'Alberto la elimina (y desaparece de la base de datos)');
  rows = await db(`select name from activities order by date`);
  ok(rows.data.map((r) => r.name).join() === 'Médico oftalmólogo,Dentista,Piano', `las actividades migradas siguen intactas: ${rows.data.map((r) => r.name).join(', ')}`);
  ok(errs.length === 0, `errores JS: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
  console.log(res.join('\n')); await b.close();
  process.exitCode = res.some((l) => l.startsWith('FALLO')) ? 1 : 0;
})().catch((e) => { console.log(res.join('\n')); console.log('PARADA:', e.message.split('\n')[0]); process.exit(1); });
