// Cierre de sesión por inactividad (con un reloj simulado y el tiempo fijado a 1 minuto).
// Lo lanza tests/run.sh.
const { chromium, devices } = require('playwright'); const { install } = require('./fake-supabase.js');
const base = process.env.BASE_URL;
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (opts = { viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 }) => {
    const ctx = await b.newContext(opts); await install(ctx, '11111111-1111-1111-1111-111111111111');
    // El aviso y el cierre se prueban con 1 minuto (js/config.js tiene el valor real)
    const config = require('fs').readFileSync(require('path').join(__dirname, '../../js/config.js'), 'utf8').replace(/minutes:\s*\d+/, 'minutes: 1');
    await ctx.route('**/js/config.js', (route) => route.fulfill({ contentType: 'application/javascript', body: config }));
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.clock.install(); await p.goto(base + 'index.html#planner'); await p.waitForSelector('#col1 .month'); await p.clock.runFor(1500); return p;
  };
  const toLogin = async (p) => { for (let i = 0; i < 40 && !p.url().includes('login.html'); i++) { await p.clock.runFor(500).catch(() => {}); await p.waitForTimeout(100); } await p.waitForURL('**/login.html', { timeout: 5000 }); await p.waitForLoadState('load'); };
  const vis = (p) => p.evaluate(() => !document.getElementById('idle-dialog').hidden);
  const p = await open();
  await p.clock.runFor(20000); ok(!(await vis(p)), 'a los 20 s sin actividad no hay aviso');
  await p.mouse.move(400, 400); await p.mouse.move(420, 410); await p.clock.runFor(20000);
  ok(!(await vis(p)), 'mover el ratón reinicia el contador (otros 20 s y sigue sin aviso)');
  await p.clock.runFor(11000);
  ok(await vis(p), 'a los 30 s sin actividad aparece el aviso');
  ok(await p.evaluate(() => document.activeElement.classList.contains('modal__box')), 'el foco está en el aviso (ningún botón marcado)');
  await p.clock.runFor(8000);
  const cd = await p.evaluate(() => document.getElementById("idle-countdown").textContent + " " + document.getElementById("idle-unit").textContent); ok(/^2\d segundos$/.test(cd), `cuenta atrás: ${cd}`);
  await p.mouse.move(600, 500); await p.clock.runFor(3000);
  ok(await vis(p), 'con el aviso abierto, mover el ratón no lo cierra (hay que elegir)');
  await p.keyboard.press('Enter'); await p.clock.runFor(1000);
  ok(!(await vis(p)), 'Intro = seguir conectado');
  await p.clock.runFor(31000); await p.click('#idle-stay'); await p.clock.runFor(1000);
  ok(!(await vis(p)), '"Seguir conectado" cierra el aviso y la sesión sigue');
  // Escape = seguir conectado, sin cerrar columnas del calendario
  await p.click('button.day[data-date="2026-11-17"]');
  await p.waitForTimeout(300);   // que termine de recolocarse el calendario (desplazarlo cuenta como actividad)
  await p.clock.runFor(31000);
  await p.keyboard.press('Escape'); await p.clock.runFor(500);
  ok(!(await vis(p)) && !(await p.isHidden('#col2')), 'Escape = seguir conectado, y no cierra la columna del día');
  // Caducidad
  await p.clock.runFor(61000); await toLogin(p); await p.waitForTimeout(500);
  const notice = await p.textContent('#login-notice'); ok(notice.trim() === 'Tu sesión se ha cerrado por inactividad.' && !p.url().includes('?'), `al minuto: login con "${notice.trim()}" y dirección limpia`);
  ok(await p.evaluate(() => !Object.keys(sessionStorage).some((k) => k.includes('auth-token'))), 'la sesión se ha borrado del navegador');
  await p.goto(base + 'index.html'); await p.waitForURL('**/login.html', { timeout: 5000 });
  ok(true, 'volver a index.html sin sesión lleva al login');
  // Pestaña dormida: el reloj salta 5 minutos de golpe
  const q = await open(); await q.clock.fastForward(5 * 60 * 1000); await toLogin(q); ok(true, 'pestaña dormida 5 minutos: al despertar, cierra la sesión enseguida');
  // Cerrar sesión desde el aviso: login sin el mensaje de inactividad
  const r = await open(); await r.clock.runFor(31000); await r.click('#idle-logout'); await toLogin(r); await r.waitForTimeout(500);
  ok(await r.isHidden('#login-notice'), '"Cerrar sesión" del aviso lleva al login sin mensaje de inactividad');
  // Móvil
  const m = await open({ ...devices['Pixel 7'] }); await m.clock.runFor(32000);
  ok(await vis(m), 'móvil: el aviso aparece');
  ok(errs.length === 0, `errores JS: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
  // Login: error en el mismo sitio que el aviso
  const lc = await b.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
  await lc.route('**/auth/v1/**', (r) => r.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }));
  const l = await lc.newPage(); await l.goto(base + 'login.html'); await l.fill('#username', 'a'); await l.fill('#password', 'x'); await l.click('button[type=submit]'); await l.waitForSelector('#login-error:not([hidden])');
  const pos = await l.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return { err: Math.round(r('login-error').top), user: Math.round(r('username').top) }; });
  ok(pos.err < pos.user, `error de login encima de "Usuario", como el aviso (${pos.err}px < ${pos.user}px)`);
  console.log(res.join('\n')); await b.close();
  process.exitCode = res.some((l) => l.startsWith('FALLO')) ? 1 : 0;
})().catch((e) => { console.log(res.join('\n')); console.log('PARADA:', e.message.split('\n')[0]); process.exit(1); });
