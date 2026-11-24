/**
 * Panel de la cámara ("Visor"): cajón flotante a la derecha en pantallas anchas y hoja que se arrastra en móvil
 * (cerrada · mitad · completa). Tres pestañas: Ajustes · Archivos · Más.
 * Ajustes agrupa los bloques de configuración de la cámara en 8 categorías (con buscador); "Más" reúne la
 * apariencia (12 temas), la conexión, las herramientas y las acciones.
 * Recuerda pestaña y categoría al cambiar de cámara (lo lee xmcam-app-video.js desde document.body.dataset).
 * API pública: window.XmPanel { abrir(tab, cat), cerrar(), alternar(), abierto() } y el evento "xm:panel".
 */
(function(){
  const { $, esc, store } = XM;
  const id = $('player').dataset.cam, pn = $('pn'), cuerpo = $('pnBody'), root = document.documentElement;
  const ancho = matchMedia('(min-width:900px),(min-width:700px) and (orientation:landscape)');
  const TABS = ['ajustes', 'archivos', 'mas'];

  /** Categorías de ajustes → bloques de configuración de la cámara ([título, bloque, filtro opcional]). */
  const CATS = [
    { id: 'img', t: 'Imagen', ic: 'sun', c: '#e8590c', d: 'Brillo, contraste, espejo, WDR, infrarrojos', kw: 'brillo contraste saturacion nitidez espejo giro voltear wdr noche dia infrarrojo luz imagen',
      b: [['Imagen', 'Camera.Param'], ['Imagen: extras', 'Camera.ParamEx']] },
    { id: 'vid', t: 'Vídeo y audio', ic: 'video', c: '#3b82f6', d: 'Códec, resolución, caudal y rótulos (OSD)', kw: 'resolucion fps bitrate caudal calidad h264 h265 codec audio microfono osd nombre hora texto rotulo',
      b: [['Codificación de vídeo', 'Simplify.Encode'], ['Texto en pantalla (OSD)', 'AVEnc.VideoWidget']] },
    { id: 'net', t: 'Red y Wi‑Fi', ic: 'net', c: '#10b981', d: 'IP, puerta, DNS, DHCP, puertos, Wi‑Fi, IPv6', kw: 'ip mascara puerta dns dhcp wifi wi-fi contrasena puerto ipv6 red cable ssid seguridad cifrado', especial: 'red' },
    { id: 'alm', t: 'Alarmas y eventos', ic: 'bell', c: '#ef4444', d: 'Movimiento, personas, ocultación, pérdida de vídeo', kw: 'movimiento persona sensibilidad zona horario aviso email grabar foto alarma ocultacion perdida',
      b: [['Alarma de movimiento', 'Detect.MotionDetect', 'Enable|EventHandler'], ['Alarma de persona', 'Detect.HumanDetection', 'Enable|EventHandler|Sensit'], ['Ocultación de la imagen', 'Detect.BlindDetect'], ['Pérdida de vídeo', 'Detect.LossDetect']] },
    { id: 'rec', t: 'Grabación y SD', ic: 'disk', c: '#8b5cf6', d: 'Modo, duración, horario, espacio y formateo', kw: 'grabacion modo continuo horario sd tarjeta formatear espacio borrar sobrescribir',
      b: [['Grabación', 'Record'], ['Almacenamiento (SD)', 'StorageInfo']] },
    { id: 'ptz', t: 'Motor PTZ', ic: 'move', c: '#f59e0b', d: 'Protocolo, dirección y velocidad del motor', kw: 'ptz motor protocolo pelco direccion velocidad giro', b: [['PTZ (protocolo)', 'Uart.PTZ']] },
    { id: 'svc', t: 'Email y FTP', ic: 'mail', c: '#14b8a6', d: 'Avisos por correo y subida de fotos', kw: 'email correo smtp ftp servidor usuario contrasena', b: [['Email (SMTP)', 'NetWork.NetEmail'], ['FTP', 'NetWork.NetFTP']] },
    { id: 'sys', t: 'Sistema y hora', ic: 'clock', c: '#64748b', d: 'Hora, NTP, idioma, reinicio automático', kw: 'hora ntp zona idioma fecha formato reinicio mantenimiento borrado automatico',
      b: [['Hora y NTP', 'NetWork.NetNTP'], ['Idioma y fecha', 'General.Location'], ['Mantenimiento automático', 'General.AutoMaintain']] }
  ];
  const ICONOS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M22 8l-6 4 6 4z"/>', net: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>', disk: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  const svg = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] || ''}</svg>`;
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const S = { open: false, tab: 'ajustes', cat: null, vis: 0 };
  const medio = () => Math.round(innerHeight * 0.5);

  // ---------------------------------------------------------------- abrir, cerrar y colocar el panel
  /** Coloca el panel: en pantallas anchas es un cajón (--hr reserva su ancho); en móvil se muestra "vis" píxeles de alto (--hb). */
  function colocar(vis, sinAnim){
    const abierto = S.open;
    pn.classList.toggle('open', abierto);
    if (ancho.matches){
      pn.style.removeProperty('--y'); root.style.setProperty('--hb', '0px');
      root.style.setProperty('--hr', abierto ? (pn.offsetWidth + 24) + 'px' : '0px');
      document.body.classList.remove('pn-full'); return;
    }
    root.style.setProperty('--hr', '0px');
    const H = pn.offsetHeight; S.vis = abierto ? Math.max(0, Math.min(H, vis === undefined ? S.vis || medio() : vis)) : 0;
    pn.style.setProperty('--y', (H - S.vis) + 'px'); root.style.setProperty('--hb', S.vis + 'px');
    document.body.classList.toggle('pn-full', S.vis > medio() + 24);
  }
  function aviso(){ document.dispatchEvent(new CustomEvent('xm:panel', { detail: { open: S.open } })); }
  function abrir(tab, cat){
    if (tab) pestana(tab);
    if (tab === 'ajustes' && cat) abreCat(cat); else if (tab === 'ajustes' && !cat && S.cat === null) cierraCat();
    S.open = true; store.set('panelAbierto', '1'); document.body.classList.remove('vmax'); colocar(S.vis || medio()); aviso();
  }
  function cerrar(){ S.open = false; store.set('panelAbierto', '0'); colocar(0); aviso(); }
  const alternar = () => S.open ? cerrar() : abrir();
  $('pnX').onclick = cerrar;
  window.XmPanel = { abrir, cerrar, alternar, abierto: () => S.open };
  addEventListener('resize', () => colocar(S.vis));
  ancho.addEventListener && ancho.addEventListener('change', () => { S.vis = 0; colocar(medio()); });

  // ---------------------------------------------------------------- arrastre de la hoja (solo móvil)
  (function arrastre(){
    let d = null;
    const ini = e => { if (ancho.matches || e.target.closest('button')) return; d = { y: e.clientY, v: S.vis, t: Date.now(), mov: false }; pn.classList.add('drag'); e.currentTarget.setPointerCapture(e.pointerId); };
    const mov = e => { if (!d) return; const dy = d.y - e.clientY; if (Math.abs(dy) > 4) d.mov = true; if (d.mov) colocar(d.v + dy); };
    const fin = e => {
      if (!d) return; pn.classList.remove('drag'); const H = pn.offsetHeight, v = (d.y - e.clientY) / Math.max(1, Date.now() - d.t), cand = [0, medio(), H];
      let best;
      if (!d.mov) best = S.vis < medio() - 10 ? medio() : S.vis < H - 10 ? H : medio();   // un toque sube un escalón
      else { const p = S.vis + v * 160; best = cand.sort((a, b) => Math.abs(a - p) - Math.abs(b - p))[0]; }
      d = null; if (best === 0) cerrar(); else { S.open = true; colocar(best); }
    };
    ['pnGrab', 'pnHead'].forEach(n => { const el = $(n); el.addEventListener('pointerdown', ini); el.addEventListener('pointermove', mov); el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin); });
    $('pnGrab').addEventListener('keydown', e => {
      if (e.key === 'ArrowUp') colocar(S.vis < medio() - 10 ? medio() : pn.offsetHeight); else if (e.key === 'ArrowDown'){ if (S.vis > medio() + 10) colocar(medio()); else cerrar(); }
    });
  })();

  // ---------------------------------------------------------------- pestañas
  function pestana(t){
    if (!TABS.includes(t)) t = 'ajustes';
    S.tab = t; document.body.dataset.tab = t; store.set('appTab', t);
    $('pnTabs').querySelectorAll('[data-t]').forEach(b => { const on = b.dataset.t === t; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on); });
    cuerpo.querySelectorAll('.pp').forEach(p => { p.hidden = p.dataset.t !== t; });
    cuerpo.scrollTop = 0;
  }
  $('pnTabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b){ pestana(b.dataset.t); if (!S.open) abrir(); } });

  // ---------------------------------------------------------------- Ajustes: categorías
  function pintaLista(q){
    const n = norm(q || '').trim(), L = CATS.filter(c => !n || norm(c.t + ' ' + c.d + ' ' + c.kw).includes(n));
    $('catLista').innerHTML = L.map(c => `<button type="button" class="tl" data-c="${c.id}"><span class="ic" style="background:${c.c}">${svg(c.ic)}</span><b>${esc(c.t)}</b><small>${esc(c.d)}</small></button>`).join('')
      || `<div class="empty">Sin resultados para «${esc(q)}». Prueba con «wifi», «ip», «sensibilidad» o «audio».</div>`;
  }
  $('ajBuscar').addEventListener('input', e => pintaLista(e.target.value));
  $('catLista').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) abreCat(b.dataset.c); });
  $('ajVolver').onclick = () => cierraCat();

  function cierraCat(){ S.cat = null; delete document.body.dataset.cat; guardaRed(); $('ajCat').hidden = true; $('ajLista').hidden = false; cuerpo.scrollTop = 0; }
  /** Devuelve el editor de red a su sitio oculto para que no se pierda al cambiar de categoría. */
  function guardaRed(){ const r = $('redPro'); if (r && r.parentElement !== $('redStash')) $('redStash').appendChild(r); }

  function abreCat(cid){
    const c = CATS.find(x => x.id === cid); if (!c) return;
    S.cat = cid; document.body.dataset.cat = cid; guardaRed();
    $('ajLista').hidden = true; $('ajCat').hidden = false; $('catTitulo').textContent = c.t; $('catDesc').textContent = c.d;
    const cu = $('catCuerpo'); cu.innerHTML = '';
    if (c.especial === 'red'){
      cu.appendChild($('redPro')); if (window.XmRed) XmRed.abrir();
    } else {
      c.b.forEach(([t, n, f], i) => {
        const d = document.createElement('details'); d.className = 'hblk'; d.open = i === 0;
        d.innerHTML = `<summary><b>${esc(t)}</b><small class="mut">${esc(n)}</small></summary><div class="hblk-b"></div>`;
        const montar = () => { if (d.dataset.listo) return; d.dataset.listo = '1'; XmConfig.mount(d.querySelector('.hblk-b'), { id, name: n, filter: f || null, titulo: false }); };
        d.addEventListener('toggle', () => { if (d.open) montar(); }); if (d.open) montar();
        cu.appendChild(d);
      });
    }
    cuerpo.scrollTop = 0;
  }

  // ---------------------------------------------------------------- Más: apariencia
  function pintaTemas(){
    const cur = store.get('theme', 'NVR_DARK');
    $('temas').innerHTML = XM.THEMES.map(t => `<button type="button" class="thm${t.id === cur ? ' sel' : ''}" data-id="${t.id}" title="${esc(t.desc)}" style="--c:${t.c}"><i></i>${esc(t.label)}</button>`).join('');
    $('tSeguir').checked = store.get('follow', 'true') === 'true';
  }
  $('temas').addEventListener('click', e => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    store.set('theme', b.dataset.id); store.set('follow', 'false'); XM.applyTheme(); pintaTemas();
  });
  $('tSeguir').onchange = e => { store.set('follow', e.target.checked ? 'true' : 'false'); XM.applyTheme(); };

  // ---------------------------------------------------------------- arranque
  pintaLista(''); pintaTemas();
  const qp = new URLSearchParams(location.search);
  const legado = { grab: 'archivos', camaras: 'ajustes', info: 'mas' };
  let tab = qp.get('tab') || ({ ajustes: 'ajustes', info: 'mas' })[qp.get('panel')] || '';
  tab = legado[tab] || tab;
  const pedido = !!(tab || qp.get('cat') || qp.get('panel'));
  pestana(TABS.includes(tab) ? tab : store.get('appTab', 'ajustes'));
  const cat = qp.get('cat'); if (S.tab === 'ajustes' && cat) abreCat(cat);
  requestAnimationFrame(() => {
    S.open = pedido || (ancho.matches && store.get('panelAbierto', '1') === '1');
    colocar(medio()); aviso();
  });
})();
