/*
 * Cargador de pantallas.
 *
 * Cada pantalla <id> declarada en FP_CONFIG.views tiene tres ficheros:
 *   views/<id>.html        marcado; el elemento raíz de la pantalla lleva el atributo data-view-root
 *   css/views/<id>.css     estilos propios
 *   js/views/<id>.js       lógica; registra FP.views[<id>] = { mount(root), show(), hide() }
 *
 * La pantalla se elige con el hash de la dirección (#planner, #reports…).
 * La primera vez que se abre, se descargan sus ficheros y se llama a mount(root);
 * después solo se oculta y se muestra, así conserva su estado al volver a ella.
 */
window.FP = window.FP || {};
FP.views = FP.views || {};

FP.router = (() => {
  const cache = {};      // id → Promise<{ id, root, view, mounted }>
  let current = null;
  let request = 0;

  // Los estilos de la pantalla van justo detrás del último CSS de la página,
  // para que se apliquen en el mismo orden que si estuvieran escritos a mano.
  function loadCss(href) {
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = link.onerror = () => resolve();
      const sheets = document.querySelectorAll('link[rel="stylesheet"]');
      sheets[sheets.length - 1].after(link);
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se ha podido cargar ' + src));
      document.body.append(script);
    });
  }

  async function load(id, outlet) {
    const [html] = await Promise.all([
      fetch(`views/${id}.html`).then((r) => {
        if (!r.ok) throw new Error(`No se ha podido cargar views/${id}.html (${r.status})`);
        return r.text();
      }),
      loadCss(`css/views/${id}.css`)
    ]);
    await loadScript(`js/views/${id}.js`);

    // Se busca la raíz por su atributo: quien sirve el fichero (por ejemplo, el visor de
    // artifacts) puede añadirle sus propias etiquetas antes o después del marcado.
    const template = document.createElement('template');
    template.innerHTML = html;
    const root = template.content.querySelector('[data-view-root]');
    if (!root) throw new Error(`views/${id}.html no tiene ningún elemento con data-view-root`);
    root.hidden = true;
    outlet.append(root);
    return { id, root, view: FP.views[id] || {}, mounted: false };
  }

  return {
    /**
     * @param outlet    elemento donde se insertan las pantallas
     * @param ids       ids de las pantallas, en orden (la primera es la de inicio)
     * @param onChange  se llama con el id de la pantalla elegida (para marcar el menú)
     */
    start(outlet, ids, onChange) {
      const resolve = () => {
        const id = location.hash.slice(1);
        return ids.includes(id) ? id : ids[0];
      };

      const go = async () => {
        const id = resolve();
        const mine = ++request;
        onChange(id);

        let entry;
        try {
          entry = await (cache[id] ||= load(id, outlet));
        } catch (err) {
          delete cache[id];
          console.error(err);
          if (FP.toast) FP.toast('No se ha podido abrir la pantalla');
          return;
        }
        if (mine !== request) return;   // mientras cargaba, se eligió otra pantalla

        if (current && current !== entry) {
          current.root.hidden = true;
          current.view.hide?.();
        }
        entry.root.hidden = false;
        if (!entry.mounted) {
          entry.mounted = true;
          entry.view.mount?.(entry.root);
        }
        entry.view.show?.();
        current = entry;
      };

      window.addEventListener('hashchange', go);
      go();
    }
  };
})();
