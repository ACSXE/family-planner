/*
 * Almacenamiento de actividades en localStorage (solo en este navegador).
 * Cada usuario tiene su propia agenda: clave "fp.events.<usuario>".
 *   FP.storage.migrate()                    → borra los datos de versiones anteriores (una sola vez)
 *   FP.storage.loadEvents(username)         → lista de actividades
 *   FP.storage.saveEvents(username, events) → guarda (lanza un error si el navegador no deja)
 */
window.FP = window.FP || {};

FP.storage = (() => {
  const DATA_VERSION = '3';   // al subir este número se borran las actividades guardadas
  const key = (username) => 'fp.events.' + username;

  return {
    migrate() {
      try {
        if (localStorage.getItem('fp.dataVersion') !== DATA_VERSION) {
          Object.keys(localStorage).filter((k) => k.startsWith('fp.events')).forEach((k) => localStorage.removeItem(k));
          localStorage.setItem('fp.dataVersion', DATA_VERSION);
        }
      } catch { /* almacenamiento no disponible */ }
    },

    loadEvents(username) {
      try { return JSON.parse(localStorage.getItem(key(username))) || []; } catch { return []; }
    },

    saveEvents(username, events) {
      localStorage.setItem(key(username), JSON.stringify(events));
    }
  };
})();
