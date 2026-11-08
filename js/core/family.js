/*
 * Miembros de la familia, leídos de la tabla "family_members" de Supabase
 * (ver supabase/migrations/002_family_members.sql). Se cargan una vez al arrancar
 * la aplicación (js/shell.js), antes de abrir ninguna pantalla.
 *
 *   await FP.family.load()
 *   FP.family.members                 → [{ id, name, fullName, color, canAccompany, needsCompanion }], por member_id
 *   FP.family.byId                    → { id: miembro }   (id = member_id, numérico)
 *   FP.family.companions              → personas que pueden acompañar (canAccompany)
 *   FP.family.companionOptions        → opciones del desplegable "Acompañante" del Calendario:
 *                                       cada persona con canAccompany y, si hay más de una,
 *                                       la combinación ("Alberto y Laura"). value = ids separados por comas
 *   FP.family.companionsValue(ids)    → value de la opción que corresponde a esos ids ('' si ninguno)
 *   FP.family.companionLabel(ids)     → texto para esos ids ("Alberto y Laura"; '' si ninguno)
 */
window.FP = window.FP || {};

FP.family = (() => {
  const family = {
    members: [],
    byId: {},
    companions: [],
    companionOptions: [],

    async load() {
      const { data, error } = await FP.db.from('family_members')
        .select('member_id, name, full_name, color, can_accompany, needs_companion')
        .order('member_id');
      if (error) {
        console.error(error);
        throw new Error('No se han podido cargar los miembros de la familia. Comprueba la conexión.');
      }
      family.members = data.map((m) => ({
        id: m.member_id, name: m.name, fullName: m.full_name, color: m.color,
        canAccompany: m.can_accompany, needsCompanion: m.needs_companion
      }));
      family.byId = Object.fromEntries(family.members.map((m) => [m.id, m]));
      family.companions = family.members.filter((m) => m.canAccompany);
      family.companionOptions = family.companions.map((m) => ({ value: String(m.id), label: m.name }));
      if (family.companions.length > 1) {
        family.companionOptions.push({
          value: family.companionsValue(family.companions.map((m) => m.id)),
          label: family.companionLabel(family.companions.map((m) => m.id))
        });
      }
    },

    companionsValue(ids) {
      return [...ids].sort((a, b) => a - b).join(',');
    },

    companionLabel(ids) {
      const names = [...ids].sort((a, b) => a - b).map((id) => family.byId[id]?.name).filter(Boolean);
      return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0] || '';
    }
  };
  return family;
})();
