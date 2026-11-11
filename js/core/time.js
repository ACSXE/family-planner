/*
 * Utilidades de fechas y horas compartidas por las pantallas.
 *   FP.time.toMin('09:15')            → 555 (minutos desde las 00:00)
 *   FP.time.formatDate('2026-11-06')  → '06/11/2026'
 *   FP.time.formatDateOf(timestamp)   → fecha local de un instante ('2026-11-09T23:30:00Z' → '10/11/2026' en Madrid)
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
  },
  formatDateOf(timestamp) {
    const t = new Date(timestamp);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(t.getDate())}/${p(t.getMonth() + 1)}/${t.getFullYear()}`;
  }
};
