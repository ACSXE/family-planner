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
    // canAccompany: aparece en el desplegable "Acompañante"
    // needsCompanion: si asiste, el campo "Acompañante" es obligatorio
    // El "id" no se cambia para que las actividades ya guardadas sigan asociadas a cada persona
    { id: 'papa',   name: 'Alberto', color: '#4fb3e8', canAccompany: true }, // azul cielo
    { id: 'mama',   name: 'Laura',   color: '#d4a5a5', canAccompany: true }, // rosa palo
    { id: 'hijo1',  name: 'Sergio',  color: '#dc2626', needsCompanion: true }, // rojo
    { id: 'hijo2',  name: 'Pablo',   color: '#eab308', needsCompanion: true }  // amarillo
  ],

  // Hora a la que se posiciona la vista diaria al abrir un día
  scrollToHour: 8
};
