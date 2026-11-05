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
    { username: 'alberto_carrasco_sanchez@hotmail.com', password: 'alberto#01', name: 'Alberto Carrasco' },
    { username: 'laura_clc@hotmail.com',                password: 'laura#02',   name: 'Laura Liz' }
  ],

  members: [
    // canAccompany: aparece en el desplegable "Acompañante"
    // needsCompanion: si asiste, el campo "Acompañante" es obligatorio
    // Las actividades guardan el "id": si se cambia, dejan de estar asociadas a esa persona
    { id: 'alberto', name: 'Alberto', color: '#4fb3e8', canAccompany: true },   // azul cielo
    { id: 'laura',   name: 'Laura',   color: '#86d19a', canAccompany: true },   // verde clarito
    { id: 'sergio',  name: 'Sergio',  color: '#dc2626', needsCompanion: true }, // rojo
    { id: 'pablo',   name: 'Pablo',   color: '#eab308', needsCompanion: true }  // amarillo
  ],

  // Pantallas del menú lateral, en orden (la primera es la de inicio).
  // Cada pantalla <id> tiene sus ficheros: views/<id>.html, css/views/<id>.css y js/views/<id>.js
  // "icon" es el id de un icono del bloque de iconos de index.html
  views: [
    { id: 'planner', label: 'Calendario', icon: 'i-planner' },
    { id: 'reports', label: 'Informes',   icon: 'i-report' }
  ],

  // Hora a la que se posiciona la vista diaria al abrir un día
  scrollToHour: 8
};
