/*
 * Utilidades de fechas y horas compartidas por las pantallas.
 *   FP.time.toMin('09:15')            → 555 (minutos desde las 00:00)
 *   FP.time.formatDate('2026-11-06')  → '06/11/2026'
 */
window.FP = window.FP || {};

FP.time = {
  toMin(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  },

  formatDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
};
