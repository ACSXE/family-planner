/*
 * Utilidades de DOM compartidas por el armazón y las pantallas.
 *   FP.dom.$(id)                       → document.getElementById
 *   FP.dom.h(tag, attrs, ...children)  → crea un elemento con atributos e hijos
 */
window.FP = window.FP || {};

FP.dom = {
  $: (id) => document.getElementById(id),

  h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...children.flat().filter((c) => c != null));
    return el;
  }
};
