// Arranque: sin sesión se va al login sin pintar la app; pantalla de carga hasta tener datos.
// Lo lanza tests/run.sh.
const { chromium } = require('playwright'); const { install } = require('./fake-supabase.js');
const base = process.env.BASE_URL;
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
(async () => {
  const b = await chromium.launch(); const errs = [];
  // 1. Sin sesión: index.html → login.html sin llegar a pintar la aplicación
  { const ctx = await b.newContext(); const p = await ctx.newPage();
    await p.addInitScript(() => {
      if (!location.pathname.endsWith('index.html')) return;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) sessionStorage.setItem('pintado-index', e.name); }).observe({ type: 'paint', buffered: true });
    });
    await p.goto(base + 'index.html'); await p.waitForURL('**/login.html'); await p.waitForTimeout(400);
    ok(!(await p.evaluate(() => sessionStorage.getItem('pintado-index'))), 'sin sesión: va al login sin pintar nada de index.html');
    ok(await p.isVisible('#login-form') && !(await p.isVisible('.app-loader')), 'el login se ve normal, sin pantalla de carga');
    await p.goto(base); await p.waitForURL('**/login.html'); ok(true, 'la dirección raíz (/) también va directa al login');
    await ctx.close(); }
  // 2. Con sesión: pantalla de carga hasta que llegan los datos
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 }); await install(ctx, '11111111-1111-1111-1111-111111111111');
    await ctx.route('**/rest/v1/activities*', async (route) => { await new Promise((r) => setTimeout(r, 2500)); route.fallback(); });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(base + 'index.html'); await p.waitForTimeout(800);
    ok(await p.isVisible('.app-loader'), 'con sesión: se ve la pantalla de carga mientras llegan los datos');
    await p.waitForFunction(() => !document.documentElement.classList.contains('is-loading'), null, { timeout: 8000 });
    ok(await p.locator('#col1 .day.has-events').count() > 0, 'al terminar se quita y el calendario ya tiene las actividades');
    await ctx.close(); }
  // 3. Login con sesión ya abierta: carga en vez del formulario y pasa a la app
  { const ctx = await b.newContext(); await install(ctx, '11111111-1111-1111-1111-111111111111'); const p = await ctx.newPage();
    let formSeen = false; await p.exposeFunction('seen', () => { formSeen = true; });
    await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const f = document.getElementById('login-form'); if (f && f.offsetParent && !document.documentElement.classList.contains('is-loading')) window.seen(); }));
    await p.goto(base + 'login.html'); await p.waitForURL('**/index.html', { timeout: 8000 });
    ok(!formSeen, 'login.html con sesión abierta: no llega a enseñar el formulario y pasa a la aplicación');
    await ctx.close(); }
  // 4. Informe como primera pantalla
  { const ctx = await b.newContext(); await install(ctx, '11111111-1111-1111-1111-111111111111'); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(base + 'index.html#report-activity'); await p.waitForFunction(() => !document.documentElement.classList.contains('is-loading'), null, { timeout: 8000 });
    ok(await p.locator('#ra-rows tr').count() > 0, 'abriendo directamente el informe: la carga termina con la tabla ya rellena'); await ctx.close(); }
  ok(errs.length === 0, `errores JS: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
  console.log(res.join('\n')); await b.close();
  process.exitCode = res.some((l) => l.startsWith('FALLO')) ? 1 : 0;
})().catch((e) => { console.log(res.join('\n')); console.log('PARADA:', e.message.split('\n')[0]); process.exit(1); });
