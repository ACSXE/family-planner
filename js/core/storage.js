/*
 * Actividades guardadas en Supabase (ver supabase/migrations/002_family_members.sql):
 *   activities           → la actividad (activity_id, nombre, fecha, horas, created_by)
 *   activity_attendees   → sus asistentes (un member_id por fila)
 *   activity_companions  → sus acompañantes (un member_id por fila)
 * Para crear o modificar se usa la función save_activity(), que guarda las tres cosas
 * de una vez y comprueba las reglas (asistentes, acompañante obligatorio, quién la creó).
 *
 * Formato de una actividad en la aplicación (los miembros son member_id numéricos):
 *   { id, name, description, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM',
 *     attendees: [1, 4], companions: [2], createdBy: 1 }
 *
 *   await FP.storage.list()            → todas las actividades, por fecha y hora
 *   await FP.storage.create(activity)  → la actividad creada
 *   await FP.storage.update(activity)  → la actividad modificada
 *   await FP.storage.remove(id)
 *   FP.storage.canEdit(activity)       → true si la creó el usuario de la sesión
 * Las funciones con await lanzan un Error con un mensaje corto en español si algo falla.
 */
window.FP = window.FP || {};

FP.storage = (() => {
  const COLUMNS = 'activity_id, name, description, date, start_time, end_time, created_by, ' +
    'activity_attendees(member_id), activity_companions(member_id)';

  const ids = (rows) => (rows || []).map((r) => r.member_id).sort((a, b) => a - b);

  const fromRow = (r) => ({
    id: r.activity_id,
    name: r.name,
    description: r.description || '',
    date: r.date,
    start: r.start_time.slice(0, 5),
    end: r.end_time.slice(0, 5),
    attendees: ids(r.activity_attendees),
    companions: ids(r.activity_companions),
    createdBy: r.created_by
  });

  // Errores de save_activity(): las reglas de la base de datos traen su propio mensaje
  function saveError(error) {
    console.error(error);
    if (error.code === '42501') return new Error('Solo quien la creó puede modificarla');
    if (error.code === 'P0001') return new Error(error.message);
    return new Error('Error al guardar. Revisa la conexión');
  }

  async function save(a) {
    const { data: id, error } = await FP.db.rpc('save_activity', {
      p_activity_id: a.id || null,
      p_name: a.name,
      p_description: a.description || '',
      p_date: a.date,
      p_start_time: a.start,
      p_end_time: a.end,
      p_attendees: a.attendees,
      p_companions: a.companions
    });
    if (error) throw saveError(error);
    const { data, error: readError } = await FP.db.from('activities').select(COLUMNS).eq('activity_id', id).single();
    if (readError) throw saveError(readError);
    return fromRow(data);
  }

  // Restos de la versión anterior, que guardaba las actividades en este navegador
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('fp.')).forEach((k) => localStorage.removeItem(k));
  } catch { /* almacenamiento no disponible */ }

  return {
    async list() {
      const { data, error } = await FP.db.from('activities').select(COLUMNS)
        .order('date').order('start_time');
      if (error) {
        console.error(error);
        throw new Error('No se han podido cargar las actividades. Comprueba la conexión.');
      }
      return data.map(fromRow);
    },

    create: save,
    update: save,

    async remove(id) {
      const { data, error } = await FP.db.from('activities').delete().eq('activity_id', id).select('activity_id');
      if (error) {
        console.error(error);
        throw new Error('Error al eliminar. Revisa la conexión');
      }
      if (!data.length) throw new Error('Solo quien la creó puede eliminarla');
    },

    canEdit(activity) {
      return !activity.id || activity.createdBy === FP.session.user?.memberId;
    }
  };
})();
