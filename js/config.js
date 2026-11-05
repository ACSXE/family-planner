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

  // Pantallas de la aplicación (la primera es la de inicio).
  // Cada pantalla <id> tiene sus ficheros: views/<id>.html, css/views/<id>.css y js/views/<id>.js
  // Con "label" e "icon" aparece en el menú lateral ("icon" es el id de un icono de index.html).
  // Con "parent" no aparece en el menú: mientras está abierta, el menú marca la pantalla "parent".
  views: [
    { id: 'planner',           label: 'Calendario', icon: 'i-planner' },
    { id: 'reports',           label: 'Informes',   icon: 'i-report' },
    { id: 'report-activity', parent: 'reports' }
  ],

  // Informes que se muestran como tarjetas en la pantalla Informes, en este orden.
  // "view" es la pantalla del informe (una de "views" con parent: 'reports').
  reports: [
    {
      view: 'report-activity',
      title: 'Informe de actividad',
      description: 'Consulta las actividades planificadas de la familia',
      icon: 'i-report-activity'
    }
  ],

  // Hora a la que se posiciona la vista diaria al abrir un día
  scrollToHour: 8
};
