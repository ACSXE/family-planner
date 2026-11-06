/*
 * Family Planner — configuración
 * --------------------------------
 * Los usuarios y sus contraseñas se gestionan en Supabase (Authentication → Users),
 * no en este fichero.
 */
const FP_CONFIG = {
  // Proyecto de Supabase. La clave "publishable" está pensada para ir en el navegador:
  // los datos los protegen las reglas de acceso de la base de datos (supabase/schema.sql).
  supabase: {
    url: 'https://hdzeibaonokdcicqmuzw.supabase.co',
    publishableKey: 'sb_publishable_9k9SgCiHv4Y4eCDLstt2Kg_CKGLNiRO'
  },

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
