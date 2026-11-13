// Política de seguridad del contenido (CSP): recorre las pantallas y comprueba que el navegador
// no bloquea nada de la propia aplicación. Lo lanza tests/run.sh.
const { chromium } = require('playwright'); const { install } = require('./fake-supabase.js');
const base = process.env.BASE_URL;
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
(async () => {
  const b = await chromium.launch(); const blocked = [];
  const watch = async (ctx) => {
    await ctx.exposeBinding('cspBlocked', (_, v) => blocked.push(v));
    await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.cspBlocked(`${e.violatedDirective} → ${e.blockedURI || 'en línea'}`)));
  };
  { const ctx = await b.newContext(); await watch(ctx); const p = await ctx.newPage();
    await p.goto(base + 'login.html'); await p.waitForSelector('#login-form'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')), 'login.html tiene CSP'); await ctx.close(); }
  { const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } }); await install(ctx, '11111111-1111-1111-1111-111111111111'); await watch(ctx);
    const p = await ctx.newPage();
    await p.goto(base + 'index.html#planner'); await p.waitForSelector('#col1 .month'); await p.waitForTimeout(800);
    ok(await p.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')), 'index.html tiene CSP');
    await p.click('button.day[data-date="2026-11-17"]'); await p.click('.event:has-text("Dentista")'); await p.waitForTimeout(300);
    await p.click('#user-button'); await p.waitForTimeout(200); await p.keyboard.press('Escape');
    await p.goto(base + 'index.html#reports'); await p.waitForTimeout(500);
    await p.goto(base + 'index.html#report-activity'); await p.waitForSelector('#ra-rows tr'); await p.waitForTimeout(300);
    ok(true, 'recorrido: calendario, día, detalle, menú de usuario, informes e informe de actividad');
    await ctx.close(); }
  ok(blocked.length === 0, `la CSP no bloquea nada de la aplicación${blocked.length ? ': ' + [...new Set(blocked)].join(' | ') : ''}`);
  console.log(res.join('\n')); await b.close();
  process.exitCode = res.some((l) => l.startsWith('FALLO')) ? 1 : 0;
})().catch((e) => { console.log(res.join('\n')); console.log('PARADA:', e.message.split('\n')[0]); process.exit(1); });
