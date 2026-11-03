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
    // El "id" no se cambia para que las actividades ya guardadas sigan asociadas a cada persona
    { id: 'papa',   name: 'Alberto', color: '#4fb3e8' }, // azul cielo
    { id: 'mama',   name: 'Laura',   color: '#d4a5a5' }, // rosa palo
    { id: 'hijo1',  name: 'Sergio',  color: '#dc2626' }, // rojo
    { id: 'hijo2',  name: 'Pablo',   color: '#eab308' }  // amarillo
  ],

  // Hora a la que se posiciona la vista diaria al abrir un día
  scrollToHour: 8
};
