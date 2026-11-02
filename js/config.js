/*
 * Family Planner — configuración
 * --------------------------------
 * Edita aquí los usuarios que pueden entrar y los miembros de la familia.
 *
 * AVISO: esta versión es 100 % estática (sin servidor). Las credenciales viven
 * en este fichero y cualquiera que abra el código fuente puede leerlas. Sirve
 * para uso doméstico/demostración; para protegerlo de verdad hace falta validar
 * el login en un servidor.
 */
const FP_CONFIG = {
  users: [
    { username: 'familia', password: 'planner2026', name: 'Familia' }
  ],

  members: [
    { id: 'papa',   name: 'Papá',   color: '#2563eb' },
    { id: 'mama',   name: 'Mamá',   color: '#db2777' },
    { id: 'hijo1',  name: 'Hijo 1', color: '#16a34a' },
    { id: 'hijo2',  name: 'Hijo 2', color: '#ea580c' }
  ],

  // Hora a la que se posiciona la vista diaria al abrir un día
  scrollToHour: 8
};
