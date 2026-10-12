/**
 * Mosaico de cámaras (equivale a HomeScreen.kt): resumen, 4 distribuciones, estado en línea cada 4 s,
 * vista previa por captura cada 30 s, directo silenciado (stream SD) en las casillas, tocar = abrir directo,
 * mantener pulsado = borrar, última casilla = añadir cámara.
 */
(function(){
  const { $, esc, api, store, toast, confirmar } = XM;
  const LAYOUTS = [
    { label: 'Cuadrícula 2x2', span: 3, live: true },
    { label: 'Lista (1 columna)', span: 6, live: true },
    { label: 'Principal + miniaturas', span: 2, live: false },
    { label: 'Cuadrícula compacta (3 col.)', span: 2, live: false }
  ];
  let layout = Math.min(3, Math.max(0, parseInt(store.get('layout', '0')) || 0));
  let cams = [], video = { disponible: false, mensaje: '' }, featured = null, firma = '';
  const players = new Map();   // id -> XmLive
  const tiles = new Map();     // id -> {el, img, vid, dot, info}

  function pararTodos(){ players.forEach(p => p.stop()); players.clear(); }

  /** Dibuja el mosaico completo (solo cuando cambian cámaras, distribución o cámara principal). */
  function render(){
    pararTodos(); tiles.clear();
    const m = $('mosaico'); m.innerHTML = '';
    const L = LAYOUTS[layout];
    const main = cams.find(c => c.id === featured) || cams[0];
    const orden = (layout === 2 && main) ? [main, ...cams.filter(c => c.id !== main.id)] : cams;
    if (!cams.length) m.innerHTML = `<div class="card empty"><div style="font-size:17px">Añade tu primera cámara</div><p class="mut small">PanelCamaras busca cámaras en la red del servidor o puedes añadirlas con su IP.</p><a class="btn" href="/camaras/nueva" style="text-decoration:none;display:inline-block">Añadir cámara</a></div>`;
    orden.forEach(c => {
      const esMain = layout === 2 && main && c.id === main.id, secundaria = layout === 2 && !esMain;
      const el = document.createElement('div');
      el.className = 'tile' + (L.span === 2 && !esMain ? ' compact' : '');
      el.style.gridColumn = 'span ' + (esMain ? 6 : L.span);
      el.innerHTML = `<div class="nopic">Sin vista previa</div><img alt="" hidden><video muted playsinline autoplay hidden></video><span class="dot"></span><div class="tn">${esc(c.nombre)}</div>`;
      const t = { el, img: el.querySelector('img'), vid: el.querySelector('video'), dot: el.querySelector('.dot'), nopic: el.querySelector('.nopic'), live: esMain || L.live };
      tiles.set(c.id, t);
      // Tocar = abrir directo (en "principal + miniaturas" una miniatura sube a principal); pulsación larga = borrar.
      let timer = null, largo = false;
      const cancelar = () => { clearTimeout(timer); };
      el.addEventListener('pointerdown', () => { largo = false; timer = setTimeout(async () => {
        largo = true;
        if (await confirmar('Borrar cámara', `¿Borrar "${c.nombre}"?`, 'Borrar')){
          try { await api('/api/camaras/' + c.id, 'DELETE'); await refrescar(true); } catch (e) { toast(e.message); }
        }
      }, 650); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, cancelar));
      el.addEventListener('click', () => { if (largo) return; if (secundaria){ featured = c.id; render(); aplicarEstado(); } else location.href = '/camara/' + c.id; });
      m.appendChild(el);
    });
    const add = document.createElement('a');
    add.className = 'tile add'; add.href = '/camaras/nueva'; add.style.gridColumn = 'span ' + (layout === 2 ? 2 : L.span);
    add.innerHTML = '<div><b>+</b><span class="mut small">Añadir cámara</span></div>';
    m.appendChild(add);
    $('ayuda').hidden = !cams.length;
    $('ayuda').textContent = layout === 2
      ? 'Toca la principal para abrir el directo, una miniatura para ponerla de principal · mantén pulsado para borrar.'
      : 'Toca una cámara para abrir el directo · mantén pulsado para borrarla.';
  }

  /** Actualiza puntos de estado, vídeo en directo y resumen sin redibujar. */
  function aplicarEstado(){
    const on = cams.filter(c => c.online === true).length;
    $('kOn').textContent = on; $('kTot').textContent = cams.length;
    const av = $('avisoVideo');
    av.hidden = video.disponible; av.textContent = 'Vídeo en directo no disponible: ' + video.mensaje + '. Se muestran capturas.';
    cams.forEach(c => {
      const t = tiles.get(c.id); if (!t) return;
      t.dot.className = 'dot ' + (c.online === true ? 'on' : c.online === false ? 'off' : '');
      t.nopic.textContent = c.online === false ? 'Sin conexión' : 'Sin vista previa';
      const quiere = c.online === true && t.live && video.disponible && XmLive.soportado();
      if (quiere && !players.has(c.id)){
        t.vid.hidden = false;
        const p = new XmLive(t.vid, c.id + '_sd', { onFrame: () => { t.img.hidden = true; t.nopic.hidden = true; } });
        players.set(c.id, p); p.start();
      } else if (!quiere && players.has(c.id)){
        players.get(c.id).stop(); players.delete(c.id); t.vid.hidden = true;
        if (t.img.src) t.img.hidden = false;
      }
    });
  }

  /** Captura de cada cámara en línea (se repite cada 30 s). */
  function previas(){
    cams.forEach(c => {
      const t = tiles.get(c.id);
      if (!t || c.online !== true || players.has(c.id)) return;
      const img = new Image();
      img.onload = () => { t.img.src = img.src; t.img.hidden = false; t.nopic.hidden = true; };
      img.src = `/api/camaras/${c.id}/captura?t=${Date.now()}`;
    });
  }

  async function refrescar(forzar){
    try {
      const r = await api('/api/camaras');
      video = r.video; cams = r.camaras;
      const f = cams.map(c => c.id).join(',');
      if (forzar || f !== firma){ firma = f; render(); }
      aplicarEstado();
    } catch (_) { /* servidor no disponible un momento: se reintenta */ }
  }

  // Menú "Vista"
  const menu = $('menuVista');
  function pintaMenu(){
    menu.innerHTML = LAYOUTS.map((l, i) => `<button class="btn txt" style="display:block;width:100%;text-align:left" data-i="${i}" type="button">${i === layout ? '✓ ' : '&nbsp;&nbsp;&nbsp;'}${esc(l.label)}</button>`).join('');
    menu.querySelectorAll('button').forEach(b => b.onclick = () => {
      layout = +b.dataset.i; store.set('layout', layout); menu.hidden = true; render(); aplicarEstado(); previas();
    });
  }
  $('bVista').onclick = e => { e.stopPropagation(); pintaMenu(); menu.hidden = !menu.hidden; };
  document.addEventListener('click', () => { menu.hidden = true; });

  window.addEventListener('pagehide', pararTodos);
  (async () => {
    await refrescar(true);
    setTimeout(previas, 1500);
    setInterval(refrescar, 4000);
    setInterval(previas, 30000);
  })();
})();
