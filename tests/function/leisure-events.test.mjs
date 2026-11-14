// Edge function "leisure-events": prepara la agenda de Madrid y la guarda en leisure_days (migración 008).
// La agenda es una muestra real (fixtures/agenda-madrid.json). Lo lanza tests/run.sh.
import { call, mod, stats, sql, fixture, setAgendaFail, setSaveFail } from './leisure.mjs';
const res = []; const ok = (c, m) => res.push(`${c ? 'OK   ' : 'FALLO'} ${m}`);
console.error = console.warn = console.log = () => {};
const table = () => sql(`select coalesce(json_agg(json_build_object('date', date, 'n', jsonb_array_length(plans), 'at', updated_at) order by date), '[]') from public.leisure_days`);
try {
  // Acceso: solo el cron (cabecera x-cron-secret)
  ok((await call({}, { secret: null })).status === 401 && (await call({}, { secret: 'otra' })).status === 401, 'sin la contraseña del cron (o con otra): 401');
  ok((await call({}, { method: 'GET' })).status === 405, 'GET: 405');

  // Prueba sin guardar
  const dry = await call({ dry_run: true, from: '2026-11-21' });
  ok(dry.status === 200 && dry.body.days === 2 && dry.body.plans === 10 && dry.body.until === '2026-11-22' && dry.body.saved === false, `dry_run: cuenta sin guardar (${JSON.stringify(dry.body)})`);
  ok(table().length === 0, 'dry_run no toca la tabla');

  // Guardar. La primera descarga falla: se reintenta
  setAgendaFail(1); const before = stats.agenda;
  const r = await call({ from: '2026-11-21' });
  ok(r.status === 200 && r.body.saved === true && stats.agenda - before === 2, `si la primera descarga de Madrid falla, se reintenta y se guarda (${stats.agenda - before} descargas)`);
  const t1 = table();
  ok(t1.length === 2 && t1[0].date === '2026-11-21' && t1[0].n === 9 && t1[1].n === 1, `tabla: 21/11 con 9 planes y 22/11 con 1 (${JSON.stringify(t1.map((d) => [d.date, d.n]))})`);

  // Desde otro día: los días anteriores desaparecen
  await call({ from: '2026-11-22' });
  ok(table().map((d) => d.date).join() === '2026-11-22', 'al actualizar, los días pasados se borran');

  // Si Madrid no responde en ningún intento, o no trae planes, o falla al guardar: la tabla no cambia
  const kept = JSON.stringify(table());
  setAgendaFail(2);
  const down = await call({ from: '2026-11-21' });
  ok(down.status === 502 && down.body.saved === false && JSON.stringify(table()) === kept, 'Madrid no responde en los 2 intentos: 502 y la tabla sigue como estaba');
  const empty = await call({ from: '2027-06-01' });
  ok(empty.status === 502 && empty.body.saved === false && JSON.stringify(table()) === kept, 'la agenda llega sin planes: 502 y la tabla sigue como estaba');
  setSaveFail(true);
  const nosave = await call({ from: '2026-11-21' });
  ok(nosave.status === 500 && nosave.body.saved === false && JSON.stringify(table()) === kept, 'falla al guardar: 500 y la tabla sigue como estaba');
  setSaveFail(false);

  // Los planes de un día (misma preparación que guarda la función)
  const events = JSON.parse(fixture)['@graph'];
  const ev = mod.daysFrom(events, '2026-11-01')['2026-11-21']; const t = (s) => ev.find((e) => e.title.startsWith(s));
  ok(ev.length === 9, `21/11/2026: 9 eventos de un solo día (${ev.length})`);
  ok(ev.filter((e) => e.kids).length === 5, `5 para niños o familias (${ev.filter((e) => e.kids).length})`);
  ok(!t('19ª edición') && !t('Alicia') && !t('Artemisia') && !ev.some((e) => e.title.startsWith('Actividades mensuales')), 'los eventos de varios días (exposiciones, ciclos, festivales) no salen');
  ok(t('Entrega de premios')?.time === '', 'evento de un día sin hora: hora por determinar');
  const times = ev.map((e) => e.time || '99:99');
  ok(times.every((x, i) => !i || times[i - 1] <= x), 'ordenados por hora, los de "horario en la web" al final');
  ok(!t('Bellotada'), 'un evento del día siguiente no sale');
  ok(!ev.some((e) => e.title.startsWith('Ciclo de conferencias')), 'un evento que solo se celebra los martes no sale un sábado');
  const libros = t('CREA TUS PROPIOS LIBROS');
  ok(libros && libros.time === '12:00' && libros.end === '' && libros.price === 'Gratuito' && libros.kids, `"Crea tus propios libros": 12:00 (sin hora de fin), gratuito, para niños`);
  ok(libros?.kids === true && t('Anatola')?.kids === true && t('Aplausos')?.kids === false, 'niños: público infantil o familiar (aunque también sea juvenil); el resto, adultos');
  ok(!('until' in libros) && !('adults' in libros), 'sin datos que la ventana no usa');
  ok(!('accessibility' in libros), 'sin el dato de accesibilidad');
  ok(libros?.type === 'Cuentacuentos, títeres y marionetas' && libros?.kind === 'teatro', `tipo legible e imagen: ${libros?.type} / ${libros?.kind}`);
  ok(/^Calle Concepcion Jeronima 15, 28012 Madrid$/i.test(libros?.address || ''), `dirección: ${libros?.address}`);
  ok(libros?.url.startsWith('https://www.madrid.es/'), 'enlace "+ información" a madrid.es por https');
  ok(ev.every((e) => e.url === '' || e.url.startsWith('https://www.madrid.es/')), 'ningún enlace fuera de madrid.es');
  ok(ev.every((e) => !/\s{2}/.test(e.description)), 'descripciones sin espacios repetidos');

  // Funciones sueltas
  ok(mod.happensOn({ dtstart: '2026-11-01 00:00:00.0', dtend: '2026-11-30 23:59:00.0', recurrence: { days: 'SA,SU' }, 'excluded-days': '21/11/2026;' }, '2026-11-21') === false, 'día excluido: no se celebra');
  ok(mod.happensOn({ dtstart: '2026-11-01 00:00:00.0', dtend: '2026-11-30 23:59:00.0', recurrence: { days: 'TU' } }, '2026-11-21') === false, 'solo los martes: no se celebra un sábado');
  ok(mod.happensOn({ dtstart: '2026-11-01 00:00:00.0', dtend: '2026-11-30 23:59:00.0', recurrence: { days: 'SA,SU' }, 'excluded-days': '1;2;22/11/2026' }, '2026-11-21') === true, 'días excluidos mal escritos: se ignoran los trozos raros');
  ok(mod.toPlan({ '@type': 'https://datos.madrid.es/egob/kos/actividades/ExposicionesTemporales', free: 0, price: '', link: 'javascript:alert(1)' }).type === 'Exposiciones temporales', 'tipo desconocido: se separa en palabras');
  ok(mod.toPlan({ link: 'javascript:alert(1)' }).url === '' && mod.toPlan({ link: 'https://otra.web/x' }).url === '', 'enlaces que no son de madrid.es se descartan');
  ok(mod.toPlan({ free: 0, price: '' }).price === 'Consultar en la web', 'sin precio: "Consultar en la web"');
  ok(mod.toPlan({ time: '00:00', dtstart: '2026-11-21 00:00:00.0', dtend: '2026-11-21 23:59:00.0' }).time === '', 'hora 00:00: por determinar');
  const withEnd = mod.toPlan({ time: '18:00', dtstart: '2026-11-21 18:00:00.0', dtend: '2026-11-21 19:30:00.0' });
  ok(withEnd.end === '19:30' && mod.toPlan({ time: '18:00', dtstart: '2026-11-21 18:00:00.0', dtend: '2026-11-21 23:59:00.0' }).end === '', 'hora de fin solo si la agenda la trae (23:59 = sin hora de fin)');

} catch (e) { res.push('PARADA: ' + e.message); }
console.log = (...a) => process.stdout.write(a.join(' ') + '\n');
console.log(res.join('\n'));
process.exitCode = res.some((l) => /^(FALLO|PARADA)/.test(l)) ? 1 : 0;
