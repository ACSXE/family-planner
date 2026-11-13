// Edge function "leisure-events": planes de la agenda de Madrid para un día. Lo lanza tests/run.sh.
import { call, mod, stats, setAgendaFail } from './leisure.mjs';
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
try {
  // Acceso
  ok((await call({ date: '2026-11-21' }, { token: null })).status === 401, 'sin sesión: 401');
  ok((await call({ date: '2026-11-21' }, { token: 'anon-key' })).status === 401, 'con la clave pública (anon) en vez de una sesión: 401');
  const pre = await call(null, { method: 'OPTIONS', token: null });
  ok(pre.status === 200 && pre.headers.get('access-control-allow-origin') === '*', 'responde a la comprobación CORS del navegador');
  ok((await call({ date: '21/11/2026' })).status === 400 && (await call({})).status === 400, 'fecha mal escrita o sin fecha: 400');

  // Eventos del sábado 21/11/2026 (muestra real de la agenda)
  const r = await call({ date: '2026-11-21' });
  const ev = r.body.events; const t = (s) => ev.find((e) => e.title.startsWith(s));
  ok(r.status === 200 && ev.length === 14, `21/11/2026: 14 eventos (${ev.length})`);
  ok(ev.filter((e) => e.kids).length === 7, `7 para niños o familias (${ev.filter((e) => e.kids).length})`);
  ok(ev.filter((e) => e.until).length === 6, `6 de varios días, marcados con "until" (${ev.filter((e) => e.until).length})`);
  const times = ev.map((e) => e.time || '99:99');
  ok(times.every((x, i) => !i || times[i - 1] <= x), 'ordenados por hora, los de "horario en la web" al final');
  ok(!t('Bellotada'), 'un evento del día siguiente no sale');
  ok(!ev.some((e) => e.title.startsWith('Ciclo de conferencias')), 'un evento que solo se celebra los martes no sale un sábado');
  ok(ev.filter((e) => e.title.startsWith('Actividades mensuales')).length === 1, 'días excluidos y "no abre sábados": solo queda el que abre ese día');
  ok(t('19ª edición')?.until === '2026-11-22' && t('19ª edición')?.time === '', 'evento de varios días sin hora: "until" y sin hora');
  const libros = t('CREA TUS PROPIOS LIBROS');
  ok(libros && libros.time === '12:00' && libros.end === '' && libros.price === 'Gratuito' && libros.kids, `"Crea tus propios libros": 12:00 (sin hora de fin), gratuito, para niños`);
  ok(libros?.adults === true && t('Anatola')?.adults === false && t('Aplausos')?.adults === true, 'adultos: público juvenil o general, o sin público indicado; "Infantil" no');
  ok(!('accessibility' in libros), 'sin el dato de accesibilidad');
  ok(libros?.type === 'Cuentacuentos, títeres y marionetas' && libros?.kind === 'teatro', `tipo legible e imagen: ${libros?.type} / ${libros?.kind}`);
  ok(/^Calle Concepcion Jeronima 15, 28012 Madrid$/i.test(libros?.address || ''), `dirección: ${libros?.address}`);
  ok(libros?.url.startsWith('https://www.madrid.es/'), 'enlace "+ información" a madrid.es por https');
  ok(ev.every((e) => e.url === '' || e.url.startsWith('https://www.madrid.es/')), 'ningún enlace fuera de madrid.es');
  ok(ev.every((e) => !/\s{2}/.test(e.description)), 'descripciones sin espacios repetidos');

  // Funciones sueltas
  ok(mod.happensOn({ dtstart: '2026-11-01 00:00:00.0', dtend: '2026-11-30 23:59:00.0', recurrence: { days: 'SA,SU' }, 'excluded-days': '21/11/2026;' }, '2026-11-21') === false, 'día excluido: no se celebra');
  ok(mod.happensOn({ dtstart: '2026-11-01 00:00:00.0', dtend: '2026-11-30 23:59:00.0', recurrence: { days: 'SA,SU' }, 'excluded-days': '1;2;22/11/2026' }, '2026-11-21') === true, 'días excluidos mal escritos: se ignoran los trozos raros');
  ok(mod.toPlan({ '@type': 'https://datos.madrid.es/egob/kos/actividades/ExposicionesTemporales', free: 0, price: '', link: 'javascript:alert(1)' }).type === 'Exposiciones temporales', 'tipo desconocido: se separa en palabras');
  ok(mod.toPlan({ link: 'javascript:alert(1)' }).url === '' && mod.toPlan({ link: 'https://otra.web/x' }).url === '', 'enlaces que no son de madrid.es se descartan');
  ok(mod.toPlan({ free: 0, price: '' }).price === 'Consultar en la web', 'sin precio: "Consultar en la web"');
  ok(mod.toPlan({ time: '00:00', dtstart: '2026-11-21 00:00:00.0', dtend: '2026-11-21 23:59:00.0' }).time === '', 'hora 00:00: por determinar');
  const withEnd = mod.toPlan({ time: '18:00', dtstart: '2026-11-21 18:00:00.0', dtend: '2026-11-21 19:30:00.0' });
  ok(withEnd.end === '19:30' && mod.toPlan({ time: '18:00', dtstart: '2026-11-21 18:00:00.0', dtend: '2026-11-21 23:59:00.0' }).end === '', 'hora de fin solo si la agenda la trae (23:59 = sin hora de fin)');

  // La agenda se descarga una vez y se reutiliza; si Madrid falla se usa la copia anterior
  const before = stats.agenda; await call({ date: '2026-11-22' });
  ok(stats.agenda === before, `segunda consulta sin volver a descargar (${stats.agenda} descarga)`);
  setAgendaFail(true);
  ok((await call({ date: '2026-11-21' })).status === 200, 'si Madrid no responde, sigue sirviendo la copia guardada');
} catch (e) { res.push('PARADA: ' + e.message); }
console.log(res.join('\n'));
process.exitCode = res.some((l) => /^(FALLO|PARADA)/.test(l)) ? 1 : 0;
