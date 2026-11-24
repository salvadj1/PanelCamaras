/**
 * Hoja deslizante del directo ("Panel deslizante"): en móvil se arrastra entre tres alturas (asomada, media, completa);
 * en pantallas anchas es un panel lateral fijo. Pestañas: Cámaras · Ajustes · Grabaciones · Más.
 * Ajustes agrupa los bloques de configuración de la cámara en 8 categorías y busca por palabras ("wifi", "ip"…).
 * Recuerda pestaña y categoría al cambiar de cámara (lo lee xmcam-topcams.js desde document.body.dataset).
 */
(function(){
  const { $, esc, store, api } = XM;
  const id = $('player').dataset.cam, hoja = $('hoja'), cuerpo = $('hojaBody');
  const ancho = matchMedia('(min-width:900px),(min-width:700px) and (orientation:landscape)');
  const PEEK = 96;   // alto visible de la hoja "asomada": asa + pestañas

  /** Categorías de ajustes → bloques de configuración de la cámara ([título, bloque, filtro opcional]). */
  const CATS = [
    { id: 'img', t: 'Imagen', ic: 'sun', d: 'Brillo, contraste, espejo, WDR, infrarrojos', kw: 'brillo contraste saturacion nitidez espejo giro voltear wdr noche dia infrarrojo luz imagen',
      b: [['Imagen', 'Camera.Param'], ['Imagen: extras', 'Camera.ParamEx']] },
    { id: 'vid', t: 'Vídeo y audio', ic: 'video', d: 'Códec, resolución, caudal y rótulos (OSD)', kw: 'resolucion fps bitrate caudal calidad h264 h265 codec audio microfono osd nombre hora texto rotulo',
      b: [['Codificación de vídeo', 'Simplify.Encode'], ['Texto en pantalla (OSD)', 'AVEnc.VideoWidget']] },
    { id: 'net', t: 'Red y Wi‑Fi', ic: 'net', d: 'IP, máscara, puerta, DNS, DHCP, puertos, Wi‑Fi, IPv6', kw: 'ip mascara puerta dns dhcp wifi wi-fi contrasena puerto ipv6 red cable ssid seguridad cifrado', especial: 'red' },
    { id: 'alm', t: 'Alarmas y eventos', ic: 'bell', d: 'Movimiento, personas, ocultación, pérdida de vídeo', kw: 'movimiento persona sensibilidad zona horario aviso email grabar foto alarma ocultacion perdida',
      b: [['Alarma de movimiento', 'Detect.MotionDetect', 'Enable|EventHandler'], ['Alarma de persona', 'Detect.HumanDetection', 'Enable|EventHandler|Sensit'], ['Ocultación de la imagen', 'Detect.BlindDetect'], ['Pérdida de vídeo', 'Detect.LossDetect']] },
    { id: 'rec', t: 'Grabación y tarjeta SD', ic: 'disk', d: 'Modo, duración, horario, espacio y formateo', kw: 'grabacion modo continuo horario sd tarjeta formatear espacio borrar sobrescribir',
      b: [['Grabación', 'Record'], ['Almacenamiento (SD)', 'StorageInfo']] },
    { id: 'ptz', t: 'Motor PTZ', ic: 'move', d: 'Protocolo, dirección y velocidad del motor', kw: 'ptz motor protocolo pelco direccion velocidad giro', b: [['PTZ (protocolo)', 'Uart.PTZ']] },
    { id: 'svc', t: 'Email y FTP', ic: 'mail', d: 'Avisos por correo y subida de fotos a un servidor', kw: 'email correo smtp ftp servidor usuario contrasena', b: [['Email (SMTP)', 'NetWork.NetEmail'], ['FTP', 'NetWork.NetFTP']] },
    { id: 'sys', t: 'Sistema y hora', ic: 'clock', d: 'Hora, NTP, idioma, formato de fecha, reinicio automático', kw: 'hora ntp zona idioma fecha formato reinicio mantenimiento borrado automatico',
      b: [['Hora y NTP', 'NetWork.NetNTP'], ['Idioma y fecha', 'General.Location'], ['Mantenimiento automático', 'General.AutoMaintain']] }
  ];
  const ICONOS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M22 8l-6 4 6 4z"/>', net: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>', disk: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  const svg = (n, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] || ''}</svg>`;
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const S = { tab: 'ajustes', cat: null, snap: 'peek', cams: null };

  // ---------------------------------------------------------------- altura de la hoja (3 posiciones)
  const pos = s => { const H = hoja.offsetHeight; return s === 'peek' ? Math.max(0, H - PEEK) : s === 'half' ? Math.round(H * 0.46) : 0; };
  function snap(s, guardar){
    S.snap = s; if (guardar !== false) store.set('hojaSnap', s);
    if (ancho.matches){ hoja.style.transform = ''; $('camfull').style.setProperty('--hv', '0px'); return; }
    hoja.style.transform = `translateY(${pos(s)}px)`;
    $('camfull').style.setProperty('--hv', (s === 'peek' || s === 'full' ? PEEK : hoja.offsetHeight - pos(s)) + 'px');
  }
  (function arrastre(){
    let d = null;
    const ini = e => { if (ancho.matches || e.target.closest('button')) return; d = { y: e.clientY, p: pos(S.snap), t: Date.now(), cur: null }; hoja.classList.add('drag'); e.currentTarget.setPointerCapture(e.pointerId); };
    const mov = e => { if (!d) return; d.cur = Math.max(0, Math.min(pos('peek'), d.p + e.clientY - d.y)); hoja.style.transform = `translateY(${d.cur}px)`; };
    const fin = e => {
      if (!d) return; hoja.classList.remove('drag');
      let best;
      if (d.cur === null) best = S.snap === 'peek' ? 'half' : S.snap === 'half' ? 'full' : 'half';   // un toque sube un escalón
      else { const v = (e.clientY - d.y) / Math.max(1, Date.now() - d.t); best = ['peek', 'half', 'full'].sort((a, b) => Math.abs(pos(a) - d.cur - v * 120) - Math.abs(pos(b) - d.cur - v * 120))[0]; }
      d = null; snap(best);
    };
    ['hojaGrab', 'hojaTabs'].forEach(n => { const el = $(n); el.addEventListener('pointerdown', ini); el.addEventListener('pointermove', mov); el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin); });
    $('hojaGrab').addEventListener('keydown', e => { if (e.key === 'ArrowUp') snap(S.snap === 'peek' ? 'half' : 'full'); else if (e.key === 'ArrowDown') snap(S.snap === 'full' ? 'half' : 'peek'); });
  })();
  addEventListener('resize', () => snap(S.snap, false));
  ancho.addEventListener && ancho.addEventListener('change', () => snap(S.snap, false));

  // ---------------------------------------------------------------- pestañas
  function pestana(t, mantener){
    S.tab = t; document.body.dataset.tab = t; store.set('hojaTab', t);
    $('hojaTabs').querySelectorAll('[data-t]').forEach(b => { const on = b.dataset.t === t; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on); });
    cuerpo.querySelectorAll('.hp').forEach(p => { p.hidden = p.dataset.t !== t; });
    if (t === 'camaras') pintaCams();
    if (!mantener && !ancho.matches && S.snap === 'peek') snap('half');
    cuerpo.scrollTop = 0;
  }
  $('hojaTabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; if (b.dataset.t === S.tab && S.snap === 'peek' && !ancho.matches) snap('half'); else pestana(b.dataset.t); });

  // ---------------------------------------------------------------- Cámaras
  async function pintaCams(){
    if (!S.cams){
      try { S.cams = (await api('/api/camaras')).camaras; } catch (_) { $('hCams').textContent = 'No se pudo cargar la lista.'; return; }
    }
    $('hCams').innerHTML = S.cams.map(c => `<a class="ccard${c.id === id ? ' cur' : ''}" href="${destino(c.id)}" data-id="${esc(c.id)}">
      <img alt="" loading="lazy" src="/api/camaras/${esc(c.id)}/captura?t=${Math.floor(Date.now() / 20000)}" onerror="this.style.visibility='hidden'">
      <span class="tt"><b>${esc(c.nombre)}</b><small>${esc(c.host)}</small><small><i class="dot ${c.online ? 'ok' : 'ko'}"></i>${c.online ? 'En línea' : 'Sin conexión'}${c.id === id ? ' · viendo ahora' : ''}</small></span><span class="chv">›</span></a>`).join('');
  }
  /** Dirección de la misma pestaña/categoría en otra cámara. */
  function destino(n){ return '/camara/' + n + (S.tab === 'ajustes' && S.cat ? '?tab=ajustes&cat=' + S.cat : S.tab !== 'camaras' ? '?tab=' + S.tab : ''); }

  // ---------------------------------------------------------------- Ajustes: lista y categorías
  const fondo = { img: '#e8590c', vid: '#3b82f6', net: '#10b981', alm: '#ef4444', rec: '#8b5cf6', ptz: '#f59e0b', svc: '#14b8a6', sys: '#64748b' };
  function pintaLista(q){
    const n = norm(q || '').trim(), L = CATS.filter(c => !n || norm(c.t + ' ' + c.d + ' ' + c.kw).includes(n));
    $('catLista').innerHTML = L.map(c => `<button type="button" class="lr" data-c="${c.id}"><span class="sq" style="background:${fondo[c.id]}">${svg(c.ic)}</span><span class="tt"><b>${esc(c.t)}</b><small>${esc(c.d)}</small></span><span class="chv">›</span></button>`).join('')
      || `<div class="empty">Sin resultados para «${esc(q)}». Prueba con «wifi», «ip», «sensibilidad» o «audio».</div>`;
  }
  $('ajBuscar').addEventListener('input', e => pintaLista(e.target.value));
  $('catLista').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) abreCat(b.dataset.c); });
  $('ajVolver').onclick = () => cierraCat();
  $('catChips').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) abreCat(b.dataset.c); });

  function cierraCat(){ S.cat = null; delete document.body.dataset.cat; guardaRed(); $('ajCat').hidden = true; $('ajLista').hidden = false; cuerpo.scrollTop = 0; }
  /** Devuelve el editor de red a su sitio oculto para que no se pierda al cambiar de categoría. */
  function guardaRed(){ const r = $('redPro'); if (r && r.parentElement !== $('redStash')) $('redStash').appendChild(r); }

  function abreCat(cid){
    const c = CATS.find(x => x.id === cid); if (!c) return;
    S.cat = cid; document.body.dataset.cat = cid; guardaRed();
    $('ajLista').hidden = true; $('ajCat').hidden = false; $('catTitulo').textContent = c.t; $('catDesc').textContent = c.d;
    $('catChips').innerHTML = CATS.map(k => `<button type="button" class="chip${k.id === cid ? ' sel' : ''}" data-c="${k.id}">${esc(k.t)}</button>`).join('');
    const cu = $('catCuerpo'); cu.innerHTML = '';
    if (c.especial === 'red'){
      cu.appendChild($('redPro')); const it = $('redIt'); if (it && $('redBody').hidden) it.querySelector('.ac-h').click();
    } else {
      c.b.forEach(([t, n, f], i) => {
        const d = document.createElement('details'); d.className = 'hblk'; d.open = i === 0;
        d.innerHTML = `<summary><b>${esc(t)}</b><small class="mut">${esc(n)}</small></summary><div class="hblk-b"></div>`;
        const montar = () => { if (d.dataset.listo) return; d.dataset.listo = '1'; XmConfig.mount(d.querySelector('.hblk-b'), { id, name: n, filter: f || null, titulo: false }); };
        d.addEventListener('toggle', () => { if (d.open) montar(); }); if (d.open) montar();
        cu.appendChild(d);
      });
    }
    if (!ancho.matches && S.snap === 'peek') snap('half');
    cuerpo.scrollTop = 0;
  }

  // ---------------------------------------------------------------- API pública y arranque
  window.XmHoja = { abrir(tab, cat){ pestana(tab, true); if (tab === 'ajustes' && cat) abreCat(cat); if (!ancho.matches && S.snap === 'peek') snap('half'); } };

  fetch('/api/camaras').then(r => r.json()).then(r => { const c = (r.camaras || []).find(x => x.id === id); $('ajNombre').textContent = c ? c.nombre : ''; }).catch(() => {});
  pintaLista('');
  const qp = new URLSearchParams(location.search);
  let tab = qp.get('tab') || ({ ajustes: 'ajustes', info: 'mas' })[qp.get('panel')] || store.get('hojaTab', 'ajustes');
  if (!['camaras', 'ajustes', 'grab', 'mas'].includes(tab)) tab = 'ajustes';
  const sn = store.get('hojaSnap', 'peek');
  S.snap = ['peek', 'half', 'full'].includes(sn) ? sn : 'peek';
  requestAnimationFrame(() => {
    pestana(tab, true);
    const cat = qp.get('cat'); if (tab === 'ajustes' && cat) abreCat(cat);
    snap((qp.get('tab') || qp.get('panel')) && !ancho.matches ? 'half' : S.snap, false);
  });
})();
