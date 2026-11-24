/**
 * Barra de cámaras de la cabecera (todas las pantallas): un chip por cámara. En una pantalla de cámara, al pulsar otra
 * se abre la misma sección (directo, Ajustes/Info, configuración de un bloque o grabaciones SD) de la nueva cámara;
 * fuera de ellas abre el directo de la cámara elegida.
 */
(function(){
  const box = document.getElementById('topcams'); if (!box) return;
  const cur = box.dataset.cam || '';
  /** URL equivalente a la actual pero para la cámara nuevaId. */
  function destino(nuevaId){
    if (!cur) return '/camara/' + nuevaId;
    const path = location.pathname.replace(cur, nuevaId);
    if (/\/config\/?$/.test(path)) return path + location.search;                  // mismo bloque
    if (/\/sd\/?$/.test(path)) return path;                                        // grabaciones SD (sin hora concreta)
    const tb = document.body.dataset.tab, ct = document.body.dataset.cat;          // directo: conserva la pestaña y la categoría de ajustes
    return path + (tb && tb !== 'camaras' ? '?tab=' + tb + (tb === 'ajustes' && ct ? '&cat=' + ct : '') : '');
  }
  fetch('/api/camaras').then(r => r.json()).then(r => {
    const cams = r.camaras || []; if (!cams.length) return;
    box.innerHTML = cams.map(c => `<a class="chip${c.id === cur ? ' sel' : ''}" data-id="${XM.esc(c.id)}" href="/camara/${XM.esc(c.id)}">${XM.esc(c.nombre)}</a>`).join('');
    box.querySelectorAll('a').forEach(a => a.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;                // permite abrir en pestaña nueva
      e.preventDefault(); if (a.dataset.id !== cur) location.href = destino(a.dataset.id);
    }));
    const sel = box.querySelector('.sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
  }).catch(() => {});
})();
