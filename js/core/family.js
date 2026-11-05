/*
 * Datos de la familia derivados de FP_CONFIG.members, compartidos por las pantallas.
 *   FP.family.members               → miembros, en el orden de config.js
 *   FP.family.byId                  → { id: miembro }
 *   FP.family.companionOptions      → opciones del desplegable "Acompañante":
 *                                     cada persona con canAccompany y, si hay más
 *                                     de una, la combinación ("Alberto y Laura")
 *   FP.family.companionLabel(value) → texto de una opción ('' si no hay acompañante)
 */
window.FP = window.FP || {};

FP.family = (() => {
  const members = FP_CONFIG.members;
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));

  const companions = members.filter((m) => m.canAccompany);
  const companionOptions = companions.map((m) => ({ value: m.id, label: m.name }));
  if (companions.length > 1) {
    companionOptions.push({
      value: companions.map((m) => m.id).join(','),
      label: companions.map((m) => m.name).join(', ').replace(/, ([^,]*)$/, ' y $1')
    });
  }
  const labels = Object.fromEntries(companionOptions.map((o) => [o.value, o.label]));

  return {
    members,
    byId,
    companionOptions,
    companionLabel: (value) => labels[value] || ''
  };
})();
