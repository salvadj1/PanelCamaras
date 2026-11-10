/**
 * Zoom digital del vídeo en directo: acerca la imagen en el navegador (no mueve la cámara), así que funciona
 * con cualquier cámara, tenga o no zoom óptico. Rueda del ratón, pellizco con dos dedos, arrastre para moverse
 * cuando hay zoom, doble toque/clic para alternar 1× ↔ 2,5×, y botones de acercar/alejar.
 * Reutilizable: XmDZoom.crear(contenedor, [elementos a escalar], alCambiar).
 */
const XmDZoom = (() => {
  /**
   * @param {HTMLElement} caja Contenedor que recibe los gestos (el reproductor).
   * @param {HTMLElement[]} medios Elementos que se escalan (vídeo y/o imagen).
   * @param {function(number)} [alCambiar] Se llama con el zoom actual (1 = sin zoom).
   * @returns {{acercar:function, alejar:function, reset:function, mantener:function, soltar:function, zoom:function}}
   */
  function crear(caja, medios, alCambiar){
    const MAX = 8, ptrs = new Map();
    let z = 1, tx = 0, ty = 0, timer = null, tap = null, ultimoTap = 0;

    const dim = () => ({ w: caja.clientWidth, h: caja.clientHeight });

    /** Limita el desplazamiento para que la imagen no deje huecos y aplica la transformación. */
    function aplicar(){
      const { w, h } = dim(), mx = (z - 1) * w / 2, my = (z - 1) * h / 2;
      tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
      const t = z === 1 ? '' : `translate(${tx}px,${ty}px) scale(${z})`;
      medios.forEach(m => { m.style.transformOrigin = '50% 50%'; m.style.transform = t; });
      if (alCambiar) alCambiar(z);
    }

    /** Multiplica el zoom por f manteniendo quieto el punto (px, py) (coordenadas dentro de la caja). */
    function zoomEn(f, px, py){
      const { w, h } = dim(), nz = Math.max(1, Math.min(MAX, z * f)); f = nz / z;
      const cx = px - w / 2, cy = py - h / 2;
      tx = cx - f * (cx - tx); ty = cy - f * (cy - ty); z = nz; aplicar();
    }
    const centro = f => zoomEn(f, caja.clientWidth / 2, caja.clientHeight / 2);
    const reset = () => { z = 1; tx = 0; ty = 0; aplicar(); };

    caja.style.touchAction = 'none';
    caja.addEventListener('wheel', e => {
      e.preventDefault();
      const r = caja.getBoundingClientRect();
      zoomEn(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const medio = () => { const [a, b] = [...ptrs.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

    caja.addEventListener('pointerdown', e => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { caja.setPointerCapture(e.pointerId); } catch (_) {}
      tap = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    });
    caja.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
      if (ptrs.size === 1){
        if (z > 1){ tx += e.clientX - p.x; ty += e.clientY - p.y; aplicar(); }
        p.x = e.clientX; p.y = e.clientY;
      } else if (ptrs.size === 2){
        const d0 = dist(), m0 = medio();
        p.x = e.clientX; p.y = e.clientY;
        const d1 = dist(), m1 = medio(), r = caja.getBoundingClientRect();
        if (d0 > 0) zoomEn(d1 / d0, m1.x - r.left, m1.y - r.top);
        tx += m1.x - m0.x; ty += m1.y - m0.y; aplicar();
      }
    });
    const fin = e => {
      ptrs.delete(e.pointerId);
      // doble toque / doble clic: alterna entre sin zoom y 2,5×
      if (e.type === 'pointerup' && tap && performance.now() - tap.t < 300){
        const ahora = performance.now(), r = caja.getBoundingClientRect();
        if (ahora - ultimoTap < 350){ ultimoTap = 0; if (z > 1) reset(); else zoomEn(2.5, e.clientX - r.left, e.clientY - r.top); }
        else ultimoTap = ahora;
      }
      tap = null;
    };
    caja.addEventListener('pointerup', fin);
    caja.addEventListener('pointercancel', fin);
    window.addEventListener('resize', aplicar);

    return {
      acercar: () => centro(1.5), alejar: () => centro(1 / 1.5), reset,
      /** Zoom continuo mientras se mantiene pulsado un botón: dir = 1 acerca, -1 aleja. */
      mantener: dir => { clearInterval(timer); timer = setInterval(() => centro(dir > 0 ? 1.04 : 1 / 1.04), 40); },
      soltar: () => { clearInterval(timer); timer = null; },
      zoom: () => z
    };
  }
  return { crear };
})();
