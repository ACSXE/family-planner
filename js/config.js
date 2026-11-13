/*
 * Family Planner — configuración
 * --------------------------------
 * Los usuarios y sus contraseñas se gestionan en Supabase (Authentication → Users),
 * y los miembros de la familia en la tabla "family_members": no en este fichero.
 */
const FP_CONFIG = {
  // Proyecto de Supabase. La clave "publishable" está pensada para ir en el navegador:
  // los datos los protegen las reglas de acceso de la base de datos (supabase/migrations/).
  supabase: {
    url: 'https://hdzeibaonokdcicqmuzw.supabase.co',
    publishableKey: 'sb_publishable_9k9SgCiHv4Y4eCDLstt2Kg_CKGLNiRO'
  },

  // Los miembros de la familia (nombre, color, quién puede acompañar y quién necesita
  // acompañante) están en la tabla "family_members" de Supabase.

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

  // Ventana "Ocio y Tiempo Libre" (botón de "Nueva actividad" en Calendario): de dónde salen los planes.
  //   'local'    → fichero data/leisure-events.json, una copia de la agenda de Madrid
  //                (se regenera con tools/build-leisure-data.mjs; no se actualiza sola)
  //   'supabase' → edge function leisure-events, con la agenda al día (hay que desplegarla antes)
  leisure: { source: 'local' },

  // Cierre de sesión por inactividad: minutos sin usar la aplicación y segundos de aviso previo
  // (el aviso dura como mucho la mitad del tiempo): a los 9 minutos sin actividad sale el aviso de 60 s.
  idle: { minutes: 10, warningSeconds: 60 },

  // Hora a la que se posiciona la vista diaria al abrir un día
  scrollToHour: 8
};
