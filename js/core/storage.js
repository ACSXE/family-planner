/*
 * Actividades guardadas en Supabase (tabla "activities", ver supabase/schema.sql).
 * La agenda es compartida: todos ven todas las actividades, pero solo quien la creó
 * puede modificarla o eliminarla (lo garantizan las reglas de la base de datos).
 *
 * Formato de una actividad en la aplicación:
 *   { id, name, description, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM',
 *     attendees: ['alberto', …], companion: '' | 'laura' | 'alberto,laura', createdBy }
 *
 *   await FP.storage.list()            → todas las actividades, por fecha y hora
 *   await FP.storage.create(activity)  → la actividad creada
 *   await FP.storage.update(activity)  → la actividad modificada
 *   await FP.storage.remove(id)
 *   FP.storage.canEdit(activity)       → true si la creó el usuario de la sesión
 * Las funciones con await lanzan un Error con un mensaje en español si algo falla.
 */
window.FP = window.FP || {};

FP.storage = (() => {
  const COLUMNS = 'id, name, description, date, start_time, end_time, attendees, companion, created_by';

  const fromRow = (r) => ({
    id: r.id,
    name: r.name,
    description: r.description || '',
    date: r.date,
    start: r.start_time.slice(0, 5),
    end: r.end_time.slice(0, 5),
    attendees: r.attendees || [],
    companion: r.companion || '',
    createdBy: r.created_by
  });

  const toRow = (a) => ({
    name: a.name,
    description: a.description || '',
    date: a.date,
    start_time: a.start,
    end_time: a.end,
    attendees: a.attendees,
    companion: a.companion || ''
  });

  // Mensajes cortos: los de guardar y eliminar se ven en una línea bajo el título del detalle
  function fail(error, message) {
    console.error(error);
    throw new Error(message);
  }

  // Restos de la versión anterior, que guardaba las actividades en este navegador
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('fp.')).forEach((k) => localStorage.removeItem(k));
  } catch { /* almacenamiento no disponible */ }

  return {
    async list() {
      const { data, error } = await FP.db.from('activities').select(COLUMNS)
        .order('date').order('start_time');
      if (error) fail(error, 'No se han podido cargar las actividades. Comprueba la conexión.');
      return data.map(fromRow);
    },

    async create(activity) {
      const { data, error } = await FP.db.from('activities').insert(toRow(activity)).select(COLUMNS).single();
      if (error) fail(error, 'Error al guardar. Revisa la conexión');
      return fromRow(data);
    },

    async update(activity) {
      const { data, error } = await FP.db.from('activities').update(toRow(activity))
        .eq('id', activity.id).select(COLUMNS);
      if (error) fail(error, 'Error al guardar. Revisa la conexión');
      if (!data.length) throw new Error('Solo quien la creó puede modificarla');
      return fromRow(data[0]);
    },

    async remove(id) {
      const { data, error } = await FP.db.from('activities').delete().eq('id', id).select('id');
      if (error) fail(error, 'Error al eliminar. Revisa la conexión');
      if (!data.length) throw new Error('Solo quien la creó puede eliminarla');
    },

    canEdit(activity) {
      return !activity.id || activity.createdBy === FP.session.user?.id;
    }
  };
})();
