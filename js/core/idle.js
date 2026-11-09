/*
 * Cierre de sesión por inactividad (lo arranca js/shell.js).
 *   FP.idle.start({ minutes, warningSeconds, onLogout })
 *
 * Cuenta el tiempo desde la última actividad (clic o toque, tecla, rueda, movimiento
 * del ratón o desplazamiento) comparando con la hora real: así también funciona si
 * el navegador "duerme" la pestaña o el móvil bloquea la pantalla.
 *   · Antes del cierre aparece el aviso #idle-dialog (index.html) con cuenta atrás,
 *     "Seguir conectado" y "Cerrar sesión". Mientras se ve, la actividad de fondo no cuenta.
 *   · Al llegar al límite se cierra la sesión y se llama a onLogout('inactividad').
 */
window.FP = window.FP || {};

FP.idle = (() => {
  const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];

  function start({ minutes, warningSeconds = 60, onLogout }) {
    const limit = minutes * 60 * 1000;
    // El aviso nunca ocupa más de la mitad del tiempo (con 1 minuto: aviso a los 30 s)
    const warn = Math.min(warningSeconds * 1000, limit / 2);
    const dialog = document.getElementById('idle-dialog');
    const countdown = document.getElementById('idle-countdown');
    const stay = document.getElementById('idle-stay');
    const leave = document.getElementById('idle-logout');
    const box = dialog.querySelector('.modal__box');
    let last = Date.now();
    let ended = false;

    const warning = () => !dialog.hidden;
    // Cuenta atrás con su unidad: "45 segundos", "1 segundo"; si pasa de un minuto, "1:30 min"
    const format = (ms) => {
      const s = Math.max(0, Math.ceil(ms / 1000));
      if (s > 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
      return `${s} ${s === 1 ? 'segundo' : 'segundos'}`;
    };

    function activity() {
      if (!warning()) last = Date.now();
    }

    function showWarning(remaining) {
      countdown.textContent = format(remaining);
      if (warning()) return;
      dialog.hidden = false;
      box.focus();   // el foco va al aviso (Intro = seguir conectado), sin marcar ningún botón
    }

    function keepAlive() {
      dialog.hidden = true;
      last = Date.now();
    }

    async function end(reason) {
      if (ended) return;
      ended = true;
      clearInterval(timer);
      await FP.session.end();
      onLogout(reason);
    }

    function check() {
      if (ended) return;
      const idle = Date.now() - last;
      if (idle >= limit) end('inactividad');
      else if (idle >= limit - warn) showWarning(limit - idle);
    }

    ACTIVITY.forEach((type) => window.addEventListener(type, activity, { capture: true, passive: true }));
    // Al volver a la pestaña o desbloquear el móvil se comprueba enseguida
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    const timer = setInterval(check, 1000);

    stay.addEventListener('click', keepAlive);
    leave.addEventListener('click', () => end('manual'));

    // Con el aviso abierto el teclado solo actúa sobre él: Escape (o Intro con el foco en el
    // aviso) = seguir conectado, y el tabulador se queda dentro del aviso
    window.addEventListener('keydown', (e) => {
      if (!warning()) return;
      if (e.key === 'Escape' || (e.key === 'Enter' && document.activeElement === box)) {
        e.preventDefault(); e.stopImmediatePropagation(); keepAlive(); return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === leave ? stay : leave).focus();
      }
    }, true);
  }

  return { start };
})();
